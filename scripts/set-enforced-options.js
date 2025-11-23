// scripts/set-enforced-options.js
// Set enforced options for LayerZero v2 OApp
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("\n⚙️  Setting Enforced Options for LP Bridge");
  console.log("=".repeat(50));

  const [signer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("Network:", network);
  console.log("Signer:", signer.address);
  console.log("");

  const deployments = JSON.parse(fs.readFileSync("deployments-lp-testnet.json", "utf8"));

  if (!deployments[network]) {
    console.error("❌ No deployment found for", network);
    process.exit(1);
  }

  // LayerZero Endpoint IDs (v2)
  const LZ_EID = {
    "sepolia": 40161,
    "base-sepolia": 40245,
    "arbitrum-sepolia": 40231
  };

  const bridge = await hre.ethers.getContractAt(
    "BridgeWithLPs",
    deployments[network].bridge
  );

  console.log("Bridge:", deployments[network].bridge);
  console.log("");

  // Build enforced options using LayerZero v2 format
  // Options format: https://docs.layerzero.network/v2/developers/evm/protocol-gas-settings/options
  
  // Build lzReceive option (Type 3)
  // Format: 0x0003 + workerType(1) + optionType(1) + optionData
  // workerType = 0x01 (executor)
  // optionType = 0x01 (lzReceiveOption)
  // optionData = gas(uint128) + value(uint128)
  
  const GAS_LIMIT = 200000; // Gas for _lzReceive on destination
  const MSG_VALUE = 0; // No native token transfer
  
  // Encode options properly for LZ v2
  // Using Options.newOptions().addExecutorLzReceiveOption(gasLimit, value)
  // This encodes to: 0x0003 + 0x01 (executor) + length(2bytes) + 0x01 (lzReceive) + gas(16bytes) + value(16bytes)
  
  function buildLzReceiveOption(gas, value) {
    // Option type header
    const TYPE_3 = "0003"; // Options type 3
    const WORKER_ID = "01"; // Executor worker
    const OPTION_TYPE = "01"; // lzReceiveOption
    
    // Encode gas as uint128 (16 bytes, big-endian)
    const gasHex = gas.toString(16).padStart(32, '0');
    // Encode value as uint128 (16 bytes, big-endian)  
    const valueHex = value.toString(16).padStart(32, '0');
    
    // Length of option data (1 + 16 + 16 = 33 bytes = 0x0021)
    const optionLength = "0021";
    
    return "0x" + TYPE_3 + WORKER_ID + optionLength + OPTION_TYPE + gasHex + valueHex;
  }
  
  const enforcedOptions = buildLzReceiveOption(GAS_LIMIT, MSG_VALUE);
  console.log("Enforced options:", enforcedOptions);
  console.log(`   Gas limit: ${GAS_LIMIT}`);
  console.log(`   Msg value: ${MSG_VALUE}`);
  console.log("");

  // Check if contract has setEnforcedOptions function
  // OAppOptionsType3 uses: setEnforcedOptions(EnforcedOptionParam[] calldata _enforcedOptions)
  // struct EnforcedOptionParam { uint32 eid; uint16 msgType; bytes options; }
  
  // Your contract might not have this - let's check
  try {
    // Try to call setEnforcedOptions if it exists
    const hasFunction = bridge.interface.getFunction("setEnforcedOptions");
    console.log("✅ Contract has setEnforcedOptions function");
    
    // Set for all destination chains
    const enforcedOptionsParams = [];
    
    for (const [peerNetwork, peerData] of Object.entries(deployments)) {
      if (peerNetwork === network) continue;
      
      const eid = LZ_EID[peerNetwork];
      if (!eid) continue;
      
      // msgType 1 is typically used for standard sends
      enforcedOptionsParams.push({
        eid: eid,
        msgType: 1, // SEND type
        options: enforcedOptions
      });
      
      console.log(`   Adding for ${peerNetwork} (EID: ${eid})`);
    }
    
    console.log("");
    console.log("Setting enforced options...");
    
    const tx = await bridge.setEnforcedOptions(enforcedOptionsParams);
    await tx.wait();
    
    console.log("✅ Enforced options set!");
    console.log("   Tx:", tx.hash);
    
  } catch (e) {
    console.log("❌ Contract doesn't have setEnforcedOptions");
    console.log("   Your contract needs to inherit from OAppOptionsType3");
    console.log("");
    console.log("🔧 ALTERNATIVE: Pass options directly in the bridge call");
    console.log("   Use this options value in your scripts:");
    console.log(`   const lzOptions = "${enforcedOptions}";`);
    console.log("");
    console.log("   Or update your contract's _buildDefaultOptions():");
    console.log("");
    console.log(`   function _buildDefaultOptions() internal pure returns (bytes memory) {`);
    console.log(`       return hex"${enforcedOptions.slice(2)}";`);
    console.log(`   }`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });