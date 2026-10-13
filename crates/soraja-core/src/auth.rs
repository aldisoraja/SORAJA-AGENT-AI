use keyring::Entry;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Gagal mengakses Windows Credential Manager: {0}")]
    KeyringError(#[from] keyring::Error),
    #[error("Kredensial tidak ditemukan untuk provider: {0}")]
    NotFound(String),
}

const SERVICE_NAME: &str = "AgentSorajaAI_SecureStore";

/// Menyimpan API Key atau Token OAuth ke Windows Credential Manager (Ter-enkripsi DPAPI)
pub fn save_token(provider: &str, secret_token: &str) -> Result<(), AuthError> {
    let entry = Entry::new(SERVICE_NAME, provider)?;
    entry.set_password(secret_token)?;
    Ok(())
}

/// Mengambil API Key dari Windows Credential Manager
pub fn get_token(provider: &str) -> Result<String, AuthError> {
    let entry = Entry::new(SERVICE_NAME, provider)?;
    match entry.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Err(AuthError::NotFound(provider.to_string())),
        Err(e) => Err(AuthError::KeyringError(e)),
    }
}

/// Menghapus kredensial dari sistem operasi
pub fn delete_token(provider: &str) -> Result<(), AuthError> {
    let entry = Entry::new(SERVICE_NAME, provider)?;
    entry.delete_credential()?;
    Ok(())
}
