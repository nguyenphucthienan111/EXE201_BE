const crypto = require("crypto");

function deriveKey(source, expectedLength) {
  if (!source) return null;
  const value = source.trim();

  // Hex encoded
  if (/^[0-9a-fA-F]+$/.test(value) && value.length === expectedLength * 2) {
    return Buffer.from(value, "hex");
  }

  // Base64 encoded
  try {
    const base64 = Buffer.from(value, "base64");
    if (base64.length === expectedLength) {
      return base64;
    }
  } catch (err) {
    // Ignore and fallback to hash derivation
  }

  // Direct utf8 string with correct byte length
  if (Buffer.byteLength(value, "utf8") === expectedLength) {
    return Buffer.from(value, "utf8");
  }

  // Fallback: derive deterministic key using SHA-256
  return crypto
    .createHash("sha256")
    .update(value)
    .digest()
    .slice(0, expectedLength);
}

const KEY = deriveKey(process.env.JOURNAL_ENCRYPTION_KEY, 32);
const IV = deriveKey(process.env.JOURNAL_ENCRYPTION_IV, 16);

if (!KEY || !IV) {
  console.warn(
    "[JOURNAL ENCRYPTION] JOURNAL_ENCRYPTION_KEY/IV not provided. Journal data will be stored in plain text."
  );
} else {
  console.log(
    "[JOURNAL ENCRYPTION] Encryption active (key length=%d, iv length=%d).",
    KEY.length,
    IV.length
  );
}

function hasConfig() {
  return Boolean(KEY && IV);
}

function encryptValue(value) {
  if (!value || !hasConfig()) return value;
  const bufferValue = typeof value === "string" ? value : JSON.stringify(value);
  const cipher = crypto.createCipheriv("aes-256-cbc", KEY, IV);
  let encrypted = cipher.update(bufferValue, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function decryptValue(value) {
  if (!value || !hasConfig()) return value;
  if (!isProbablyEncrypted(value)) return value;
  try {
    const decipher = crypto.createDecipheriv("aes-256-cbc", KEY, IV);
    let decrypted = decipher.update(value, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decrypt value failed", err.message);
    return value;
  }
}

function isProbablyEncrypted(value) {
  if (!value || typeof value !== "string") return false;
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  return value.length % 4 === 0 && base64Regex.test(value);
}

module.exports = {
  encryptValue,
  decryptValue,
  hasEncryptionConfig: hasConfig,
  isProbablyEncrypted,
};
