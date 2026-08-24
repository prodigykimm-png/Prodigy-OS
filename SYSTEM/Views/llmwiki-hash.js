(function (root) {
  "use strict";

  const ROUND_CONSTANTS = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const INITIAL_STATE = Object.freeze([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

  function utf8Bytes(value) {
    const text = String(value);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
    const bytes = [];
    for (let index = 0; index < text.length; index += 1) {
      let codePoint = text.charCodeAt(index);
      if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
          index += 1;
        } else codePoint = 0xfffd;
      } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) codePoint = 0xfffd;
      if (codePoint <= 0x7f) bytes.push(codePoint);
      else if (codePoint <= 0x7ff) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
      else if (codePoint <= 0xffff) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
      else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    }
    return Uint8Array.from(bytes);
  }

  function utf8ByteLength(value) { return utf8Bytes(value).length; }

  function rotateRight(value, bits) { return (value >>> bits) | (value << (32 - bits)); }
  function choose(x, y, z) { return (x & y) ^ (~x & z); }
  function majority(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
  function sigma0(x) { return rotateRight(x, 2) ^ rotateRight(x, 13) ^ rotateRight(x, 22); }
  function sigma1(x) { return rotateRight(x, 6) ^ rotateRight(x, 11) ^ rotateRight(x, 25); }
  function gamma0(x) { return rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3); }
  function gamma1(x) { return rotateRight(x, 17) ^ rotateRight(x, 19) ^ (x >>> 10); }

  function sha256Bytes(value) {
    const input = value instanceof Uint8Array ? value : Uint8Array.from(value || []);
    const bitLength = input.length * 8;
    const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(input);
    padded[input.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);
    const state = INITIAL_STATE.slice();
    const words = new Uint32Array(64);

    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
      for (let index = 16; index < 64; index += 1) words[index] = (gamma1(words[index - 2]) + words[index - 7] + gamma0(words[index - 15]) + words[index - 16]) >>> 0;
      let [a, b, c, d, e, f, g, h] = state;
      for (let index = 0; index < 64; index += 1) {
        const temp1 = (h + sigma1(e) + choose(e, f, g) + ROUND_CONSTANTS[index] + words[index]) >>> 0;
        const temp2 = (sigma0(a) + majority(a, b, c)) >>> 0;
        [h, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0];
      }
      state[0] = (state[0] + a) >>> 0;
      state[1] = (state[1] + b) >>> 0;
      state[2] = (state[2] + c) >>> 0;
      state[3] = (state[3] + d) >>> 0;
      state[4] = (state[4] + e) >>> 0;
      state[5] = (state[5] + f) >>> 0;
      state[6] = (state[6] + g) >>> 0;
      state[7] = (state[7] + h) >>> 0;
    }
    return state.map((word) => word.toString(16).padStart(8, "0")).join("");
  }

  function sha256(value) { return sha256Bytes(utf8Bytes(value)); }

  const api = Object.freeze({ sha256, sha256Bytes, utf8Bytes, utf8ByteLength });
  root.LLMWikiHash = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
