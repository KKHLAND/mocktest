const SECRET_SALT = "aistudio_gemini_mock_key_generation_salt_9128";

/**
 * Encrypts a plaintext string (API Key) into an obfuscated and encrypted Base64 string.
 */
export function encryptKey(text: string): string {
    if (!text) return "";
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
        result += String.fromCharCode(charCode);
    }
    return btoa(encodeURIComponent(result));
}

/**
 * Decrypts an encrypted Base64 string back into the plaintext API Key.
 */
export function decryptKey(encoded: string): string {
    if (!encoded) return "";
    try {
        const decoded = decodeURIComponent(atob(encoded));
        let result = "";
        for (let i = 0; i < decoded.length; i++) {
            const charCode = decoded.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    } catch (e) {
        console.error("Failed to decrypt API Key from localStorage", e);
        return "";
    }
}
