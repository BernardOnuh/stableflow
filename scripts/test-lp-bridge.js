// scripts/test-lp-bridge-simple.js
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("\n🧪 Testing LP Bridge (Simple)");
  console.log("=".repeat(50));

  const [signer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("Network:", network);
  console.log("Your address:", signer.address);
  console.log("");

  // Configuration - determine destination
  let TO_NETWORK = process.env.TO_NETWORK;
  if (!TO_NETWORK) {
    // Default: bridge to the OTHER network
    if (network === "base-sepolia") TO_NETWORK = "sepolia";
    else if (network === "sepolia") TO_NETWORK = "base-sepolia";
    else TO_NETWORK = "sepolia"; // fallback
  }
  
  const AMOUNT = process.env.AMOUNT || "10"; // 10 USDT

  // Sanity check
  if (TO_NETWORK === network) {
    console.error("❌ Cannot bridge to the same network!");
    console.log("\n💡 Set TO_NETWORK environment variable");
    console.log("Example:");
    console.log(`  TO_NETWORK=sepolia npx hardhat run scripts/test-lp-bridge-simple.js --network base-sepolia`);
    process.exit(1);
  }

  console.log(`🌉 Bridging ${AMOUNT} USDT from ${network} → ${TO_NETWORK}`);
  console.log("");

  // LayerZero Endpoint IDs (v2)
  const LZ_EID = {
    "sepolia": 40161,
    "base-sepolia": 40245,
    "arbitrum-sepolia": 40231
  };

  // Load deployments
  let deployments;
  try {
    deployments = JSON.parse(fs.readFileSync("deployments-lp-testnet.json", "utf8"));
  } catch (e) {
    console.error("❌ deployments-lp-testnet.json not found!");
    process.exit(1);
  }

  if (!deployments[network] || !deployments[TO_NETWORK]) {
    console.error("❌ Missing deployments");
    process.exit(1);
  }

  const bridge = await hre.ethers.getContractAt(
    "BridgeWithLPs",
    deployments[network].bridge
  );

  const usdt = await hre.ethers.getContractAt(
    "MockUSDT",
    deployments[network].usdt
  );

  // Step 1: Check balances
  console.log("📊 Step 1: Checking balances...");
  
  const usdtBalance = await usdt.balanceOf(signer.address);
  console.log(`   Your USDT: ${hre.ethers.formatUnits(usdtBalance, 6)} USDT`);

  const ethBalance = await hre.ethers.provider.getBalance(signer.address);
  console.log(`   Your ETH: ${hre.ethers.formatEther(ethBalance)} ETH`);

  const amountWei = hre.ethers.parseUnits(AMOUNT, 6);

  if (usdtBalance < amountWei) {
    console.log("\n⚠️  Not enough USDT! Getting from faucet...");
    const tx = await usdt.faucet();
    await tx.wait();
    console.log("✅ Got 100 USDT from faucet!");
  }
  console.log("");

  // Step 2: Check liquidity
  console.log("📊 Step 2: Checking liquidity...");
  
  const stats = await bridge.getStats();
  const sourceLiquidity = stats[0];
  console.log(`   Source (${network}): ${hre.ethers.formatUnits(sourceLiquidity, 6)} USDT`);
  console.log("");

  // Step 3: Approve USDT
  console.log("📝 Step 3: Approving USDT...");
  
  const allowance = await usdt.allowance(signer.address, deployments[network].bridge);
  if (allowance < amountWei) {
    const tx = await usdt.approve(deployments[network].bridge, hre.ethers.MaxUint256);
    await tx.wait();
    console.log("✅ USDT approved");
  } else {
    console.log("✅ Already approved");
  }
  console.log("");

  // Step 4: Get quote using old method
  console.log("💰 Step 4: Getting fee quote...");
  
  const destEid = LZ_EID[TO_NETWORK];
  if (!destEid) {
    console.error("❌ Unknown destination network:", TO_NETWORK);
    process.exit(1);
  }

  try {
    // Simple options
    const lzOptions = "0x";
    
    // Get LayerZero fee
    const fee = await bridge.quoteFee(destEid, amountWei, lzOptions);
    console.log(`   LayerZero fee: ${hre.ethers.formatEther(fee.nativeFee)} ETH`);
    
    // Calculate bridge fees manually
    const lpFee = (Number(AMOUNT) * 0.0005).toFixed(6); // 0.05%
    const protocolFee = (Number(AMOUNT) * 0.0025).toFixed(6); // 0.25%
    const totalFee = (Number(lpFee) + Number(protocolFee)).toFixed(6);
    const amountToReceive = (Number(AMOUNT) - Number(totalFee)).toFixed(6);
    
    console.log(`   LP fee (0.05%): ${lpFee} USDT`);
    console.log(`   Protocol fee (0.25%): ${protocolFee} USDT`);
    console.log(`   Total bridge fee: ${totalFee} USDT`);
    console.log("");
    console.log(`💵 You send: ${AMOUNT} USDT`);
    console.log(`💵 Recipient gets: ~${amountToReceive} USDT`);
    console.log("");

    if (ethBalance < fee.nativeFee) {
      console.log("❌ Not enough ETH for LayerZero fee!");
      console.log("\n💡 Get testnet ETH from faucets");
      process.exit(1);
    }

    // Step 5: Execute bridge
    console.log("🚀 Step 5: Executing bridge...");
    console.log(`   From: ${network} (EID: ${LZ_EID[network]})`);
    console.log(`   To: ${TO_NETWORK} (EID: ${destEid})`);
    console.log("");

    const tx = await bridge.bridge(
      destEid,
      signer.address,
      amountWei,
      lzOptions,
      { value: fee.nativeFee, gasLimit: 500000 }
    );

    console.log("✅ Transaction sent!");
    console.log("   Tx hash:", tx.hash);
    console.log("");
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("✅ Confirmed in block:", receipt.blockNumber);
    console.log("");

    // Parse events
    for (const log of receipt.logs) {
      try {
        const parsed = bridge.interface.parseLog(log);
        if (parsed && parsed.name === "BridgeInitiated") {
          console.log("📋 Bridge Details:");
          console.log("   GUID:", parsed.args.guid);
          console.log("   Amount after fees:", hre.ethers.formatUnits(parsed.args.amount, 6), "USDT");
        }
      } catch (e) {
        // Skip
      }
    }

    console.log("");
    console.log("=".repeat(50));
    console.log("🎉 BRIDGE INITIATED SUCCESSFULLY!");
    console.log("=".repeat(50));
    console.log("");
    console.log("🔍 Track your transaction:");
    console.log(`   https://testnet.layerzeroscan.com/tx/${tx.hash}`);
    console.log("");
    console.log("⏰ Wait 1-3 minutes for delivery");

  } catch (e) {
    console.error("\n❌ Error:", e.message);
    
    if (e.message.includes("NoPeer")) {
      console.log("\n💡 FIX: Peers not configured!");
      console.log(`   npx hardhat run scripts/configure-lp-testnet.js --network ${network}`);
      console.log(`   npx hardhat run scripts/configure-lp-testnet.js --network ${TO_NETWORK}`);
    } else if (e.message.includes("Insufficient")) {
      console.log("\n💡 FIX: Add liquidity to destination");
    }
    
    throw e;
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n💥 Test failed");
    process.exit(1);
  });