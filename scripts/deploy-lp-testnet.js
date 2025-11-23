// scripts/deploy-lp-testnet.js
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const network = hre.network.name;
  
  console.log(`\n🚀 Deploying LP Bridge to ${network.toUpperCase()}`);
  console.log("=".repeat(60));

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");

  // Check minimum balance
  if (balance < hre.ethers.parseEther("0.01")) {
    console.warn("\n⚠️  Low ETH balance! You may need more for deployment and testing.");
    console.log("Get testnet ETH from:");
    console.log("  - Sepolia: https://sepoliafaucet.com");
    console.log("  - Base Sepolia: https://portal.cdp.coinbase.com/products/faucet");
  }

  // LayerZero V2 Endpoints (Testnet)
  const LZ_ENDPOINTS = {
    "sepolia": "0x6EDCE65403992e310A62460808c4b910D972f10f",
    "base-sepolia": "0x6EDCE65403992e310A62460808c4b910D972f10f",
    "arbitrum-sepolia": "0x6EDCE65403992e310A62460808c4b910D972f10f"
  };

  const LZ_EID = {
    "sepolia": 40161,
    "base-sepolia": 40245,
    "arbitrum-sepolia": 40231
  };

  const endpoint = LZ_ENDPOINTS[network];
  if (!endpoint) {
    console.error("❌ Unknown network:", network);
    console.log("Supported networks: sepolia, base-sepolia, arbitrum-sepolia");
    process.exit(1);
  }

  // Step 1: Deploy Mock USDT
  console.log("\n📝 Step 1: Deploying Mock USDT...");
  const MockUSDT = await hre.ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("✅ Mock USDT:", usdtAddress);

  // Mint initial USDT
  console.log("\n💰 Minting initial USDT...");
  const mintAmount = hre.ethers.parseUnits("100000", 6); // 100k USDT
  const mintTx = await usdt.mint(deployer.address, mintAmount);
  await mintTx.wait();
  console.log("✅ Minted 100,000 USDT to deployer");

  // Step 2: Deploy Bridge
  console.log("\n📝 Step 2: Deploying LP Bridge...");
  const Bridge = await hre.ethers.getContractFactory("BridgeWithLPs");
  const bridge = await Bridge.deploy(endpoint, usdtAddress, deployer.address);
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("✅ Bridge:", bridgeAddress);

  // Step 3: Add initial liquidity
  console.log("\n📝 Step 3: Adding initial liquidity...");
  const liquidityAmount = hre.ethers.parseUnits("10000", 6); // 10k USDT
  
  console.log("   Approving USDT...");
  const approveTx = await usdt.approve(bridgeAddress, liquidityAmount);
  await approveTx.wait();
  console.log("   ✅ Approved");
  
  console.log("   Adding liquidity...");
  const addLiqTx = await bridge.addLiquidity(liquidityAmount);
  await addLiqTx.wait();
  
  const shares = await bridge.lpShares(deployer.address);
  console.log("✅ Added 10,000 USDT liquidity");
  console.log("   Shares received:", hre.ethers.formatUnits(shares, 6));

  // Save deployment
  const deploymentFile = "deployments-lp-testnet.json";
  let deployments = {};
  
  try {
    deployments = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  } catch (e) {
    // File doesn't exist yet
  }

  deployments[network] = {
    usdt: usdtAddress,
    bridge: bridgeAddress,
    endpoint: endpoint,
    chainId: LZ_EID[network],
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(deployments, null, 2));
  console.log("\n📄 Saved to:", deploymentFile);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Addresses:");
  console.log("   Mock USDT:", usdtAddress);
  console.log("   LP Bridge:", bridgeAddress);
  console.log("   LayerZero Endpoint:", endpoint);
  console.log("   Chain EID:", LZ_EID[network]);
  
  console.log("\n💰 Bridge Stats:");
  const stats = await bridge.getStats();
  console.log("   Total Liquidity:", hre.ethers.formatUnits(stats[0], 6), "USDT");
  console.log("   LP Fee Pool:", hre.ethers.formatUnits(stats[1], 6), "USDT");
  console.log("   Protocol Fees:", hre.ethers.formatUnits(stats[2], 6), "USDT");
  console.log("   Total Shares:", hre.ethers.formatUnits(stats[3], 6));
  console.log("   Total Bridged:", hre.ethers.formatUnits(stats[4], 6), "USDT");
  console.log("   Total Transactions:", stats[5].toString());

  console.log("\n📝 Next Steps:");
  console.log("1. Deploy to another chain (e.g., sepolia or base-sepolia)");
  console.log("2. Configure peers on BOTH chains:");
  console.log(`   npx hardhat run scripts/configure-lp-testnet.js --network ${network}`);
  console.log("   npx hardhat run scripts/configure-lp-testnet.js --network <other-network>");
  console.log("3. Test bridge:");
  console.log(`   npx hardhat run scripts/test-lp-bridge.js --network ${network}`);
  
  console.log("\n💡 Quick commands:");
  console.log("   # Deploy to both chains");
  console.log("   npx hardhat run scripts/deploy-lp-testnet.js --network sepolia");
  console.log("   npx hardhat run scripts/deploy-lp-testnet.js --network base-sepolia");
  console.log("   # Configure both");
  console.log("   npx hardhat run scripts/configure-lp-testnet.js --network sepolia");
  console.log("   npx hardhat run scripts/configure-lp-testnet.js --network base-sepolia");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ Deployment failed:");
    console.error(e);
    process.exit(1);
  });