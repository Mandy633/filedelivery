import { describe, it, expect } from "vitest";
import { generateKey, exportKey, importKey, encrypt, decrypt } from "./crypto";

describe("encrypt / decrypt", () => {
  it("round-trips arbitrary bytes", async () => {
    const key = await generateKey();
    const original = new TextEncoder().encode("hello, world!");
    const ciphertext = await encrypt(key, original.buffer as ArrayBuffer);
    const plaintext = await decrypt(key, ciphertext);
    expect(new Uint8Array(plaintext)).toEqual(original);
  });

  it("different plaintexts produce different ciphertexts", async () => {
    const key = await generateKey();
    const a = await encrypt(key, new TextEncoder().encode("aaa").buffer as ArrayBuffer);
    const b = await encrypt(key, new TextEncoder().encode("bbb").buffer as ArrayBuffer);
    expect(new Uint8Array(a)).not.toEqual(new Uint8Array(b));
  });

  it("same plaintext produces different ciphertexts (random IV)", async () => {
    const key = await generateKey();
    const buf = new TextEncoder().encode("same").buffer as ArrayBuffer;
    const c1 = await encrypt(key, buf);
    const c2 = await encrypt(key, buf);
    // IV is prepended; two encryptions of the same plaintext should differ
    expect(new Uint8Array(c1)).not.toEqual(new Uint8Array(c2));
  });
});

describe("key export / import", () => {
  it("exported key can decrypt what the original key encrypted", async () => {
    const key = await generateKey();
    const keyStr = await exportKey(key);
    const imported = await importKey(keyStr);

    const original = new TextEncoder().encode("cross-key test");
    const ciphertext = await encrypt(key, original.buffer as ArrayBuffer);
    const plaintext = await decrypt(imported, ciphertext);
    expect(new Uint8Array(plaintext)).toEqual(original);
  });

  it("exportKey produces URL-safe base64 without padding", async () => {
    const key = await generateKey();
    const str = await exportKey(key);
    expect(str).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(str).not.toContain("+");
    expect(str).not.toContain("/");
    expect(str).not.toContain("=");
  });

  it("importKey rejects an invalid key string", async () => {
    await expect(importKey("not-a-valid-key!!!")).rejects.toThrow();
  });
});
