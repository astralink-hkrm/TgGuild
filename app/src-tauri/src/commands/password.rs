use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

#[tauri::command]
pub async fn cmd_set_password(password: String) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash password: {}", e))?
        .to_string();
    Ok(hash)
}

#[tauri::command]
pub async fn cmd_verify_password(password: String, hash: String) -> Result<bool, String> {
    let parsed_hash = PasswordHash::new(&hash)
        .map_err(|e| format!("Invalid hash: {}", e))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}
