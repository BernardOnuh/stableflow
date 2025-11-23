// contracts/MockUSDT.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @notice Mock USDT token for testnet testing
 * @dev Anyone can mint for testing purposes
 */
contract MockUSDT is ERC20, Ownable {
    uint8 private _decimals;
    
    constructor() ERC20("Mock USDT", "USDT") Ownable() {
        _decimals = 6; // USDT uses 6 decimals
        
        // Mint initial supply to deployer
        _mint(msg.sender, 1000000 * 10**6); // 1 million USDT
    }
    
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
    
    /**
     * @notice Anyone can mint for testing
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    /**
     * @notice Mint to yourself (convenience function)
     */
    function gimme() external {
        _mint(msg.sender, 1000 * 10**6); // 1000 USDT
    }
    
    /**
     * @notice Faucet - gives 100 USDT to anyone who asks
     */
    function faucet() external {
        _mint(msg.sender, 100 * 10**6); // 100 USDT
    }
}
