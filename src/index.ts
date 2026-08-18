// loam-keycard — a Status Keycard as a Loam signing identity. Shared across scala/kym/qaku/perun.
//
// Two layers:
//   • keycard.ts — the raw NFC driver: signDigestOnCard() + the r/s/pubkey adapters + a probe.
//   • session.ts — createKeycardSession(): enrollment, implicit-PIN unlock, tap-per-sign, PIN cache.
//
// Typical app use (per logos-sync authoring):
//   const kc = createKeycardSession({ storagePrefix: "myapp-keycard" });
//   await kc.loadEnrollment();
//   // author an event: set ev.dev = kc.address(); digest = sha256(canonicalMessage(ev));
//   const { compact, pubHex } = await kc.signDigest(digest);
//   ev.pub = pubHex; ev.sig = hex(compact);
// or as a logos-sync AsyncSigner:
//   const signer = { pub: kc.pubHex()!, signAsync: (d) => kc.signDigest(d).then((s) => s.compact) };
export {
  signDigestOnCard, abortKeycardSign, keycardProbe,
  compressPub, toCompactSig, pairingSecret, KEYCARD_PATH,
} from "./keycard";
export type { KeycardSig } from "./keycard";
export {
  createKeycardSession, addressForPub,
} from "./session";
export type {
  KeycardSession, KeycardSessionOpts, KeycardEnrollment, KeycardSignResult, KCState,
} from "./session";
