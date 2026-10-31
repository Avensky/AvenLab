use argon2::{
    Argon2, PasswordHasher, PasswordVerifier,
    password_hash::{PasswordHash, SaltString, rand_core::OsRng},
};
use sha2::{Digest, Sha256};

pub fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

pub fn password_hash(password: &str) -> Result<Option<String>, String> {
    if password.is_empty() {
        return Ok(None);
    }
    if !(4..=64).contains(&password.chars().count()) || password.len() > 256 {
        return Err("Use a password with 4–64 characters.".into());
    }
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|value| Some(value.to_string()))
        .map_err(|_| "Could not protect the world password.".into())
}

pub fn password_matches(password: &str, hash: &str) -> bool {
    password.len() <= 256
        && PasswordHash::new(hash).is_ok_and(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn passwords_are_salted_and_never_stored_as_plain_text() {
        let one = password_hash("world-key").unwrap().unwrap();
        let two = password_hash("world-key").unwrap().unwrap();
        assert_ne!(one, two);
        assert!(!one.contains("world-key"));
        assert!(password_matches("world-key", &one));
        assert!(!password_matches("wrong", &one));
        assert_eq!(password_hash("").unwrap(), None);
        assert!(password_hash("abc").is_err());
    }
}
