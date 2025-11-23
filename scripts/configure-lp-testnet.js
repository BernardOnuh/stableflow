// scripts/configure-lp-testnet.js
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("\n⚙️  Configuring LP Bridge Peers");
  console.log("=".repeat(50));

  const [signer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("Network:", network);
  console.log("Signer:", signer.address);
  
  // Check balance
  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  
  if (balance < hre.ethers.parseEther("0.001")) {
    console.warn("\n⚠️  Low ETH balance! You may need more for configuration.");
  }
  console.log("");

  // Load deployments
  let deployments;
  try {
    deployments = JSON.parse(fs.readFileSync("deployments-lp-testnet.json", "utf8"));
  } catch (e) {
    console.error("❌ deployments-lp-testnet.json not found!");
    console.log("\n💡 Deploy first:");
    console.log("   npx hardhat run scripts/deploy-lp-testnet.js --network sepolia");
    console.log("   npx hardhat run scripts/deploy-lp-testnet.js --network base-sepolia");
    process.exit(1);
  }

  if (!deployments[network]) {
    console.error("❌ No deployment found for", network);
    console.log("\n💡 Available networks:", Object.keys(deployments).join(", "));
    process.exit(1);
  }

  // LayerZero Endpoint IDs (v2)
  const LZ_EID = {
    "sepolia": 40161,
    "base-sepolia": 40245,
    "arbitrum-sepolia": 40231
  };

  // Get bridge contract
  const bridge = await hre.ethers.getContractAt(
    "BridgeWithLPs",
    deployments[network].bridge
  );

  console.log("LP Bridge:", deployments[network].bridge);
  console.log("");

  let peersConfigured = 0;
  let peersSkipped = 0;

  // Configure peers for all other networks
  for (const [peerNetwork, peerData] of Object.entries(deployments)) {
    if (peerNetwork === network) continue;

    const peerEid = LZ_EID[peerNetwork];
    if (!peerEid) {
      console.log(`⚠️  Unknown network: ${peerNetwork}, skipping...`);
      continue;
    }

    console.log(`Setting peer for ${peerNetwork} (EID: ${peerEid})...`);
    console.log(`   Peer address: ${peerData.bridge}`);

    // Convert address to bytes32 (LayerZero V2 format)
    const peerBytes32 = hre.ethers.zeroPadValue(peerData.bridge, 32);
    console.log(`   Peer bytes32: ${peerBytes32}`);

    try {
      // Check if already configured
      const currentPeer = await bridge.peers(peerEid);
      
      if (currentPeer.toLowerCase() === peerBytes32.toLowerCase()) {
        console.log(`✅ Already configured for ${peerNetwork}`);
        peersSkipped++;
        console.log("");
        continue;
      }

      console.log(`   Current peer: ${currentPeer}`);
      console.log(`   Setting new peer...`);

      // Set peer with explicit gas limit
      const tx = await bridge.setPeer(peerEid, peerBytes32, {
        gasLimit: 200000
      });
      
      console.log(`   Tx hash: ${tx.hash}`);
      console.log(`   ⏳ Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      console.log(`✅ Peer set for ${peerNetwork} (Block: ${receipt.blockNumber})`);
      peersConfigured++;
      
    } catch (e) {
      console.error(`❌ Failed to set peer for ${peerNetwork}:`);
      console.error(`   Error: ${e.message}`);
      
      if (e.message.includes("Ownable")) {
        console.log(`\n💡 You are not the owner of this contract!`);
        console.log(`   Owner must be: ${await bridge.owner()}`);
        console.log(`   You are: ${signer.address}`);
      }
    }
    console.log("");
  }

  // Summary
  console.log("=".repeat(50));
  console.log("✅ Configuration complete!");
  console.log(`   Peers configured: ${peersConfigured}`);
  console.log(`   Peers skipped (already set): ${peersSkipped}`);
  console.log("");

  // Verify configuration
  console.log("🔍 Verifying peer configuration:");
  for (const [peerNetwork, peerData] of Object.entries(deployments)) {
    if (peerNetwork === network) continue;
    
    const peerEid = LZ_EID[peerNetwork];
    if (!peerEid) continue;
    
    try {
      const currentPeer = await bridge.peers(peerEid);
      const expectedPeer = hre.ethers.zeroPadValue(peerData.bridge, 32);
      
      if (currentPeer.toLowerCase() === expectedPeer.toLowerCase()) {
        console.log(`   ✅ ${peerNetwork}: Correctly configured`);
      } else {
        console.log(`   ❌ ${peerNetwork}: NOT configured`);
        console.log(`      Expected: ${expectedPeer}`);
        console.log(`      Current:  ${currentPeer}`);
      }
    } catch (e) {
      console.log(`   ❌ ${peerNetwork}: Error checking - ${e.message}`);
    }
  }
  console.log("");

  // Next steps
  const otherNetworks = Object.keys(deployments).filter(n => n !== network);
  
  if (otherNetworks.length > 0 && peersConfigured > 0) {
    console.log("📝 Next: Run configuration on the other network(s):");
    for (const peerNetwork of otherNetworks) {
      console.log(`   npx hardhat run scripts/configure-lp-testnet.js --network ${peerNetwork}`);
    }
    console.log("");
  }
  
  if (peersConfigured > 0 || peersSkipped > 0) {
    console.log("🧪 Ready to test!");
    console.log(`   npx hardhat run scripts/test-lp-bridge.js --network ${network}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ Configuration failed:");
    console.error(e);
    process.exit(1);
  });