// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
// Local-fork fixtures only. This is not a production wallet implementation.
contract TestWallet {
    address public immutable owner = msg.sender;
    struct Call { address to; bytes data; uint256 value; }
    receive() external payable {}
    function execute(Call[] calldata calls) external {
        require(msg.sender == owner, "owner only");
        for (uint256 i; i < calls.length; i++) {
            (bool ok, bytes memory result) = calls[i].to.call{value:calls[i].value}(calls[i].data);
            if (!ok) assembly { revert(add(result, 32), mload(result)) }
        }
    }
}
contract TestToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true;
    }
}
contract TestCredential { function balanceOf(address) external pure returns (uint256) { return 1; } }
