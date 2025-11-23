const hre = require("hardhat");
const fs = require("fs");

// LayerZero Endpoint IDs
const EID = {
  "sepolia": 40161,
  "base-sepolia": 40245
};

async function main() {
  const network = hre.network.name;
  console.log(`\n🔧 Configuring LP Bridge on ${network.toUpperCase()}`);
  console.log("=".repeat(50));

  // Load deployments
  let deployments;
  try {
    deployments = JSON.parse(fs.readFileSync("deployments-lp-testnet.json", "utf8"));
  } catch (e) {
    console.error("❌ deployments-lp-testnet.json not found!");
    console.log("   Deploy to both chains first.");
    process.exit(1);
  }

  // Check both chains are deployed
  if (!deployments.sepolia || !deployments["base-sepolia"]) {
    console.error("❌ Must deploy to both sepolia and base-sepolia first!");
    console.log("   Deployed chains:", Object.keys(deployments).join(", "));
    process.exit(1);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Get current chain's bridge
  const currentDeployment = deployments[network];
  if (!currentDeployment) {
    console.error(`❌ No deployment found for ${network}`);
    process.exit(1);
  }

  const bridge = await hre.ethers.getContractAt("BridgeWithLPs", currentDeployment.bridge);

  // Determine peer chain
  const peerNetwork = network === "sepolia" ? "base-sepolia" : "sepolia";
  const peerDeployment = deployments[peerNetwork];
  const peerEid = EID[peerNetwork];

  console.log(`\n📝 Setting peer for ${peerNetwork} (EID: ${peerEid})`);
  console.log(`   Peer bridge: ${peerDeployment.bridge}`);

  // Convert address to bytes32
  const peerBytes32 = hre.ethers.zeroPadValue(peerDeployment.bridge, 32);

  // Check if already configured
  const existingPeer = await bridge.peers(peerEid);
  if (existingPeer === peerBytes32) {
    console.log("✅ Peer already configured correctly!");
  } else {
    // Set peer
    const tx = await bridge.setPeer(peerEid, peerBytes32);
    console.log("   Tx:", tx.hash);
    await tx.wait();
    console.log("✅ Peer configured!");
  }

  // Verify configuration
  console.log("\n📋 Configuration Summary:");
  console.log(`   Current chain: ${network} (EID: ${EID[network]})`);
  console.log(`   Bridge: ${currentDeployment.bridge}`);
  console.log(`   Peer chain: ${peerNetwork} (EID: ${peerEid})`);
  console.log(`   Peer bridge: ${peerDeployment.bridge}`);

  console.log("\n" + "=".repeat(50));
  console.log("🎉 Configuration complete!");
  console.log("\n📝 Next steps:");
  console.log(`   1. Run on the other chain:`);
  console.log(`      npx hardhat run scripts/configure-lp-testnet.js --network ${peerNetwork}`);
  console.log(`   2. Test bridging:`);
  console.log(`      npx hardhat run scripts/test-lp-bridge.js --network ${network}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});