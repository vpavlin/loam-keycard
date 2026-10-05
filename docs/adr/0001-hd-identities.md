# ADR 0001 — Deterministic, unlinkable identities from one root

Status: **Proposed** (2026-10-05)

## Context

Our apps (Scala, Kith, QAKU, KYM, Perun, WhisperBox) sign every event with a secp256k1 key. The address is `"0x" + hex(sha256(compressedPub))[24:64]`, identical on every platform. Today:

- **Desktop** (`loam_core`): one identity store per machine, shared by every app, with device, soft and Keycard identities and a per-container binding.
- **Phone:** every app generates its own device key (`scala-identity-key`, `kith-identity-key`, …), so one person has a different address in each app.
- **Keycard** derives at `m/43'/60'/1582'/<sha256("logos-"+domain)>` with one domain per app, so one card is again one address per app.

Two problems follow.

1. **Wrong address.** Kith stores "a person's address", but it is often not the one they sign Scala with, so a role granted to it reaches nobody.
2. **Linking.** If we fix (1) by using a single address everywhere, then anyone who shares a calendar *and* a QAKU room with you can tell it is you. QAKU already has a mild version of this: one key per device across all rooms.

We want both at once: **one thing to back up and move between devices, and identities that cannot be linked to each other unless you choose to.**

## Decision

### One root, many derived identities

- Each person has **one root secret**, either:
  - **on a Keycard**: the root never leaves the card, and the card derives and signs on-card; or
  - **as a BIP39 phrase** held by Loam (the Loam app's secure storage on Android, `loam_core` on desktop), backed up as 12 words.
- Every identity is a **hardened BIP32 child** at a deterministic path in the EIP-1581 (non-wallet keys) tree, so derived keys do not reveal that they share a root:

  ```
  m / 43' / 60' / 1581' / A' / C0' / C1' / C2' / C3'
    A  = app index         = first 31 bits of sha256("loam-app:" + appId)
    C* = context index     = 4 × 31 bits of sha256("loam-ctx:" + appId + ":" + contextId)
  ```

  The context is a calendar, room, book or budget id. Splitting it into four indices follows Keycard's existing domain path and makes collisions negligible.
- Signing keys on a Keycard use the card's non-exportable `1582'` subtree with the same sub-path. Software roots use `1581'`.
- **The main identity** has a fixed path: `m/43'/60'/1581'/0'/0'`. It is the one you give to family and friends; it goes into their Kith, and Scala grants household roles to it.

### Which identity an app uses

| Space | Default | User can change to |
|---|---|---|
| Household / family calendar, Kith book | **main** | per-context |
| Any other calendar, book or budget | **per-context** | main |
| QAKU room | **per-context, always** | (no change offered) |

A person can **prove on purpose** that two identities are both theirs by signing one statement with both keys. Otherwise nobody can tell.

### What syncs between your devices

Derivation is deterministic, so no private key ever needs to sync. Devices share only a small **binding registry**: which contexts use main and which use per-context, display labels, and which devices are yours. Following the Logos AccountLog shape:

- It is an append-only, domain-separated log (add/remove entries; a copy is accepted only if it extends the one you hold), signed by the main identity.
- It is sealed with a key derived from the root, on a topic derived from the root, so all your devices find it and nobody else can read it.
- It **never lists per-context keys** (that would link them). Per-context keys are always re-derived from the root plus the context id.

### Who derives and signs

Loam, on both platforms. Apps ask Loam for "the identity for (app, context)" and ask Loam to sign a digest.

- **Desktop:** `loam_core` gains derivation, and `signAsync(digest, app, context)` is shipped (it was designed and deferred).
- **Android:** the Loam app's AIDL service gains `getIdentity(app, context)` and `sign(app, context, digest)`. Each app keeps its own local key only as a fallback for when Loam is not installed.
- **Keycard:** Loam drives the card (tap-per-sign or a delegation certificate, as designed in loam-sync ADR 0009).

## Relation to Logos accounts (checked 2026-10-05)

The Logos team's account stack does not fit our needs today, so we **align with it rather than adopt it or wait for it.**

- **`keystore_module` (EVM wallet vault):**
  - It is BIP39 + BIP44 `m/44'/60'/…`, with the purpose fixed, so it has no `1581'` identity paths.
  - Every signature needs a human to approve it with the vault password.
  - It has no Android and no Keycard support.
- **`accounts_ui` (AccountLog, v0.3.0):**
  - The account key is a random Ed25519 key with no seed, which a Keycard cannot hold.
  - Its log is public, which would link per-context keys.
  - It has no API for other modules and no Android support.
- **None of these ships by default with Basecamp 0.3.**

How we align, so we can switch later:

- Use the same BIP39 phrase handling.
- Use scrypt v3 (eth-keystore) for any software vault on disk.
- Keep the binding registry in AccountLog shape.
- Questions are open with the Logos team: secp256k1 accounts, standing grants for app signing, `1581'` paths, mobile.

## Consequences

**Good:**

- One backup (a card or 12 words) recovers every identity on every device.
- No key sync is needed.
- Identities are unlinkable by default.
- Kith → Scala works, because Kith stores the identity a person chose to share with you, and that is the one Scala grants roles to.
- Keycard and software roots behave the same way.

**Costs:**

- Whoever holds the root holds every identity. The Keycard is the strong option; without one, the phrase sits in Loam's secure storage. Delegation certificates can limit what each device holds.
- **One-time migration:** today's per-app phone keys and per-app Keycard domains are replaced, so existing roles must be granted again. Old events stay valid (they carry their own public key); only future authorship moves.
- Identities can still be linked by timing and behaviour within the same group of people. This design removes the *cryptographic* link only.
- Loam becomes required for the best behaviour. Apps without Loam fall back to a local per-app key, which still works, but it is not your main identity.

## Next steps

1. Prototype derivation and the path scheme in this package, with test vectors shared between TypeScript and C++ (`loam_core`).
2. Add the identity and sign calls to Loam (AIDL) and `loam_core`, then switch Kith and Scala to them.
3. Add a Kith "Me" QR showing the main identity, and Scala "pick from Kith".
4. Change QAKU to a per-room identity.
5. Send the open questions to the Logos team.
