// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Isolated Anvil route fixture. Never deploy or use this router on a live chain.
interface FixtureToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
contract LifecycleSwap {
    struct Description {
        address srcToken; address dstToken; address srcReceiver; address dstReceiver;
        uint256 amount; uint256 minReturnAmount; uint256 flags;
    }
    receive() external payable {}
    function swap(address, Description calldata desc, bytes calldata data)
        external payable returns (uint256 returnAmount, uint256 spentAmount)
    {
        require(desc.flags == 0, "flags");
        if (desc.srcToken == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE))
            require(msg.value == desc.amount, "native amount");
        else require(FixtureToken(desc.srcToken).transferFrom(msg.sender, address(this), desc.amount), "input");
        returnAmount = abi.decode(data, (uint256));
        require(returnAmount >= desc.minReturnAmount, "minimum output");
        require(FixtureToken(desc.dstToken).transfer(desc.dstReceiver, returnAmount), "output");
        return (returnAmount, desc.amount);
    }
}
