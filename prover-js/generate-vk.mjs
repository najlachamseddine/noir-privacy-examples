// Generate verification key for on-chain use
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { readFileSync, writeFileSync } from 'fs';
import { UltraHonkBackend } from '@aztec/bb.js';

async function main() {
    console.log('🔑 Generating Verification Key for On-Chain Verifier');
    console.log('=====================================================\n');
    
    // Load compiled circuit
    const circuit = JSON.parse(readFileSync('../target/mint.json', 'utf8'));
    console.log('📂 Circuit loaded');
    
    // Initialize backend
    const backend = new UltraHonkBackend(circuit.bytecode);
    console.log('⚙️  Backend initialized');
    
    // Get verification key
    console.log('\n🔨 Generating verification key...');
    const vk = await backend.getVerificationKey();
    
    // Save as raw binary (for bb contract generation)
    writeFileSync('../target/vk', Buffer.from(vk));
    console.log(`   📄 Saved: target/vk (${vk.length} bytes)`);
    
    // Also save as hex for reference
    const vkHex = '0x' + Buffer.from(vk).toString('hex');
    writeFileSync('../target/vk.hex', vkHex);
    console.log(`   📄 Saved: target/vk.hex`);
    
    console.log('\n✅ VK generated! Now run:');
    console.log('   cd /Users/nchamseddine/personal/playground/noir-privacy-examples');
    console.log('   bb contract_ultra_honk -k target/vk -o contracts/src/HonkVerifier.sol');
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
