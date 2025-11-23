// contracts/SimpleBridgeTestnet.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import {MessagingReceipt} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSender.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SimpleBridgeTestnet
 * @notice Simple USDT bridge for testnet - no DEX, just lock and release
 * @dev This version doesn't use DEX swaps - perfect for testnet testing!
 */
contract SimpleBridgeTestnet is OApp {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    
    uint256 public totalLocked;
    uint256 public totalBridged;
    
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
        uint256 amount,
        bytes32 guid
    );

    constructor(
        address _endpoint,
        address _usdt,
        address _owner
    ) OApp(_endpoint, _owner) {
        usdt = IERC20(_usdt);
    }

    /**
     * @notice Bridge USDT to another chain
     */
    function bridge(
        uint32 _dstEid,
        address _recipient,
        uint256 _amount,
        bytes calldata _extraOptions
    ) external payable returns (MessagingReceipt memory) {
        require(_amount > 0, "Amount must be > 0");
        require(_recipient != address(0), "Invalid recipient");
        
        // Transfer USDT from user and lock it
        usdt.safeTransferFrom(msg.sender, address(this), _amount);
        totalLocked += _amount;
        totalBridged += _amount;
        
        // Encode message
        bytes memory payload = abi.encode(_recipient, _amount);
        
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
            _amount,
            receipt.guid
        );
        
        return receipt;
    }

    /**
     * @notice Receive bridged USDT from another chain
     * @dev Called by LayerZero endpoint
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _payload,
        address /*_executor*/,
        bytes calldata /*_extraData*/
    ) internal override {
        (address recipient, uint256 amount) = abi.decode(
            _payload,
            (address, uint256)
        );
        
        // Check if we have enough USDT
        uint256 balance = usdt.balanceOf(address(this));
        require(balance >= amount, "Insufficient liquidity");
        
        // Release USDT to recipient
        totalLocked -= amount;
        usdt.safeTransfer(recipient, amount);
        
        emit BridgeCompleted(recipient, _origin.srcEid, amount, _guid);
    }

    /**
     * @notice Quote the LayerZero fee
     */
    function quoteFee(
        uint32 _dstEid,
        uint256 _amount,
        bytes calldata _extraOptions
    ) external view returns (MessagingFee memory fee) {
        bytes memory payload = abi.encode(msg.sender, _amount);
        bytes memory options = _extraOptions.length > 0 
            ? _extraOptions 
            : _buildDefaultOptions();
        
        fee = _quote(_dstEid, payload, options, false);
    }

    /**
     * @notice Build default options for LayerZero
     */
    function _buildDefaultOptions() internal pure returns (bytes memory) {
        // Option Type 3: lzReceive with gas amount
        return abi.encodePacked(
            uint16(3),      // option type
            uint128(200000), // gas for lzReceive
            uint128(0)      // native drop (not needed)
        );
    }

    /**
     * @notice Emergency withdraw (owner only)
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).safeTransfer(owner(), _amount);
    }

    /**
     * @notice Check bridge balance
     */
    function getBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }
}
