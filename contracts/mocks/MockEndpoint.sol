// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

// LayerZero V2 structs - must match exactly what OAppSender expects
struct MessagingParams {
    uint32 dstEid;
    bytes32 receiver;
    bytes message;
    bytes options; 
    bool payInLzToken;
}

struct MessagingFee {
    uint256 nativeFee;
    uint256 lzTokenFee;
}

struct MessagingReceipt {
    bytes32 guid;
    uint64 nonce;
    MessagingFee fee;
}

contract MockEndpoint {
    uint64 public nonce;
    uint256 public mockNativeFee = 0.001 ether;

    // Required by OAppCore constructor
    function setDelegate(address) external {}

    // Required by OAppSender._lzSend() - THIS IS THE KEY FIX
    // Must match ILayerZeroEndpointV2.send signature exactly
    function send(
        MessagingParams calldata /* _params */,
        address /* _refundAddress */
    ) external payable returns (MessagingReceipt memory) {
        nonce++;
        return MessagingReceipt({
            guid: keccak256(abi.encodePacked(block.timestamp, nonce)),
            nonce: nonce,
            fee: MessagingFee({nativeFee: mockNativeFee, lzTokenFee: 0})
        });
    }

    // Required by OAppSender._quote()
    function quote(
        MessagingParams calldata /* _params */,
        address /* _sender */
    ) external view returns (MessagingFee memory) {
        return MessagingFee({nativeFee: mockNativeFee, lzTokenFee: 0});
    }

    // Required by OAppCore
    function eid() external pure returns (uint32) {
        return 30110; // Mock as Arbitrum
    }

    // Helper to adjust mock fee for testing
    function setMockFee(uint256 _fee) external {
        mockNativeFee = _fee;
    }
}
