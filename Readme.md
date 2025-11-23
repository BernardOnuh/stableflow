# BridgeWithLPs - Cross-Chain USDT Bridge with Liquidity Pools

A decentralized cross-chain USDT bridge built on LayerZero V2 that allows liquidity providers to earn fees while facilitating seamless token transfers between blockchains.

## Overview

BridgeWithLPs enables users to bridge USDT across different blockchain networks while allowing liquidity providers (LPs) to earn passive income from bridge fees. The protocol charges a minimal 0.3% total fee (0.05% for LPs + 0.25% protocol fee) on each bridge transaction.

## Features

- **Cross-Chain Bridge**: Transfer USDT between any LayerZero-supported chains
- **Liquidity Provider System**: Stake USDT and earn fees from every bridge transaction
- **Low Fees**: Only 0.3% total bridge fee (capped at 5 USDT)
- **Share-Based System**: Fair distribution of fees proportional to LP contributions
- **Non-Custodial**: Users maintain control of their assets
- **Secure**: Built with OpenZeppelin's battle-tested contracts and reentrancy guards

## Fee Structure

| Fee Type | Rate | Recipient |
|----------|------|-----------|
| LP Fee | 0.05% | Distributed to all liquidity providers |
| Protocol Fee | 0.25% | Protocol treasury |
| **Total Bridge Fee** | **0.3%** | **Maximum 5 USDT** |
| LayerZero Gas | Variable | Paid separately in native token (ETH, etc.) |

## How It Works

### For Bridge Users

1. **Approve USDT**: Allow the bridge contract to spend your USDT
2. **Get Quote**: Check the bridge fee and amount you'll receive
3. **Bridge**: Send USDT to destination chain (pay LayerZero gas fee in native token)
4. **Receive**: Get USDT on destination chain within 1-3 minutes

### For Liquidity Providers

1. **Add Liquidity**: Deposit USDT to the bridge contract
2. **Receive Shares**: Get LP shares representing your pool ownership
3. **Earn Fees**: Automatically earn 0.05% from every bridge transaction
4. **Remove Liquidity**: Withdraw your USDT + accumulated fees anytime

## Smart Contract Architecture

### Key Functions

#### Bridge Functions
```solidity
function bridge(
    uint32 _dstEid,           // Destination chain endpoint ID
    address _recipient,        // Recipient address on destination chain
    uint256 _amount,          // Amount to bridge (in USDT)
    bytes calldata _extraOptions // LayerZero options (optional)
) external payable returns (MessagingReceipt memory)
```

#### Liquidity Provider Functions
```solidity
function addLiquidity(uint256 amount) external returns (uint256 shares)
function removeLiquidity(uint256 shares) external returns (uint256 amount)
```

#### View Functions
```solidity
function getCompleteQuote(uint32 _dstEid, uint256 _amount, bytes calldata _extraOptions)
function calculateFees(uint256 _amount)
function getLPPosition(address lp)
function getStats()
```

## Deployment

### Networks

The bridge is currently deployed on:
- **Ethereum Sepolia** (Testnet)
  - Contract: `0xaB1697F5E7793fc9F142C0dB1c4861E85cf09bD0`
  - Chain ID: 40161
- **Base Sepolia** (Testnet)
  - Contract: `0xd27467AEBab3Ae27d7FB9Df71F3ab92D02e6E23d`
  - Chain ID: 40245

### Setup & Configuration

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Add your private key and RPC URLs
   ```

3. **Deploy Contracts**
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   npx hardhat run scripts/deploy.js --network base-sepolia
   ```

4. **Configure Peers**
   ```bash
   npx hardhat run scripts/configure-lp-testnet.js --network sepolia
   npx hardhat run scripts/configure-lp-testnet.js --network base-sepolia
   ```

5. **Add Initial Liquidity**
   ```bash
   npx hardhat run scripts/add-liquidity.js --network sepolia
   npx hardhat run scripts/add-liquidity.js --network base-sepolia
   ```

## Testing

### Test Bridge Transaction
```bash
# Bridge from Sepolia to Base Sepolia
npx hardhat run scripts/test-lp-bridge.js --network sepolia

# Bridge from Base Sepolia to Sepolia
npx hardhat run scripts/test-lp-bridge.js --network base-sepolia
```

### Example Output
```
🌉 Bridging 10 USDT from sepolia → base-sepolia

📊 Checking balances...
   Your USDT: 1,090,000.0 USDT
   
💰 Getting fee quote...
   LayerZero fee: 0.000030497432137107 ETH
   LP fee (0.05%): 0.005000 USDT
   Protocol fee (0.25%): 0.025000 USDT
   Total bridge fee: 0.030000 USDT

💵 You send: 10 USDT
💵 Recipient gets: ~9.970000 USDT

✅ Transaction sent!
   Tx hash: 0x1c89d41a1bf774f5926ef1b58c85b1c8721a5d670153bbb418f8b3d3a1429622
```

## Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks on critical functions
- **SafeERC20**: Safe token transfers with proper error handling
- **Access Control**: Owner-only functions for protocol management
- **Liquidity Checks**: Validates sufficient liquidity before completing bridges
- **Fee Caps**: Maximum fee of 5 USDT to protect users from excessive charges

## LP Economics

### Share Calculation
```
Initial Deposit: shares = amount
Subsequent Deposits: shares = (amount * totalShares) / (totalLiquidity + lpFeePool)
```

### Withdrawal Value
```
withdrawAmount = (shares * (totalLiquidity + lpFeePool)) / totalShares
```

### Example Returns
- Bridge a $10,000 transaction: LP earns $5 (0.05%)
- Daily volume of $1M: LPs earn $500/day
- 10% pool ownership: Earn $50/day from $1M daily volume

## Tracking Transactions

Monitor your cross-chain transactions on LayerZero Scan:
```
https://testnet.layerzeroscan.com/tx/{YOUR_TX_HASH}
```

Typical delivery time: **1-3 minutes**

## Development

### Project Structure
```
stableflow/
├── contracts/
│   └── BridgeWithLPs.sol
├── scripts/
│   ├── deploy.js
│   ├── configure-lp-testnet.js
│   ├── add-liquidity.js
│   └── test-lp-bridge.js
├── hardhat.config.js
└── package.json
```

### Technology Stack
- **Solidity ^0.8.22**: Smart contract language
- **LayerZero V2**: Cross-chain messaging protocol
- **OpenZeppelin**: Security and token standards
- **Hardhat**: Development environment

## API Reference

### getCompleteQuote
Returns all fees for a bridge transaction:
```javascript
const quote = await bridge.getCompleteQuote(
  destinationEID,
  amountToSend,
  extraOptions
);
// Returns: lzFee, lpFee, protocolFee, totalBridgeFee, amountToReceive
```

### getLPPosition
Check your LP position:
```javascript
const position = await bridge.getLPPosition(yourAddress);
// Returns: shares, usdtValue, pctOwnership (in basis points)
```

### getStats
Get protocol statistics:
```javascript
const stats = await bridge.getStats();
// Returns: totalLiquidity, lpFeePool, protocolFees, totalShares, 
//          totalBridged, totalTransactions, availableLiquidity
```

## Roadmap

- [ ] Mainnet deployment
- [ ] Additional chain support
- [ ] Governance token for LPs
- [ ] Dynamic fee adjustment based on liquidity
- [ ] LP staking rewards
- [ ] Frontend dApp interface

## Support & Links

- **Documentation**: [LayerZero Docs](https://web3nova.mintlify.app/api-reference/endpoint/create-bridge)
- **LayerZero Scan**: [testnet.layerzeroscan.com](https://testnet.layerzeroscan.com)
- **Frontend**: [Frontend](https://stable-flow.vercel.app/)



- **Issues**: Open an issue on GitHub

## License

MIT License - see LICENSE file for details

## Disclaimer

This is experimental software. Use at your own risk. Always verify contract addresses and test with small amounts first on testnets before mainnet deployment.