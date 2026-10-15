// Lets Willie unlock the desk with a password he chose instead of the raw GitHub token.
// The token is encrypted with a key derived from the password (PBKDF2-SHA256 -> AES-GCM)
// and the encrypted record is stored publicly in data/key.json. Only the password opens it,
// so the password must be long: the record can be attacked offline.

export const DEFAULT_ITERATIONS = 600000;
const MIN_LENGTH = 12;

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function passwordProblem(password) {
  if ((password || '').trim().length < MIN_LENGTH) {
    return `Use at least ${MIN_LENGTH} characters. A few random words works well, like “pickle harbor violet”.`;
  }
  return null;
}

export async function encryptToken(token, password, { iterations = DEFAULT_ITERATIONS } = {}) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token));
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptToken(record, password) {
  if (!record || record.v !== 1 || !Number.isInteger(record.iterations)) {
    throw new Error('The saved password data is unreadable.');
  }
  try {
    const key = await deriveKey(password, fromB64(record.salt), record.iterations);
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(record.iv) }, key, fromB64(record.ct));
    return dec.decode(pt);
  } catch {
    throw new Error('Wrong password.');
  }
}
