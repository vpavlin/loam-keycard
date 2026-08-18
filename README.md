# loam-keycard

A **Status Keycard as a Loam signing identity.** The card holds the private key; every write is a
tap-to-sign on-chip. Sibling to [loam-transport](https://github.com/vpavlin/loam-transport) and
[loam-sync](https://github.com/vpavlin/loam-sync) — the reusable identity piece extracted from
[scala](https://github.com/vpavlin/scala) so kym / qaku / perun can share it.

Because a Loam event is **self-describing** (`pub` / `sig` / `dev`), a card-authored event verifies
exactly like a software-authored one — adopting Keycard needs **no change to the wire, the fold, or
the desktop core** (except a signatures-required calendar, which is an app-side fold flag).

## Two layers

| file | what |
|------|------|
| `keycard.ts` | the raw **NFC driver** — `signDigestOnCard(digest32, {pin, pairingPassword, path?})`, `abortKeycardSign()`, `keycardProbe()`, and the three sig adapters (see below). No app or storage assumptions. |
| `session.ts` | **enrollment + custody** — `createKeycardSession({storagePrefix})`: enroll once, implicit-PIN unlock, tap-per-sign, in-memory PIN cache, a `"idle"|"tap"` state bus for a "hold your card" overlay. Returns **raw signature material**; the app maps it onto its event. |

### The three adapters (why the raw SDK output isn't enough)
1. `r`/`s` come minimal-length big-endian → left-pad each to 32 (→ 64-byte compact `r‖s`).
2. `s` may be high-S → normalize to low-S (`n − s`) for canonical / @noble-verifiable sigs.
3. the pubkey is uncompressed 65-byte `0x04…` → compress to 33-byte for address + verify.

The card signs the **raw 32-byte digest** (no re-hash). Result nests under `res.data.cbFuncResponse`
(not `res.data`), with no `status` flag — a present `r`/`s`/`pub` is success.

## Install

Peer deps (the app already ships these on RN New Architecture): `react-native-keycard`,
`keycard-sdk`, `expo-secure-store`, `@noble/curves`, `@noble/hashes`. Requires the RN New
Architecture (Expo 57 / RN 0.86+, `newArchEnabled`).

Two adoption modes, matching the Loam ecosystem:
- **npm**: `npm i loam-keycard` and `import { createKeycardSession } from "loam-keycard"`.
- **vendor** (what scala does today): copy `src/keycard.ts` + `src/session.ts` into
  `src/lib/loam-keycard/` and write a ~15-line app shim. Keep them in sync with this repo.

## Use (mobile)

```ts
import { createKeycardSession } from "loam-keycard";
import { sha256 } from "@noble/hashes/sha256";

const kc = createKeycardSession({ storagePrefix: "myapp-keycard" });
await kc.loadEnrollment();

// enroll once (PIN + pairing) — the card's address becomes the identity
await kc.enroll(pin, pairing);

// register a PIN modal so locked signs prompt implicitly (one tap = verify PIN + sign)
kc.setPinProvider(() => showPinModal());   // returns Promise<string|null>

// author an event: set author, digest your canonical form, sign on the card
ev.dev = kc.address();
const { compact, pubHex } = await kc.signDigest(sha256(utf8(canonicalMessage(ev))));
ev.pub = pubHex; ev.sig = hex(compact);
```

Or as a **logos-sync `AsyncSigner`**:

```ts
const signer = { pub: kc.pubHex()!, signAsync: (d) => kc.signDigest(d).then((s) => s.compact) };
// logos-sync signEventAsync(signer, DOMAIN, ev)
```

Cancel an in-flight tap with `abortKeycardSign()`; drive the overlay from `kc.onState(...)`.

## Keycard on the **desktop** (Basecamp) — the delegation path

A desktop has no NFC radio, so you can't tap the card on Basecamp directly. The intended answer is
**delegation** (logos-sync ADR 0008 custody):

1. Basecamp generates an ephemeral **delegate keypair**; shows `delegatePub` (QR).
2. The **phone** (which has NFC + the card) taps once to **issue a card-signed delegation
   certificate** over `delegatePub` (`idSig` over `canonicalCert`, bounded by `notAfter` /
   `maxSigs` / `scope`). Cert returns to Basecamp (QR or over Loam).
3. Basecamp signs events with its delegate key and **attaches the cert**; peers verify
   delegate-sig → cert → card pubkey, with expiry checked against the event's `hlc.wall` (never
   wall-clock — that would diverge the CRDT).

The card stays on the phone; the delegate private key stays on the desktop; the card re-taps only
on expiry. logos-sync already implements the cert layer (`DelegationCert`, `canonicalCert`,
`verifyCert`, `issueCertAsync`, cert-aware `verifyEvent`). **Gap to ship it:** the desktop C++ fold
must gain the same cert-aware verify (today it does direct `pub`/`sig` only). Alternatives: a USB
PC/SC contactless reader for true per-write taps on desktop, or a remote "phone signs each event"
bridge (simplest, worst UX).

## Provenance

Extracted from scala's `src/lib/loam-keycard/`. Built on the choppu Keycard stack
(`react-native-keycard` + `keycard-sdk`). The `AUTH_CERT` is the Keycard CA public key (Secure
Channel V2), the same value keycard-cli / Status use to verify a genuine card.
