// scripts/configure.js
const hre = require("hardhat");
const deployments = require("../deployments.json");

async function main() {
  console.log("\n🔧 Configuring bridge peers...");
  
  const [signer] = await ethers.getSigners();
  
  // Load all deployed bridges
  const networks = ['arbitrum', 'base', 'optimism'];
  const bridges = {};
  
  for (const network of networks) {
    if (deployments[network]) {
      bridges[network] = {
        address: deployments[network].bridge,
        chainId: deployments[network].chainId
      };
    }
  }
  
  console.log("Deployed bridges:", bridges);
  
  // Configure peers for current network
  const currentNetwork = hre.network.name;
  const currentBridge = await ethers.getContractAt(
    "USDTBridgeWithDEX",
    bridges[currentNetwork].address
  );
  
  for (const [network, info] of Object.entries(bridges)) {
    if (network === currentNetwork) continue;
    
    console.log(`\nSetting peer: ${network} (${info.chainId})`);
    
    // Convert address to bytes32
    const peerBytes32 = ethers.zeroPadValue(info.address, 32);
    
    const tx = await currentBridge.setPeer(info.chainId, peerBytes32);
    await tx.wait();
    
    console.log(`✅ Peer set: ${network}`);
  }
  
  console.log("\n🎉 Configuration complete!");
  console.log("\nNext: Deposit ETH for swaps");
  console.log(`bridge.depositETH({ value: ethers.parseEther("1") })`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });