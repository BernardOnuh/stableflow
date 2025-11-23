// contracts/BridgeWithLPs.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import {MessagingReceipt} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSender.sol";
import {OptionsBuilder} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title BridgeWithLPs
 * @notice USDT bridge where users can provide liquidity and earn 0.05% fees
 */
contract BridgeWithLPs is OApp, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    IERC20 public immutable usdt;
    
    mapping(address => uint256) public lpShares;
    uint256 public totalShares;
    uint256 public totalLiquidity;
    
    uint256 public constant LP_FEE_BPS = 5;
    uint256 public constant PROTOCOL_FEE_BPS = 25;
    uint256 public constant MAX_FEE = 5 * 1e6;
    uint256 public constant BPS = 10000;
    
    uint256 public lpFeePool;
    uint256 public protocolFees;
    uint256 public totalBridged;
    uint256 public totalTransactions;
    
    event LiquidityAdded(address indexed provider, uint256 amount, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 amount, uint256 shares);
    event BridgeInitiated(address indexed sender, uint32 indexed dstEid, address indexed recipient, uint256 amount, uint256 fee, bytes32 guid);
    event BridgeCompleted(address indexed recipient, uint32 indexed srcEid, uint256 amount, bytes32 guid);
    event FeesDistributed(uint256 lpFees, uint256 protocolFees);

    constructor(address _endpoint, address _usdt, address _owner) OApp(_endpoint, _owner) {
        usdt = IERC20(_usdt);
    }

    function addLiquidity(uint256 amount) external nonReentrant returns (uint256 shares) {
        require(amount > 0, "Amount must be > 0");
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        
        if (totalShares == 0) {
            shares = amount;
        } else {
            shares = (amount * totalShares) / (totalLiquidity + lpFeePool);
        }
        require(shares > 0, "Shares must be > 0");
        
        lpShares[msg.sender] += shares;
        totalShares += shares;
        totalLiquidity += amount;
        emit LiquidityAdded(msg.sender, amount, shares);
    }

    function removeLiquidity(uint256 shares) external nonReentrant returns (uint256 amount) {
        require(shares > 0 && lpShares[msg.sender] >= shares, "Invalid shares");
        
        amount = (shares * (totalLiquidity + lpFeePool)) / totalShares;
        require(amount > 0 && usdt.balanceOf(address(this)) >= amount, "Insufficient");
        
        lpShares[msg.sender] -= shares;
        totalShares -= shares;
        
        if (amount <= totalLiquidity) {
            totalLiquidity -= amount;
        } else {
            lpFeePool -= (amount - totalLiquidity);
            totalLiquidity = 0;
        }
        
        usdt.safeTransfer(msg.sender, amount);
        emit LiquidityRemoved(msg.sender, amount, shares);
    }

    function bridge(
        uint32 _dstEid,
        address _recipient,
        uint256 _amount,
        bytes calldata _extraOptions
    ) external payable nonReentrant returns (MessagingReceipt memory) {
        require(_amount > 0 && _recipient != address(0), "Invalid params");
        
        uint256 lpFee = (_amount * LP_FEE_BPS) / BPS;
        uint256 protocolFee = (_amount * PROTOCOL_FEE_BPS) / BPS;
        uint256 totalFee = lpFee + protocolFee;
        
        if (totalFee > MAX_FEE) {
            totalFee = MAX_FEE;
            lpFee = (MAX_FEE * LP_FEE_BPS) / (LP_FEE_BPS + PROTOCOL_FEE_BPS);
            protocolFee = MAX_FEE - lpFee;
        }
        
        uint256 amountAfterFee = _amount - totalFee;
        usdt.safeTransferFrom(msg.sender, address(this), _amount);
        
        lpFeePool += lpFee;
        protocolFees += protocolFee;
        totalLiquidity += amountAfterFee;
        totalBridged += _amount;
        totalTransactions++;
        
        bytes memory payload = abi.encode(_recipient, amountAfterFee);
        bytes memory options = _extraOptions.length > 0 ? _extraOptions : _buildDefaultOptions();
        
        MessagingReceipt memory receipt = _lzSend(
            _dstEid, payload, options, MessagingFee(msg.value, 0), payable(msg.sender)
        );
        
        emit BridgeInitiated(msg.sender, _dstEid, _recipient, amountAfterFee, totalFee, receipt.guid);
        emit FeesDistributed(lpFee, protocolFee);
        return receipt;
    }

    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _payload,
        address,
        bytes calldata
    ) internal override {
        (address recipient, uint256 amount) = abi.decode(_payload, (address, uint256));
        require(totalLiquidity >= amount, "Insufficient liquidity");
        
        totalLiquidity -= amount;
        usdt.safeTransfer(recipient, amount);
        emit BridgeCompleted(recipient, _origin.srcEid, amount, _guid);
    }

    /**
     * @notice Get LayerZero messaging fee only (gas cost for cross-chain message)
     * @param _dstEid Destination chain endpoint ID
     * @param _amount Amount to bridge
     * @param _extraOptions Extra LayerZero options
     * @return fee LayerZero messaging fee (native token amount)
     */
    function quoteFee(
        uint32 _dstEid,
        uint256 _amount,
        bytes calldata _extraOptions
    ) external view returns (MessagingFee memory fee) {
        bytes memory payload = abi.encode(msg.sender, _amount);
        bytes memory options = _extraOptions.length > 0 ? _extraOptions : _buildDefaultOptions();
        fee = _quote(_dstEid, payload, options, false);
    }

    /**
     * @notice Get complete quote including ALL fees
     * @param _dstEid Destination chain endpoint ID
     * @param _amount Amount to bridge (in USDT)
     * @param _extraOptions Extra LayerZero options
     * @return lzFee LayerZero gas fee (in native token, e.g., ETH)
     * @return lpFee LP fee (in USDT)
     * @return protocolFee Protocol fee (in USDT)
     * @return totalBridgeFee Total bridge fee (in USDT)
     * @return amountToReceive Amount recipient will receive (in USDT)
     */
    function getCompleteQuote(
        uint32 _dstEid,
        uint256 _amount,
        bytes calldata _extraOptions
    ) external view returns (
        uint256 lzFee,
        uint256 lpFee,
        uint256 protocolFee,
        uint256 totalBridgeFee,
        uint256 amountToReceive
    ) {
        // Get LayerZero network fee
        bytes memory payload = abi.encode(msg.sender, _amount);
        bytes memory options = _extraOptions.length > 0 ? _extraOptions : _buildDefaultOptions();
        MessagingFee memory msgFee = _quote(_dstEid, payload, options, false);
        lzFee = msgFee.nativeFee;
        
        // Calculate bridge fees
        (lpFee, protocolFee, totalBridgeFee, amountToReceive) = calculateFees(_amount);
    }

    /**
     * @notice Calculate bridge fees for a given amount
     * @param _amount Amount to bridge
     * @return lpFee LP fee (0.05%)
     * @return protocolFee Protocol fee (0.25%)
     * @return totalFee Total bridge fee
     * @return amountAfterFee Amount after deducting fees
     */
    function calculateFees(uint256 _amount) public pure returns (
        uint256 lpFee, uint256 protocolFee, uint256 totalFee, uint256 amountAfterFee
    ) {
        lpFee = (_amount * LP_FEE_BPS) / BPS;
        protocolFee = (_amount * PROTOCOL_FEE_BPS) / BPS;
        totalFee = lpFee + protocolFee;
        if (totalFee > MAX_FEE) {
            totalFee = MAX_FEE;
            lpFee = (MAX_FEE * LP_FEE_BPS) / (LP_FEE_BPS + PROTOCOL_FEE_BPS);
            protocolFee = MAX_FEE - lpFee;
        }
        amountAfterFee = _amount - totalFee;
    }

    function getLPPosition(address lp) external view returns (uint256 shares, uint256 usdtValue, uint256 pctOwnership) {
        shares = lpShares[lp];
        if (shares > 0 && totalShares > 0) {
            usdtValue = (shares * (totalLiquidity + lpFeePool)) / totalShares;
            pctOwnership = (shares * BPS) / totalShares;
        }
    }

    function getStats() external view returns (
        uint256, uint256, uint256, uint256, uint256, uint256, uint256
    ) {
        return (totalLiquidity, lpFeePool, protocolFees, totalShares, totalBridged, totalTransactions, usdt.balanceOf(address(this)) - protocolFees);
    }

    function withdrawProtocolFees() external onlyOwner {
        uint256 amount = protocolFees;
        require(amount > 0, "No fees");
        protocolFees = 0;
        usdt.safeTransfer(owner(), amount);
    }

    /**
     * @notice Build default LayerZero v2 options using OptionsBuilder
     */
    function _buildDefaultOptions() internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(200000, 0);
    }

    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).safeTransfer(owner(), _amount);
    }
}
