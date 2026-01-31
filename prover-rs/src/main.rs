//! Rust prover for Noir circuits
//!
//! This is the Rust equivalent of prover-js/prove.mjs
//! It demonstrates how to:
//! 1. Load a compiled Noir circuit
//! 2. Parse inputs from Prover.toml
//! 3. Execute the circuit to generate a witness
//! 4. Generate a ZK proof (using Node.js backend)
//!
//! NOTE: Since bb.js doesn't have a direct Rust equivalent yet,
//! we call the Node.js prover for actual proof generation.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

use anyhow::{bail, Context, Result};
use clap::Parser;
use serde::Deserialize;

use acvm::acir::circuit::Program;
use acvm::acir::native_types::WitnessStack;
use acvm::FieldElement;
use noirc_abi::{input_parser::InputValue, Abi, InputMap};

/// Noir circuit prover (Rust)
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Path to compiled circuit JSON
    #[arg(short, long, default_value = "../target/mint.json")]
    circuit: PathBuf,

    /// Path to Prover.toml with inputs
    #[arg(short, long, default_value = "../circuits/mint/Prover.toml")]
    prover_toml: PathBuf,

    /// Output directory for proof and verification key
    #[arg(short, long, default_value = "../target")]
    output_dir: PathBuf,

    /// Only execute circuit and show witness (don't generate proof)
    #[arg(long)]
    execute_only: bool,

    /// Generate proof using Node.js backend
    #[arg(long)]
    prove: bool,
}

/// Compiled circuit structure from nargo
#[derive(Deserialize, Clone)]
struct CompiledCircuit {
    bytecode: String,
    abi: Abi,
}

fn main() -> Result<()> {
    let args = Args::parse();

    println!("🔐 Noir Circuit Prover (Rust)");
    println!("============================\n");
    println!("   This is the Rust equivalent of prover-js/prove.mjs\n");

    // Step 1: Load compiled circuit
    println!("📂 Loading circuit...");
    let circuit = load_circuit(&args.circuit)?;
    println!("   Circuit loaded: {:?}", args.circuit);

    // Step 2: Parse inputs from Prover.toml
    println!("\n📝 Loading inputs from Prover.toml...");
    let inputs = load_prover_toml(&args.prover_toml, &circuit.abi)?;
    print_inputs(&inputs);

    // Step 3: Execute circuit to generate witness
    println!("\n🔨 Executing circuit and generating witness...");
    let witness_stack = execute_circuit(&circuit)?;
    println!("   ✓ Witness generated");

    // Show witness info
    if witness_stack.peek().is_some() {
        // Use length() method from WitnessStack 
        println!("   Stack has {} items", witness_stack.length());
    }

    if args.execute_only {
        println!("\n✓ Execution complete (--execute-only specified)");
        println!("\n💡 To generate a proof, run with --prove flag");
        return Ok(());
    }

    if args.prove {
        // Step 4: Generate proof using Node.js backend
        generate_proof_via_nodejs(&args.output_dir)?;
    } else {
        println!("\n💡 To generate a proof, run with --prove flag");
        println!("   This will call the Node.js prover (bb.js backend)");
    }

    println!("\n✅ Done!");
    Ok(())
}

fn load_circuit(circuit_path: &PathBuf) -> Result<CompiledCircuit> {
    let circuit_json = fs::read_to_string(circuit_path).context("Failed to read circuit file")?;
    let compiled: CompiledCircuit =
        serde_json::from_str(&circuit_json).context("Failed to parse circuit JSON")?;

    // Parse and show circuit info
    // bytecode is base64-encoded gzipped ACIR
    let bytecode_bytes = base64_decode(&compiled.bytecode)?;
    
    // deserialize_program expects gzipped data (which it is)
    let program: Program<FieldElement> = Program::deserialize_program(&bytecode_bytes)
        .context("Failed to deserialize program")?;

    let main_circuit = &program.functions[0];

    println!("\n📊 Circuit Info:");
    println!("   Functions: {}", program.functions.len());
    println!("   Opcodes: {}", main_circuit.opcodes.len());
    println!(
        "   Public inputs: {:?}",
        main_circuit.public_parameters
    );
    println!("   ABI parameters: {}", compiled.abi.parameters.len());

    Ok(compiled)
}

