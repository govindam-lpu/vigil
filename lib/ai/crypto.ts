import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// App-level envelope encryption for BYOK provider keys. AES-256-GCM; the 32-byte key is
// derived from AI_KEY_ENC_SECRET (any length) via SHA-256. The master secret lives only in
// server/worker env — never in the DB or the browser — so stored ciphertext is opaque at rest.
// Serialized form: base64(iv).base64(authTag).base64(ciphertext).

const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const secret = process.env.AI_KEY_ENC_SECRET;
  if (!secret) {
    throw new Error("AI_KEY_ENC_SECRET is not configured");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

export function lastFour(secret: string): string {
  return secret.slice(-4);
}
