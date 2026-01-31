// Bypass certificate check for development (CRS download)
// Remove this in production!
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';

async function main() {
    console.log('🔐 Noir Proof Generator');
    console.log('=======================\n');
    
    console.log('📂 Loading circuit...');
    
    // Load compiled circuit
    const circuitPath = '../target/mint.json';
    const circuit = JSON.parse(readFileSync(circuitPath, 'utf8'));
    console.log('   Circuit loaded:', circuitPath);
    
    console.log('\n⚙️  Initializing Noir and backend...');
    
    // Initialize Noir with the circuit
    const noir = new Noir(circuit);
    const backend = new UltraHonkBackend(circuit.bytecode);
    
    console.log('   (This may download the CRS on first run)');
    
    // Input values matching Prover.toml
    const inputs = {
        recipient_secret: "1234567890",
        mint_amount: "100",
        nonce: "1",
        output_commitment: "0x1a69fa5d7de95cebe216e459c70574439885e1530bb4c736ab220e30a55b3b5f",
        mint_request_id: "0"
    };
    
    console.log('\n📝 Inputs:');
    console.log('   recipient_secret:', inputs.recipient_secret);
    console.log('   mint_amount:', inputs.mint_amount);
    console.log('   nonce:', inputs.nonce);
    
    console.log('\n🔨 Executing circuit and generating witness...');
    const { witness } = await noir.execute(inputs);
    console.log('   ✓ Witness generated');
    
    console.log('\n🔨 Generating proof...');
    const startTime = Date.now();
    
    // Generate proof from witness
    const proof = await backend.generateProof(witness);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`   ✓ Proof generated in ${duration}s`);
    console.log('   Proof size:', proof.proof.length, 'bytes');
    
    // Save proof
    writeFileSync('../target/mint_proof.bin', Buffer.from(proof.proof));
    console.log('   📄 Saved to: target/mint_proof.bin');
    
    // Verify the proof
    console.log('\n🔍 Verifying proof...');
    const isValid = await backend.verifyProof(proof);
    console.log('   Proof valid:', isValid ? '✓ YES' : '✗ NO');
    
    // Generate and save verification key
    console.log('\n🔑 Generating verification key...');
    const vk = await backend.getVerificationKey();
    writeFileSync('../target/mint_vk.bin', Buffer.from(vk));
    console.log('   📄 Saved to: target/mint_vk.bin');
    console.log('   VK size:', vk.length, 'bytes');
    
    // Demonstrate standalone verification (as a verifier would do)
    console.log('\n' + '='.repeat(50));
    console.log('🔐 STANDALONE VERIFICATION DEMO');
    console.log('   (As a verifier with NO knowledge of private inputs)');
    console.log('='.repeat(50));
    
    // Load proof from file (as verifier would receive it)
    const savedProof = readFileSync('../target/mint_proof.bin');
    console.log('\n📂 Loaded proof from file:', savedProof.length, 'bytes');
    
    // The verifier only knows:
    // 1. The circuit (public)
    // 2. The proof
    // 3. The public inputs
    console.log('\n📝 Public inputs (visible to verifier):');
    console.log('   output_commitment:', inputs.output_commitment);
    console.log('   mint_request_id:', inputs.mint_request_id);
    
    console.log('\n🔒 Private inputs (HIDDEN from verifier):');
    console.log('   recipient_secret: ????????');
    console.log('   mint_amount: ????????');
    console.log('   nonce: ????????');
    
    // Create a fresh backend for verification
    const verifierBackend = new UltraHonkBackend(circuit.bytecode);
    
    // Reconstruct the proof object
    const proofToVerify = {
        proof: new Uint8Array(savedProof),
        publicInputs: proof.publicInputs  // These come with the proof
    };
    
    console.log('\n🔍 Verifying...');
    const verificationResult = await verifierBackend.verifyProof(proofToVerify);
    
    if (verificationResult) {
        console.log('   ✅ PROOF IS VALID!');
        console.log('\n   The verifier now knows:');
        console.log('   • Someone knows a valid recipient_secret');
        console.log('   • The output_commitment was correctly computed');
        console.log('   • The mint_amount is non-zero');
        console.log('   • But NOT what the actual values are!');
    } else {
        console.log('   ❌ PROOF IS INVALID!');
    }

    console.log('\n✅ Done!');
}

main().catch(err => {
    console.error('❌ Error:', err);
    console.error('Stack:', err?.stack);
    process.exit(1);
});
