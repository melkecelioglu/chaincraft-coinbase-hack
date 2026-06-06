// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ContractFactory {
    uint256 public constant DEPLOY_FEE = 0.001 ether;
    address public constant FEE_RECIPIENT = 0x6D3be67aBbf8Ed44CAc4EB6122cf889378d6e3Dd;

    event ContractDeployed(address indexed deployer, address indexed deployed, uint256 fee);

    function deploy(bytes memory bytecode) external payable returns (address) {
        require(msg.value >= DEPLOY_FEE, "Insufficient fee");

        // Deploy child contract via CREATE
        address deployed;
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(deployed != address(0), "Deploy failed");

        // Send fee to recipient
        (bool sent, ) = FEE_RECIPIENT.call{value: DEPLOY_FEE}("");
        require(sent, "Fee transfer failed");

        // Refund excess ETH
        if (msg.value > DEPLOY_FEE) {
            (bool refunded, ) = msg.sender.call{value: msg.value - DEPLOY_FEE}("");
            require(refunded, "Refund failed");
        }

        emit ContractDeployed(msg.sender, deployed, DEPLOY_FEE);
        return deployed;
    }
}
