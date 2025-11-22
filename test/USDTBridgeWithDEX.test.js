const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("USDTBridgeWithDEX", function () {
  let bridge;
  let mockUsdt;
  let mockSwapRouter;
  let mockEndpoint;
  let owner;
  let user1;
  let user2;

  const MOCK_WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
  const DST_EID = 30184; // Base

  // Helper function to convert address to bytes32
  function addressToBytes32(addr) {
    return ethers.zeroPadValue(addr, 32);
  }

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy Mock USDT
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdt = await MockERC20.deploy("Mock USDT", "USDT", 6);
    await mockUsdt.waitForDeployment();

    // Deploy Mock Swap Router
    const MockSwapRouter = await ethers.getContractFactory("MockSwapRouter");
    mockSwapRouter = await MockSwapRouter.deploy();
    await mockSwapRouter.waitForDeployment();

    // Deploy Mock LayerZero Endpoint
    const MockEndpoint = await ethers.getContractFactory("MockEndpoint");
    mockEndpoint = await MockEndpoint.deploy();
    await mockEndpoint.waitForDeployment();

    // Deploy Bridge
    const USDTBridgeWithDEX = await ethers.getContractFactory("USDTBridgeWithDEX");
    bridge = await USDTBridgeWithDEX.deploy(
      await mockEndpoint.getAddress(),
      await mockUsdt.getAddress(),
      await mockSwapRouter.getAddress(),
      MOCK_WETH,
      owner.address
    );
    await bridge.waitForDeployment();

    // Set peer for destination chain (THIS FIXES THE NoPeer ERROR)
    const bridgeAddress = await bridge.getAddress();
    await bridge.connect(owner).setPeer(DST_EID, addressToBytes32(bridgeAddress));

    // Mint USDT to users
    await mockUsdt.mint(user1.address, ethers.parseUnits("10000", 6));
    await mockUsdt.mint(user2.address, ethers.parseUnits("10000", 6));
  });

  describe("Deployment", function () {
    it("Should set correct USDT address", async function () {
      expect(await bridge.usdt()).to.equal(await mockUsdt.getAddress());
    });

    it("Should set correct swap router", async function () {
      expect(await bridge.swapRouter()).to.equal(await mockSwapRouter.getAddress());
    });

    it("Should set correct WETH address", async function () {
      expect(await bridge.weth()).to.equal(MOCK_WETH);
    });

    it("Should set correct owner", async function () {
      expect(await bridge.owner()).to.equal(owner.address);
    });

    it("Should have correct fee (0.3%)", async function () {
      expect(await bridge.FEE_BPS()).to.equal(30);
    });

    it("Should have peer configured", async function () {
      const bridgeAddress = await bridge.getAddress();
      const peer = await bridge.peers(DST_EID);
      expect(peer).to.equal(addressToBytes32(bridgeAddress));
    });
  });

  describe("ETH Deposits", function () {
    it("Should allow ETH deposits", async function () {
      const depositAmount = ethers.parseEther("1");
      
      await expect(bridge.connect(user1).depositETH({ value: depositAmount }))
        .to.emit(bridge, "ETHDeposited")
        .withArgs(user1.address, depositAmount);

      expect(await bridge.ethDeposits(user1.address)).to.equal(depositAmount);
    });

    it("Should reject zero ETH deposits", async function () {
      await expect(bridge.connect(user1).depositETH({ value: 0 }))
        .to.be.revertedWith("Must deposit ETH");
    });

    it("Should allow ETH withdrawals", async function () {
      const depositAmount = ethers.parseEther("1");
      const withdrawAmount = ethers.parseEther("0.5");

      await bridge.connect(user1).depositETH({ value: depositAmount });
      
      await expect(bridge.connect(user1).withdrawETH(withdrawAmount))
        .to.emit(bridge, "ETHWithdrawn")
        .withArgs(user1.address, withdrawAmount);

      expect(await bridge.ethDeposits(user1.address)).to.equal(depositAmount - withdrawAmount);
    });

    it("Should reject withdrawals exceeding balance", async function () {
      const depositAmount = ethers.parseEther("1");
      const withdrawAmount = ethers.parseEther("2");

      await bridge.connect(user1).depositETH({ value: depositAmount });
      
      await expect(bridge.connect(user1).withdrawETH(withdrawAmount))
        .to.be.revertedWith("Insufficient balance");
    });
  });

  describe("Bridge Function", function () {
    beforeEach(async function () {
      // Approve bridge to spend USDT
      await mockUsdt.connect(user1).approve(
        await bridge.getAddress(),
        ethers.parseUnits("10000", 6)
      );
    });

    it("Should reject zero amount", async function () {
      await expect(
        bridge.connect(user1).bridge(
          DST_EID,
          user2.address,
          0,
          "0x",
          { value: ethers.parseEther("0.01") }
        )
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("Should calculate correct fees", async function () {
      const amount = ethers.parseUnits("1000", 6);
      const expectedFee = (amount * 30n) / 10000n; // 0.3%
      
      const initialFees = await bridge.collectedFees();
      
      await bridge.connect(user1).bridge(
        DST_EID,
        user2.address,
        amount,
        "0x",
        { value: ethers.parseEther("0.01") }
      );

      const finalFees = await bridge.collectedFees();
      expect(finalFees - initialFees).to.equal(expectedFee);
    });

    it("Should transfer USDT from user to bridge", async function () {
      const amount = ethers.parseUnits("1000", 6);
      
      const initialUserBalance = await mockUsdt.balanceOf(user1.address);
      const initialBridgeBalance = await mockUsdt.balanceOf(await bridge.getAddress());

      await bridge.connect(user1).bridge(
        DST_EID,
        user2.address,
        amount,
        "0x",
        { value: ethers.parseEther("0.01") }
      );

      const finalUserBalance = await mockUsdt.balanceOf(user1.address);
      const finalBridgeBalance = await mockUsdt.balanceOf(await bridge.getAddress());

      expect(initialUserBalance - finalUserBalance).to.equal(amount);
      expect(finalBridgeBalance - initialBridgeBalance).to.equal(amount);
    });

    it("Should emit BridgeInitiated event", async function () {
      const amount = ethers.parseUnits("1000", 6);
      const expectedAmountAfterFee = amount - (amount * 30n) / 10000n;

      await expect(
        bridge.connect(user1).bridge(
          DST_EID,
          user2.address,
          amount,
          "0x",
          { value: ethers.parseEther("0.01") }
        )
      ).to.emit(bridge, "BridgeInitiated");
    });
  });

  describe("Fee Withdrawal", function () {
    beforeEach(async function () {
      await mockUsdt.connect(user1).approve(
        await bridge.getAddress(),
        ethers.parseUnits("10000", 6)
      );

      // Create some fees
      await bridge.connect(user1).bridge(
        DST_EID,
        user2.address,
        ethers.parseUnits("1000", 6),
        "0x",
        { value: ethers.parseEther("0.01") }
      );
    });

    it("Should allow owner to withdraw fees", async function () {
      const fees = await bridge.collectedFees();
      const initialOwnerBalance = await mockUsdt.balanceOf(owner.address);

      await bridge.connect(owner).withdrawFees();

      const finalOwnerBalance = await mockUsdt.balanceOf(owner.address);
      expect(finalOwnerBalance - initialOwnerBalance).to.equal(fees);
      expect(await bridge.collectedFees()).to.equal(0);
    });

    it("Should reject non-owner fee withdrawal", async function () {
      await expect(bridge.connect(user1).withdrawFees())
        .to.be.reverted;
    });
  });

  describe("Peer Configuration", function () {
    it("Should allow owner to set peer", async function () {
      const newPeer = addressToBytes32(user2.address);
      const newEid = 30111; // Optimism

      await bridge.connect(owner).setPeer(newEid, newPeer);

      expect(await bridge.peers(newEid)).to.equal(newPeer);
    });

    it("Should reject non-owner setting peer", async function () {
      const newPeer = addressToBytes32(user2.address);
      const newEid = 30111;

      await expect(bridge.connect(user1).setPeer(newEid, newPeer))
        .to.be.reverted;
    });
  });

  describe("Receive ETH", function () {
    it("Should accept direct ETH transfers", async function () {
      const amount = ethers.parseEther("1");
      
      await owner.sendTransaction({
        to: await bridge.getAddress(),
        value: amount
      });

      expect(await ethers.provider.getBalance(await bridge.getAddress())).to.equal(amount);
    });
  });
});