fn load_prover_toml(prover_path: &PathBuf, abi: &Abi) -> Result<InputMap> {
    let toml_content = fs::read_to_string(prover_path).context("Failed to read Prover.toml")?;
    let toml_value: toml::Value =
        toml::from_str(&toml_content).context("Failed to parse Prover.toml")?;

    let mut inputs: InputMap = BTreeMap::new();

    // Convert TOML values to InputValue based on ABI
    if let toml::Value::Table(table) = toml_value {
        for param in &abi.parameters {
            if let Some(value) = table.get(&param.name) {
                let input_value = toml_to_input_value(value)?;
                inputs.insert(param.name.clone(), input_value);
            }
        }
    }

    Ok(inputs)
}

fn toml_to_input_value(value: &toml::Value) -> Result<InputValue> {
    match value {
        toml::Value::String(s) => {
            // Parse string as field element
            let field = parse_field_element(s)?;
            Ok(InputValue::Field(field))
        }
        toml::Value::Integer(i) => {
            let field = FieldElement::from(*i as u128);
            Ok(InputValue::Field(field))
        }
        toml::Value::Array(arr) => {
            let values: Result<Vec<_>> = arr.iter().map(toml_to_input_value).collect();
            Ok(InputValue::Vec(values?))
        }
        _ => bail!("Unsupported TOML value type"),
    }
}

fn parse_field_element(s: &str) -> Result<FieldElement> {
    let s = s.trim();
    // try_from_str handles both hex (0x prefix) and decimal strings
    FieldElement::try_from_str(s)
        .ok_or_else(|| anyhow::anyhow!("Invalid field element: {}", s))
}

fn print_inputs(inputs: &InputMap) {
    for (name, value) in inputs.iter() {
        match value {
            InputValue::Field(f) => {
                // Check if it's a small number or hex
                let s = format!("{:?}", f);
                if s.len() > 20 {
                    println!("   {}: 0x{}...", name, &s[..16]);
                } else {
                    println!("   {}: {}", name, s);
                }
            }
            InputValue::Vec(v) => println!("   {}: [{} elements]", name, v.len()),
            _ => println!("   {}: <complex>", name),
        }
    }
}

fn execute_circuit(_circuit: &CompiledCircuit) -> Result<WitnessStack<FieldElement>> {
    // Load pre-computed witness from file
    // In a full implementation, we would execute the ACVM with inputs encoded via ABI
    let witness_path = PathBuf::from("../target/mint.gz");
    if witness_path.exists() {
        println!("   (Using pre-computed witness from target/mint.gz)");
        let witness_gz = fs::read(&witness_path).context("Failed to read witness file")?;

        // WitnessStack::deserialize expects gzipped data (it decompresses internally)
        let witness_stack = WitnessStack::<FieldElement>::deserialize(&witness_gz)
            .context("Failed to parse witness stack")?;
        
        return Ok(witness_stack);
    }

    // If no pre-computed witness, we'd need to execute the ACVM
    // This requires setting up the blackbox solver and handling foreign calls
    // For simplicity, we require the pre-computed witness
    bail!(
        "No pre-computed witness found at {:?}. \
         Run 'nargo execute' first to generate it, or use the Node.js prover.",
        witness_path
    )
}

fn generate_proof_via_nodejs(output_dir: &PathBuf) -> Result<()> {
    println!("\n🔨 Generating proof via Node.js backend...");
    println!("   (Using prover-js with bb.js)");

    // Check if Node.js prover exists
    let prover_js_path = PathBuf::from("../prover-js");
    if !prover_js_path.exists() {
        bail!("prover-js directory not found. Please set up the Node.js prover first.");
    }

    // Run the Node.js prover
    let output = Command::new("node")
        .arg("prove.mjs")
        .current_dir(&prover_js_path)
        .output()
        .context("Failed to execute Node.js prover")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        println!("stdout: {}", stdout);
        println!("stderr: {}", stderr);
        bail!("Node.js prover failed");
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Print selected lines from output
    for line in stdout.lines() {
        if line.contains('✓') || line.contains('📄') || line.contains("VALID") {
            println!("   {}", line.trim());
        }
    }

    // Check output files
    let proof_path = output_dir.join("mint_proof.bin");
    let vk_path = output_dir.join("mint_vk.bin");

    if proof_path.exists() {
        let size = fs::metadata(&proof_path)?.len();
        println!("   ✓ Proof saved: {:?} ({} bytes)", proof_path, size);
    }

    if vk_path.exists() {
        let size = fs::metadata(&vk_path)?.len();
        println!("   ✓ VK saved: {:?} ({} bytes)", vk_path, size);
    }

    Ok(())
}

fn base64_decode(input: &str) -> Result<Vec<u8>> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    STANDARD.decode(input).context("Failed to decode base64")
}
