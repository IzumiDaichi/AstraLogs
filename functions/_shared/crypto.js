import { ApiError } from "./http.js";

function decodeBase64(value) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch (error) {
    throw new ApiError(503, "encryption_not_configured", "The encryption key is not configured correctly.");
  }
}

function encodeBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function loadMasterKey(env) {
  if (!env.ENCRYPTION_KEY) {
    throw new ApiError(503, "encryption_not_configured", "The encryption key is not configured.");
  }
  const rawKey = decodeBase64(env.ENCRYPTION_KEY);
  if (rawKey.length !== 32) {
    throw new ApiError(503, "encryption_not_configured", "The encryption key must decode to 32 bytes.");
  }
  try {
    return await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch (error) {
    throw new ApiError(503, "encryption_not_configured", "The encryption key could not be initialized.");
  }
}

export async function encrypt(plaintext, env) {
  const masterKey = await loadMasterKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      masterKey,
      new TextEncoder().encode(plaintext)
    ));
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);
    return encodeBase64(combined);
  } catch (error) {
    throw new ApiError(500, "encryption_failed", "The API key could not be encrypted.");
  }
}

export async function decrypt(encrypted, env) {
  const masterKey = await loadMasterKey(env);
  let combined;
  try {
    combined = decodeBase64(encrypted);
  } catch (error) {
    throw new ApiError(500, "decryption_failed", "The saved API key could not be decrypted.");
  }
  if (combined.length <= 12 + 16) {
    throw new ApiError(500, "decryption_failed", "The saved API key could not be decrypted.");
  }
  try {
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      masterKey,
      ciphertext
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    throw new ApiError(500, "decryption_failed", "The saved API key could not be decrypted.");
  }
}
