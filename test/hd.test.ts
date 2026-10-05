// ADR 0001 derivation: library sanity (official BIP39/BIP32 vectors) + our own path/address vectors,
// which the C++ side (loam_core) must reproduce bit-for-bit. Regenerate ours with GENERATE=1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HdRoot, keyPathFor, signPathFor, isValidMnemonic, newMnemonic, type IdentityRef } from "../src/hd.ts";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const VEC = new URL("./vectors/hd.json", import.meta.url);

test("BIP39 official vector (TREZOR passphrase)", () => {
  const seed = mnemonicToSeedSync("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", "TREZOR");
  assert.equal(hex(seed), "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04");
});

test("BIP32 official vector 1, m/0'", () => {
  const k = HDKey.fromMasterSeed(Buffer.from("000102030405060708090a0b0c0d0e0f", "hex")).derive("m/0'");
  assert.equal(k.privateExtendedKey, "xprv9uHRZZhk6KAJC1avXpDAp4MDc3sQKNxDiPvvkX8Br5ngLNv1TxvUxt4cV1rGL5hj6KCesnDYUhd7oWgT11eZG7XnxHrnYeSvkzY7d2bhkJ7");
});

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const REFS: [string, IdentityRef][] = [
  ["main", { kind: "main" }],
  ["scala/cal-1", { kind: "context", appId: "scala", contextId: "64436b43-94bd-4b6b-91c8-2936069f97cf" }],
  ["scala/cal-2", { kind: "context", appId: "scala", contextId: "57e0fb7d-8ba4-4fcd-ade9-17785ff7bba6" }],
  ["qaku/room-1", { kind: "context", appId: "qaku", contextId: "room-1" }],
  ["kith/book-1", { kind: "context", appId: "kith", contextId: "book-1" }],
];

function compute() {
  const root = HdRoot.fromMnemonic(MNEMONIC);
  return {
    mnemonic: MNEMONIC,
    passphrase: "",
    identities: REFS.map(([name, ref]) => {
      const d = root.derive(ref);
      return { name, ref, path: d.path, signPath: signPathFor(ref), privHex: hex(d.priv), pubHex: d.pubHex, address: d.address };
    }),
  };
}

test("our vectors are stable (shared with loam_core C++)", () => {
  const got = compute();
  if (process.env.GENERATE) { writeFileSync(VEC, JSON.stringify(got, null, 2) + "\n"); return; }
  assert.deepEqual(got, JSON.parse(readFileSync(VEC, "utf8")));
});

test("identities are distinct and deterministic", () => {
  const a = compute().identities, b = compute().identities;
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((x) => x.address)).size, a.length);
  for (const x of a) { assert.match(x.address, /^0x[0-9a-f]{40}$/); assert.match(x.pubHex, /^0[23][0-9a-f]{64}$/); }
});

test("paths: main and context shapes, card uses 1582'", () => {
  assert.equal(keyPathFor({ kind: "main" }), "m/43'/60'/1581'/0'/0'");
  const p = keyPathFor({ kind: "context", appId: "scala", contextId: "x" }).split("/");
  assert.equal(p.length, 9); assert.ok(p.slice(1).every((s) => s.endsWith("'")));
  assert.ok(signPathFor({ kind: "main" }).startsWith("m/43'/60'/1582'/"));
});

test("mnemonics: generate + validate, reject bad ones", () => {
  const m = newMnemonic();
  assert.equal(m.split(" ").length, 12); assert.ok(isValidMnemonic(m));
  assert.ok(!isValidMnemonic("abandon abandon abandon"));
  assert.throws(() => HdRoot.fromMnemonic("abandon ".repeat(12).trim()));
});
