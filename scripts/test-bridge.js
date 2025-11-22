// scripts/test-bridge.js
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  const [user] = await ethers.getSigners();
  
  // Load bridge
  const bridge = await ethers.getContractAt(
    "USDTBridgeWithDEX",
    deployments[hre.network.name].bridge
  );
  
  // 1. Deposit ETH for swaps (one time)
  console.log("\n💰 Depositing ETH for swaps...");
  const depositTx = await bridge.depositETH({
    value: ethers.parseEther("0.5") // 0.5 ETH
  });
  await depositTx.wait();
  console.log("✅ Deposited 0.5 ETH");
  
  // 2. Approve USDT
  console.log("\n✅ Approving USDT...");
  const usdt = await ethers.getContractAt(
    "IERC20",
    deployments[hre.network.name].usdt
  );
  
  const approveTx = await usdt.approve(
    await bridge.getAddress(),
    ethers.MaxUint256
  );
  await approveTx.wait();
  console.log("✅ USDT approved");
  
  // 3. Quote fee
  const destChain = 30184; // Base
  const amount = ethers.parseUnits("100", 6); // 100 USDT
  
  console.log("\n💵 Quoting bridge fee...");
  const fee = await bridge.quoteBridgeFee(destChain, amount);
  console.log("Fee:", ethers.formatEther(fee), "ETH");
  
  // 4. Bridge
  console.log("\n🌉 Bridging 100 USDT to Base...");
  const bridgeTx = await bridge.bridge(
    destChain,
    user.address,
    amount,
    "0x",
    { value: fee }
  );
  
  const receipt = await bridgeTx.wait();
  console.log("✅ Bridge initiated!");
  console.log("Transaction:", receipt.hash);
  console.log("\n🔍 Track at: https://layerzeroscan.com/");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });