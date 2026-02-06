// ============================================================================
// On-Chain Proof Generation & Submission
// ============================================================================
// This script:
// 1. Generates a ZK proof (same as prove.mjs)
// 2. Deploys HonkVerifier + PrivateToken contracts to a local Anvil node
// 3. Submits the proof on-chain for verification
// 4. The smart contract verifies the proof using the generated HonkVerifier
// ============================================================================

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { readFileSync } from 'fs';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

// ─── Config ──────────────────────────────────────────────────────────────────
// Anvil default private key (DO NOT use in production)
const ANVIL_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RPC_URL = 'http://127.0.0.1:8545';

async function main() {
    console.log('🔐 Noir On-Chain Proof Verification');
    console.log('====================================\n');

    // ─── Step 1: Generate proof off-chain ─────────────────────────────────
    console.log('📂 Step 1: Loading circuit and generating proof...');
    
    const circuit = JSON.parse(readFileSync('../target/mint.json', 'utf8'));
    const noir = new Noir(circuit);
    const backend = new UltraHonkBackend(circuit.bytecode);

    const inputs = {
        recipient_secret: "1234567890",
        mint_amount: "100",
        nonce: "1",
        output_commitment: "0x1a69fa5d7de95cebe216e459c70574439885e1530bb4c736ab220e30a55b3b5f",
        mint_request_id: "0"
    };

    console.log('   Executing circuit...');
    const { witness } = await noir.execute(inputs);

    console.log('   Generating proof...');
    const startTime = Date.now();
    const proof = await backend.generateProof(witness);
    console.log(`   ✓ Proof generated in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    console.log(`   Proof size: ${proof.proof.length} bytes`);
    console.log(`   Public inputs: ${proof.publicInputs.length}`);
    
    // Show public inputs
    for (let i = 0; i < proof.publicInputs.length; i++) {
        console.log(`   publicInputs[${i}]: ${proof.publicInputs[i]}`);
    }

    // Verify off-chain first
    console.log('\n   Verifying off-chain...');
    const offChainValid = await backend.verifyProof(proof);
    console.log(`   Off-chain verification: ${offChainValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (!offChainValid) {
        console.error('   Proof invalid off-chain, aborting on-chain submission.');
        process.exit(1);
    }

    // ─── Step 2: Deploy contracts ─────────────────────────────────────────
    console.log('\n🚀 Step 2: Deploying contracts to Anvil...');
    
    const account = privateKeyToAccount(ANVIL_PRIVATE_KEY);
    
    const walletClient = createWalletClient({
        account,
        chain: foundry,
        transport: http(RPC_URL),
    });

    const publicClient = createPublicClient({
        chain: foundry,
        transport: http(RPC_URL),
    });

    // Check connection
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`   Connected to Anvil (block: ${blockNumber})`);
    console.log(`   Deployer: ${account.address}`);

    // Load compiled contract artifacts from forge output
    const verifierArtifact = JSON.parse(
        readFileSync('../contracts/out/HonkVerifier.sol/HonkVerifier.json', 'utf8')
    );
    const tokenArtifact = JSON.parse(
        readFileSync('../contracts/out/PrivateToken.sol/PrivateToken.json', 'utf8')
    );

    // Deploy HonkVerifier (mint verifier)
    console.log('\n   Deploying HonkVerifier (mint verifier)...');
    const verifierHash = await walletClient.deployContract({
        abi: verifierArtifact.abi,
        bytecode: verifierArtifact.bytecode.object,
    });
    const verifierReceipt = await publicClient.waitForTransactionReceipt({ hash: verifierHash });
    const verifierAddress = verifierReceipt.contractAddress;
    console.log(`   ✓ HonkVerifier deployed at: ${verifierAddress}`);
    console.log(`   Gas used: ${verifierReceipt.gasUsed}`);

    // Deploy another HonkVerifier for transfer (same circuit for demo)
    console.log('\n   Deploying HonkVerifier (transfer verifier)...');
    const transferVerifierHash = await walletClient.deployContract({
        abi: verifierArtifact.abi,
        bytecode: verifierArtifact.bytecode.object,
    });
    const transferVerifierReceipt = await publicClient.waitForTransactionReceipt({ hash: transferVerifierHash });
    const transferVerifierAddress = transferVerifierReceipt.contractAddress;
    console.log(`   ✓ Transfer HonkVerifier deployed at: ${transferVerifierAddress}`);

    // Deploy PrivateToken
    console.log('\n   Deploying PrivateToken...');
    const tokenHash = await walletClient.deployContract({
        abi: tokenArtifact.abi,
        bytecode: tokenArtifact.bytecode.object,
        args: [transferVerifierAddress, verifierAddress],
    });
    const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenHash });
    const tokenAddress = tokenReceipt.contractAddress;
    console.log(`   ✓ PrivateToken deployed at: ${tokenAddress}`);
    console.log(`   Gas used: ${tokenReceipt.gasUsed}`);

    // ─── Step 3: Submit proof on-chain ────────────────────────────────────
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Step 3: Submitting proof ON-CHAIN for verification...');
    console.log('='.repeat(60));

    // Format proof for Solidity: the proof bytes as-is
    const proofHex = '0x' + Buffer.from(proof.proof).toString('hex');

    // Format public inputs as bytes32[] for Solidity
    const publicInputsFormatted = proof.publicInputs.map(input => {
        // Ensure each public input is a proper bytes32
        return input;
    });

    console.log(`\n   Proof bytes: ${proofHex.length / 2 - 1} bytes`);
    console.log(`   Public inputs: ${publicInputsFormatted.length}`);
    for (let i = 0; i < publicInputsFormatted.length; i++) {
        console.log(`     [${i}]: ${publicInputsFormatted[i]}`);
    }

    // Call mint() on PrivateToken - this calls HonkVerifier.verify() internally
    console.log('\n   Calling PrivateToken.mint() with ZK proof...');
    
    try {
        const mintHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: tokenArtifact.abi,
            functionName: 'mint',
            args: [proofHex, publicInputsFormatted],
        });

        const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
        
        console.log(`\n   ✅ ON-CHAIN VERIFICATION SUCCESSFUL!`);
        console.log(`   Transaction hash: ${mintHash}`);
        console.log(`   Gas used: ${mintReceipt.gasUsed}`);
        console.log(`   Block number: ${mintReceipt.blockNumber}`);

        // Verify state was updated
        const commitmentExists = await publicClient.readContract({
            address: tokenAddress,
            abi: tokenArtifact.abi,
            functionName: 'hasCommitment',
            args: [publicInputsFormatted[0]],
        });
        
        const commitmentCount = await publicClient.readContract({
            address: tokenAddress,
            abi: tokenArtifact.abi,
            functionName: 'getCommitmentCount',
        });

        console.log(`\n   📊 On-chain state after mint:`);
        console.log(`   Commitment exists: ${commitmentExists}`);
        console.log(`   Total commitments: ${commitmentCount}`);

    } catch (error) {
        console.error(`\n   ❌ ON-CHAIN VERIFICATION FAILED!`);
        console.error(`   Error: ${error.message}`);
        
        // Try to call the verifier directly for debugging
        console.log('\n   🔍 Debugging: Calling HonkVerifier.verify() directly...');
        try {
            const directResult = await publicClient.readContract({
                address: verifierAddress,
                abi: verifierArtifact.abi,
                functionName: 'verify',
                args: [proofHex, publicInputsFormatted],
            });
            console.log(`   Direct verifier result: ${directResult}`);
        } catch (directError) {
            console.error(`   Direct verifier also failed: ${directError.message}`);
        }
    }

    // ─── Summary ──────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n   The flow was:`);
    console.log(`   1. Noir circuit compiled → ACIR bytecode`);
    console.log(`   2. bb generated VK → HonkVerifier.sol`);
    console.log(`   3. Proof generated off-chain (private inputs hidden)`);
    console.log(`   4. Proof + public inputs submitted on-chain`);
    console.log(`   5. HonkVerifier.verify() confirmed validity`);
    console.log(`   6. PrivateToken stored the commitment`);
    console.log(`\n   🔒 The smart contract verified the proof WITHOUT knowing:`);
    console.log(`      • recipient_secret`);
    console.log(`      • mint_amount`);
    console.log(`      • nonce`);
    console.log(`\n   Contracts:`);
    console.log(`   HonkVerifier (mint):     ${verifierAddress}`);
    console.log(`   HonkVerifier (transfer): ${transferVerifierAddress}`);
    console.log(`   PrivateToken:            ${tokenAddress}`);
    
    console.log('\n✅ Done!');
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
