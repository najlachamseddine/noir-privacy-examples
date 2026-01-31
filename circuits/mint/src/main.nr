use std::hash::pedersen_hash;

// This circuit proves valid minting without revealing the recipient
fn main(
    // Private inputs
    recipient_secret: Field,
    mint_amount: Field,
    nonce: Field,
    
    // Public inputs
    output_commitment: pub Field,
    mint_request_id: pub Field
) {
    // 1. Compute recipient address from secret
    let recipient_address = pedersen_hash([recipient_secret]);
    
    // 2. Verify output commitment
    let computed_commitment = pedersen_hash([recipient_address, mint_amount, nonce]);
    assert(computed_commitment == output_commitment);
    
    // 3. Ensure mint amount is positive
    let zero_field: Field = 0;
    assert(mint_amount != zero_field);
}

// Helper function to compute commitment (for testing)
unconstrained fn compute_commitment(recipient_secret: Field, mint_amount: Field, nonce: Field) -> Field {
    let recipient_address = pedersen_hash([recipient_secret]);
    pedersen_hash([recipient_address, mint_amount, nonce])
}

#[test]
unconstrained fn test_compute_commitment() {
    // Use same values as Prover.toml
    let recipient_secret: Field = 1234567890;
    let mint_amount: Field = 100;
    let nonce: Field = 1;
    
    let commitment = compute_commitment(recipient_secret, mint_amount, nonce);
    println(f"output_commitment = {commitment}");
}


// compile and create witness: nargo compile --package mint && nargo execute --package mint
// create proof from withness using bb: source ~/.zshrc && bb prove -b target/mint.json -w target/mint.gz -o target/mint_proof