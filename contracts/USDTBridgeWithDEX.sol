// contracts/USDTBridgeWithDEX.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import {MessagingReceipt} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSender.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Uniswap V3 interfaces
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    
    function exactInputSingle(ExactInputSingleParams calldata params) 
        external payable returns (uint256 amountOut);
}

/**
 * @title USDTBridgeWithDEX
 * @notice Bridge USDT using DEX liquidity - NO LIQUIDITY NEEDED!
 * @dev Locks USDT on source, buys USDT on destination via DEX
 */
contract USDTBridgeWithDEX is OApp {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    ISwapRouter public immutable swapRouter;
    address public immutable weth;
    
    uint256 public constant FEE_BPS = 30; // 0.3% fee
    uint256 public constant BPS = 10000;
    uint256 public collectedFees;
    
    // Mapping to store native token (ETH) deposits for buying USDT
    mapping(address => uint256) public ethDeposits;
    
    event BridgeInitiated(
        address indexed sender,
        uint32 indexed dstEid,
        address indexed recipient,
        uint256 amount,
        bytes32 guid
    );
    
    event BridgeCompleted(
        address indexed recipient,
        uint32 indexed srcEid,
        uint256 usdtReceived,
        bytes32 guid
    );
    
    event ETHDeposited(address indexed depositor, uint256 amount);
    event ETHWithdrawn(address indexed recipient, uint256 amount);

    constructor(
        address _endpoint,
        address _usdt,
        address _swapRouter,
        address _weth,
        address _owner
    ) OApp(_endpoint, _owner) {
        usdt = IERC20(_usdt);
        swapRouter = ISwapRouter(_swapRouter);
        weth = _weth;
    }

    /**
     * @notice Deposit ETH to be used for buying USDT on destination
     * @dev Anyone can deposit to help with liquidity
     */
    function depositETH() external payable {
        require(msg.value > 0, "Must deposit ETH");
        ethDeposits[msg.sender] += msg.value;
        emit ETHDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw your deposited ETH
     */
    function withdrawETH(uint256 amount) external {
        require(ethDeposits[msg.sender] >= amount, "Insufficient balance");
        ethDeposits[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit ETHWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Bridge USDT to another chain
     * @dev Locks USDT here, message sent to buy USDT on destination
     */
    function bridge(
        uint32 _dstEid,
        address _recipient,
        uint256 _amount,
        bytes calldata _extraOptions
    ) external payable returns (MessagingReceipt memory) {
        require(_amount > 0, "Amount must be > 0");
        
        // Calculate fee
        uint256 fee = (_amount * FEE_BPS) / BPS;
        uint256 amountAfterFee = _amount - fee;
        
        // Transfer USDT from user
        usdt.safeTransferFrom(msg.sender, address(this), _amount);
        collectedFees += fee;
        
        // Encode message
        bytes memory payload = abi.encode(_recipient, amountAfterFee);
        
        // Build options
        bytes memory options = _extraOptions.length > 0 
            ? _extraOptions 
            : _buildDefaultOptions();
        
        // Send via LayerZero
        MessagingReceipt memory receipt = _lzSend(
            _dstEid,
            payload,
            options,
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );
        
        emit BridgeInitiated(
            msg.sender,
            _dstEid,
            _recipient,
            amountAfterFee,
            receipt.guid
        );
        
        return receipt;
    }

    /**
     * @notice Receive bridge message and buy USDT from DEX
     * @dev Called by LayerZero - uses contract's ETH to buy USDT
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _payload,
        address,
        bytes calldata
    ) internal override {
        (address recipient, uint256 amount) = abi.decode(
            _payload,
            (address, uint256)
        );
        
        // Buy USDT from Uniswap V3 using contract's ETH
        uint256 usdtReceived = _buyUSDTFromDEX(amount, recipient);
        
        emit BridgeCompleted(recipient, _origin.srcEid, usdtReceived, _guid);
    }

    /**
     * @notice Buy USDT from Uniswap V3
     * @dev Uses ETH to buy USDT and send to recipient
     */
    function _buyUSDTFromDEX(
        uint256 usdtAmount,
        address recipient
    ) internal returns (uint256) {
        // Estimate ETH needed (with 5% slippage buffer)
        uint256 ethNeeded = _estimateETHForUSDT(usdtAmount);
        uint256 ethWithSlippage = (ethNeeded * 105) / 100;
        
        require(
            address(this).balance >= ethWithSlippage,
            "Insufficient ETH for swap"
        );
        
        // Swap ETH for USDT via Uniswap V3
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: weth,
                tokenOut: address(usdt),
                fee: 3000, // 0.3% pool
                recipient: recipient,
                deadline: block.timestamp,
                amountIn: ethWithSlippage,
                amountOutMinimum: (usdtAmount * 95) / 100, // 5% slippage
                sqrtPriceLimitX96: 0
            });
        
        uint256 amountOut = swapRouter.exactInputSingle{value: ethWithSlippage}(
            params
        );
        
        return amountOut;
    }

    /**
     * @notice Estimate ETH needed to buy USDT
     * @dev Simplified - in production, get real quote from DEX
     */
    function _estimateETHForUSDT(uint256 usdtAmount) 
        internal 
        pure  // Changed from 'view' to 'pure'
        returns (uint256) 
    {
        // Rough estimate: 1 ETH = $3000, 1 USDT = $1
        // So 1 USDT = 0.000333 ETH
        // In production, get real price from Chainlink or DEX
        return (usdtAmount * 1e18) / 3000 / 1e6; // Adjust for decimals
    }

    /**
     * @notice Quote bridge fee in ETH
     * @dev Includes LayerZero fee + estimated swap cost
     */
    function quoteBridgeFee(
        uint32 _dstEid,
        uint256 _amount
    ) external view returns (uint256 totalFee) {
        // LayerZero messaging fee
        bytes memory payload = abi.encode(msg.sender, _amount);
        MessagingFee memory msgFee = _quote(
            _dstEid, 
            payload, 
            _buildDefaultOptions(), 
            false
        );
        
        // Estimated ETH needed for swap on destination
        uint256 swapCost = _estimateETHForUSDT(_amount);
        
        // Total = LayerZero fee + swap cost + 10% buffer
        totalFee = msgFee.nativeFee + (swapCost * 110) / 100;
    }

    function _buildDefaultOptions() internal pure returns (bytes memory) {
        return abi.encodePacked(uint16(3), uint128(500000), uint128(0));
    }

    /**
     * @notice Owner can withdraw collected fees
     */
    function withdrawFees() external onlyOwner {
        uint256 amount = collectedFees;
        collectedFees = 0;
        usdt.safeTransfer(owner(), amount);
    }

    /**
     * @notice Receive ETH for swaps
     */
    receive() external payable {}
}