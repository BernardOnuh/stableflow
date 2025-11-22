// scripts/deploy.js
const hre = require("hardhat");
const { Options } = require("@layerzerolabs/lz-v2-utilities");

// Contract addresses by network
const ADDRESSES = {
  arbitrum: {
    endpoint: "0x1a44076050125825900e736c501f859c50fE728c",
    usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Uniswap V3
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
  },
  base: {
    endpoint: "0x1a44076050125825900e736c501f859c50fE728c",
    usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    swapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481", // Uniswap V3
    weth: "0x4200000000000000000000000000000000000006"
  },
  optimism: {
    endpoint: "0x1a44076050125825900e736c501f859c50fE728c",
    usdt: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Uniswap V3
    weth: "0x4200000000000000000000000000000000000006"
  }
};

const CHAIN_IDS = {
  arbitrum: 30110,
  base: 30184,
  optimism: 30111
};

async function main() {
  const network = hre.network.name;
  console.log(`\n🚀 Deploying to ${network}...`);
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  
  // Get network-specific addresses
  const addresses = ADDRESSES[network];
  if (!addresses) {
    throw new Error(`Network ${network} not configured`);
  }
  
  // Deploy bridge
  console.log("\n📝 Deploying USDTBridgeWithDEX...");
  const Bridge = await ethers.getContractFactory("USDTBridgeWithDEX");
  const bridge = await Bridge.deploy(
    addresses.endpoint,
    addresses.usdt,
    addresses.swapRouter,
    addresses.weth,
    deployer.address
  );
  
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  
  console.log("✅ Bridge deployed to:", bridgeAddress);
  
  // Save deployment info
  const fs = require('fs');
  const deployments = JSON.parse(
    fs.existsSync('deployments.json') 
      ? fs.readFileSync('deployments.json') 
      : '{}'
  );
  
  deployments[network] = {
    bridge: bridgeAddress,
    endpoint: addresses.endpoint,
    usdt: addresses.usdt,
    chainId: CHAIN_IDS[network],
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync('deployments.json', JSON.stringify(deployments, null, 2));
  console.log("📄 Deployment info saved to deployments.json");
  
  // Verify on Etherscan
  if (network !== "hardhat" && network !== "localhost") {
    console.log("\n⏳ Waiting for Etherscan verification...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
    
    try {
      await hre.run("verify:verify", {
        address: bridgeAddress,
        constructorArguments: [
          addresses.endpoint,
          addresses.usdt,
          addresses.swapRouter,
          addresses.weth,
          deployer.address
        ]
      });
      console.log("✅ Contract verified on Etherscan");
    } catch (error) {
      console.log("⚠️ Verification failed:", error.message);
    }
  }
  
  console.log("\n🎉 Deployment complete!");
  console.log("Next steps:");
  console.log("1. Deploy to other chains (base, optimism)");
  console.log("2. Run: npx hardhat run scripts/configure.js");
  console.log("3. Deposit ETH for swaps: bridge.depositETH()");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });