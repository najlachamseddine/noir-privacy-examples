// SPDX-License-Identifier: MIT
pragma solidity >=0.8.21;

import "forge-std/Script.sol";
import {HonkVerifier} from "../src/HonkVerifier.sol";
import "../src/PrivateToken.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the Noir-generated HonkVerifier (real on-chain verifier)
        // Using the same verifier for both mint and transfer for now
        // Generate separate verifiers per circuit for production
        HonkVerifier mintVerifier = new HonkVerifier();
        console.log("Mint HonkVerifier deployed to:", address(mintVerifier));
        
        HonkVerifier transferVerifier = new HonkVerifier();
        console.log("Transfer HonkVerifier deployed to:", address(transferVerifier));
        
        // Deploy PrivateToken with real verifiers
        PrivateToken token = new PrivateToken(
            address(transferVerifier),
            address(mintVerifier)
        );
        console.log("PrivateToken deployed to:", address(token));
        
        vm.stopBroadcast();
        
        // Output deployment summary
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("Mint HonkVerifier:", address(mintVerifier));
        console.log("Transfer HonkVerifier:", address(transferVerifier));
        console.log("Private Token:", address(token));
    }
}
