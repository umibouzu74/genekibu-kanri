// ─── Share Codec ────────────────────────────────────────────────────
// Encodes/decodes share data (substitutions + referenced slots) into a
// URL-safe string using browser-native CompressionStream (deflate) +
// base64url.  No external libraries required.

/**
 * @param {Uint8Array} buf
 * @returns {string} base64url-encoded string (no padding)
 */
function toBase64Url(buf) {
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param {string} str base64url-encoded string
 * @returns {Uint8Array}
 */
function fromBase64Url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

/**
 * Compress a UTF-8 string with deflate via CompressionStream.
 * @param {string} text
 * @returns {Promise<Uint8Array>}
 */
async function deflate(text) {
  const encoder = new TextEncoder();
  const input = encoder.encode(text);
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Decompress a deflate-compressed buffer to a UTF-8 string.
 * @param {Uint8Array} buf
 * @returns {Promise<string>}
 */
async function inflate(buf) {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  writer.write(buf);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c, { stream: true })).join("") +
    decoder.decode();
}

/**
 * Encode share payload into a URL-safe string.
 *
 * @param {{ slots: import("../types").Slot[], substitutions: import("../types").Substitute[], generatedAt: string }} data
 * @returns {Promise<string>}
 */
export async function encodeShareData(data) {
  const json = JSON.stringify(data);
  const compressed = await deflate(json);
  return toBase64Url(compressed);
}

/**
 * Decode a URL-safe string back into the share payload.
 *
 * @param {string} encoded
 * @returns {Promise<{ slots: import("../types").Slot[], substitutions: import("../types").Substitute[], generatedAt: string }>}
 */
export async function decodeShareData(encoded) {
  const buf = fromBase64Url(encoded);
  const json = await inflate(buf);
  try {
    return JSON.parse(json);
  } catch (err) {
    throw new Error(`共有データの解析に失敗しました: ${err?.message || err}`);
  }
}
