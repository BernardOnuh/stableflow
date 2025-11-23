// scripts/add-liquidity.js
// Script for users to become LPs and earn fees

const hre = require("hardhat");

async function main() {
  console.log("\n💰 Add Liquidity to Bridge");
  console.log("===========================");
  
  const [signer] = await ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Network:", network);
  console.log("Your address:", signer.address);
  console.log("");
  
  // Configuration
  const AMOUNT = process.env.AMOUNT || "1000"; // Default 1000 USDT
  
  // Load deployments
  const fs = require('fs');
  const deployments = JSON.parse(fs.readFileSync('deployments-lp-testnet.json', 'utf8'));
  
  if (!deployments[network]) {
    console.error("❌ No deployment found for", network);
    process.exit(1);
  }
  
  const bridge = await ethers.getContractAt(
    "BridgeWithLPs",
    deployments[network].bridge
  );
  
  const usdt = await ethers.getContractAt(
    "MockUSDT",
    deployments[network].usdt
  );
  
  // Step 1: Check current position
  console.log("📊 Your Current LP Position:");
  console.log("-".repeat(50));
  const position = await bridge.getLPPosition(signer.address);
  console.log("Shares owned:", ethers.formatUnits(position.shares, 6));
  console.log("USDT value:", ethers.formatUnits(position.usdtValue, 6), "USDT");
  console.log("Pool ownership:", (Number(position.percentageOwnership) / 100).toFixed(2), "%");
  
  const earnings = await bridge.getLPEarnings(signer.address);
  console.log("Fees earned:", ethers.formatUnits(earnings, 6), "USDT");
  console.log("");
  
  // Step 2: Check USDT balance
  console.log("💵 Checking USDT Balance:");
  console.log("-".repeat(50));
  const balance = await usdt.balanceOf(signer.address);
  console.log("Your USDT:", ethers.formatUnits(balance, 6), "USDT");
  
  const amountWei = ethers.parseUnits(AMOUNT, 6);
  
  if (balance < amountWei) {
    console.log("\n⚠️  Not enough USDT!");
    console.log("Getting", AMOUNT, "USDT from faucet...");
    
    // Try to mint
    try {
      const mintTx = await usdt.mint(signer.address, amountWei);
      await mintTx.wait();
      console.log("✅ Minted", AMOUNT, "USDT");
    } catch (e) {
      console.log("❌ Could not mint. Use faucet() function instead.");
      process.exit(1);
    }
  }
  console.log("");
  
  // Step 3: Get pool stats before
  console.log("📊 Pool Stats (Before):");
  console.log("-".repeat(50));
  const statsBefore = await bridge.getStats();
  console.log("Total Liquidity:", ethers.formatUnits(statsBefore._totalLiquidity, 6), "USDT");
  console.log("LP Fee Pool:", ethers.formatUnits(statsBefore._lpFeePool, 6), "USDT");
  console.log("Total Shares:", ethers.formatUnits(statsBefore._totalShares, 6));
  console.log("Total Bridged:", ethers.formatUnits(statsBefore._totalBridged, 6), "USDT");
  console.log("Total Transactions:", statsBefore._totalTransactions.toString());
  
  const apy = await bridge.estimateAPY();
  console.log("Estimated APY:", (Number(apy) / 100).toFixed(2), "%");
  console.log("");
  
  // Step 4: Approve USDT
  console.log("✅ Approving USDT...");
  const allowance = await usdt.allowance(signer.address, deployments[network].bridge);
  
  if (allowance < amountWei) {
    const approveTx = await usdt.approve(
      deployments[network].bridge,
      ethers.MaxUint256
    );
    await approveTx.wait();
    console.log("✅ USDT approved");
  } else {
    console.log("✅ Already approved");
  }
  console.log("");
  
  // Step 5: Add liquidity
  console.log("💰 Adding Liquidity...");
  console.log("-".repeat(50));
  console.log("Amount:", AMOUNT, "USDT");
  console.log("");
  
  try {
    const tx = await bridge.addLiquidity(amountWei);
    console.log("Transaction sent:", tx.hash);
    console.log("⏳ Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("");
    
    // Parse event
    for (const log of receipt.logs) {
      try {
        const parsed = bridge.interface.parseLog(log);
        if (parsed && parsed.name === "LiquidityAdded") {
          console.log("📋 Liquidity Added:");
          console.log("   Amount:", ethers.formatUnits(parsed.args.amount, 6), "USDT");
          console.log("   Shares received:", ethers.formatUnits(parsed.args.shares, 6));
        }
      } catch (e) {}
    }
    
    console.log("");
    
    // Step 6: Show updated position
    console.log("📊 Your Updated LP Position:");
    console.log("-".repeat(50));
    const newPosition = await bridge.getLPPosition(signer.address);
    console.log("Shares owned:", ethers.formatUnits(newPosition.shares, 6));
    console.log("USDT value:", ethers.formatUnits(newPosition.usdtValue, 6), "USDT");
    console.log("Pool ownership:", (Number(newPosition.percentageOwnership) / 100).toFixed(2), "%");
    console.log("");
    
    // Step 7: Show pool stats after
    console.log("📊 Pool Stats (After):");
    console.log("-".repeat(50));
    const statsAfter = await bridge.getStats();
    console.log("Total Liquidity:", ethers.formatUnits(statsAfter._totalLiquidity, 6), "USDT");
    console.log("Available Liquidity:", ethers.formatUnits(statsAfter._availableLiquidity, 6), "USDT");
    console.log("LP Fee Pool:", ethers.formatUnits(statsAfter._lpFeePool, 6), "USDT");
    console.log("Total Shares:", ethers.formatUnits(statsAfter._totalShares, 6));
    console.log("");
    
    console.log("=".repeat(50));
    console.log("🎉 SUCCESS! You're now an LP!");
    console.log("=".repeat(50));
    console.log("");
    console.log("💡 How to earn:");
    console.log("   - You earn 0.05% of every bridge transaction");
    console.log("   - Fees automatically added to LP pool");
    console.log("   - Withdraw anytime to claim fees + principal");
    console.log("");
    console.log("📊 Monitor earnings:");
    console.log("   npx hardhat run scripts/check-lp-position.js --network", network);
    console.log("");
    console.log("💸 Withdraw liquidity:");
    console.log("   npx hardhat run scripts/remove-liquidity.js --network", network);
    console.log("");
    
  } catch (error) {
    console.error("\n❌ Error adding liquidity:");
    console.error(error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
