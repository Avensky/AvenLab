use std::env;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("Cargo sets its manifest directory"));
    let frontend = root.join("../frontend");
    let script = frontend.join("scripts/discover-wardrobe-garments.mts");
    let wardrobe = frontend.join("public/models/characters/female/wardrobe");
    for input in [
        &script,
        &wardrobe,
        &frontend.join("tests/fixtures/villager-female-rig.json"),
        &root.join("src/assets/character-garments.json"),
    ] {
        if input.exists() {
            println!("cargo:rerun-if-changed={}", input.display());
        }
    }
    println!("cargo:rerun-if-env-changed=PATH");
    let destination = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo sets its output directory"))
        .join("discovered-wardrobe-garments.json");
    let mut catalog = b"[]".to_vec();
    if script.is_file() {
        match Command::new("node").arg(&script).output() {
            Ok(output) if output.status.success() && output.stdout.starts_with(b"[") => catalog = output.stdout,
            Ok(output) => {
                println!("cargo:warning=Wardrobe discovery skipped: {}", String::from_utf8_lossy(&output.stderr).lines().next().unwrap_or("invalid catalog output"));
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {
                println!("cargo:warning=Node is unavailable; only curated wardrobe items can be saved");
            }
            Err(error) => panic!("Could not run wardrobe discovery: {error}"),
        }
    }
    fs::write(destination, catalog).expect("write discovered wardrobe catalog");
}
