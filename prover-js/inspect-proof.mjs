import { readFileSync } from 'fs';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';

const circuit = JSON.parse(readFileSync('../target/mint.json', 'utf8'));
const noir = new Noir(circuit);
const backend = new UltraHonkBackend(circuit.bytecode);

const inputs = {
    recipient_secret: '1234567890',
    mint_amount: '100',
    nonce: '1',
    output_commitment: '0x1a69fa5d7de95cebe216e459c70574439885e1530bb4c736ab220e30a55b3b5f',
    mint_request_id: '0'
};

const { witness } = await noir.execute(inputs);
const proof = await backend.generateProof(witness);

const buf = Buffer.from(proof.proof);
console.log('Total proof bytes:', buf.length);
console.log('Total fields (/ 32):', buf.length / 32);
console.log('');
console.log('First 10 fields:');
for (let i = 0; i < 10; i++) {
    const field = buf.subarray(i * 32, (i + 1) * 32);
    const hex = '0x' + field.toString('hex');
    const num = BigInt(hex);
    console.log(`  Field ${i}: ${hex}`);
    if (num < 1000000n) console.log(`           decimal: ${num}`);
}

console.log('');
console.log('Public inputs from proof object:');
for (let i = 0; i < proof.publicInputs.length; i++) {
    console.log(`  [${i}]: ${proof.publicInputs[i]}`);
}

// Check if public inputs appear in the proof bytes
const pi0 = proof.publicInputs[0].replace('0x', '').padStart(64, '0');
const pi1 = proof.publicInputs[1].replace('0x', '').padStart(64, '0');
const proofHex = buf.toString('hex');

const pi0Idx = proofHex.indexOf(pi0);
const pi1Idx = proofHex.indexOf(pi1.replace(/^0+/, '') || '00'.repeat(32));

console.log('');
console.log(`Public input 0 found at byte offset: ${pi0Idx >= 0 ? pi0Idx / 2 : 'NOT FOUND'}`);
console.log(`Public input 0 found at field index: ${pi0Idx >= 0 ? pi0Idx / 64 : 'NOT FOUND'}`);

// Check VK
const vk = await backend.getVerificationKey();
const vkBuf = Buffer.from(vk);
console.log('');
console.log('VK size:', vkBuf.length, 'bytes');
console.log('VK first 5 fields:');
for (let i = 0; i < 5; i++) {
    const field = vkBuf.subarray(i * 32, (i + 1) * 32);
    const hex = '0x' + field.toString('hex');
    const num = BigInt(hex);
    console.log(`  VK Field ${i}: ${hex}`);
    if (num < 1000000n) console.log(`              decimal: ${num}`);
}
