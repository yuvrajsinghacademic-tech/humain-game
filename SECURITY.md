# Security

`hum(ai)n` calls a paid model from a server route and stores a rate-limit counter in
Redis. Everything below is about those two facts.

## Reporting

Open a GitHub issue for anything that is not itself exploitable. For something that is,
please use GitHub's **Report a vulnerability** flow (Security → Advisories) rather than a
public issue.

## What the design assumes

**A visitor is not trusted.** Every request body is schema-validated with bounded ranges
before it reaches a prompt, and no field a player can write is free text — the only
strings crossing the boundary are a server-issued game id (regex-checked) and a sealed
ticket. There is nothing for a player to write into a prompt, which is why prompt
injection is not in the threat model.

**A visitor may be a script.** The paid path sits behind four layers, cheapest first: a
per-endpoint sliding window, per-game quotas (1 interpretation, 15 predictions, 1
debrief), a per-identity budget of 5 model-backed games per 24 hours, and a hard global
daily call ceiling. A refusal is never an error the player sees: the local behavioural
engine answers instead and the game continues.

**The counter store may be down.** Production without Redis, or with a Redis that is
unreachable, erroring, or hanging, does not spend money. `authorizeAiCall` returns a
denial in all four cases and no OpenAI request is attempted. This is asserted by
`tests/failClosed.test.ts`, which spies on the SDK call itself and requires a call count
of exactly zero — with a control case proving the spy is genuinely wired.

**The prediction must not be forgeable or readable early.** Each round's prediction is
sealed in an AES-256-GCM envelope whose key is HKDF-derived with per-purpose domain
separation, with the session, game and round bound in as additional authenticated data.
The browser receives the ciphertext and a SHA-256 commitment, never the plaintext. The
envelope carries 16 bytes of random nonce, so a player cannot hash both candidate
predictions and read the answer early. Tickets expire, are single-use, and fail across
sessions, games, and rounds.

## What the server never does

- Return, log, or bundle a credential. `OPENAI_API_KEY` is reachable only from modules
  marked `import 'server-only'`, so a client component that imports one is a build
  error.
- Send the machines' payout odds to the model. It is predicting a person, not solving a
  bandit.
- Let a client choose the model, the reasoning effort, or a token ceiling.
- Return a provider message, a stack trace, or an internal filename. Every failure is
  one of a fixed set of codes and nothing else.
- Store a raw IP address. The rate-limit identity is an HMAC of a platform-set header,
  truncated, never persisted in the clear.

## What is stored

In the browser: one key, `humain.audio.muted`. No behavioural profile, no ticket, no
session material, no API response. Refreshing the tab is a full reset, by design.

On the server: rate-limit counters keyed by hashed identity and game id, all with
bounded TTLs (2 hours to 48 hours). Nothing else — `store: false` is set on every model
call, so no conversation is retained by the provider either.

## Known limitations

- **`script-src` includes `'unsafe-inline'`.** Next's hydration bootstrap and the
  framework's inline style injection need it without a nonce-issuing middleware.
  `connect-src 'self'` is the meaningful control: injected script still could not reach
  another host.
- **Game ids are accepted from the client.** They are server-issued and format-checked,
  but not bound to the session server-side, so a script can mint fresh ids. The
  per-identity game budget and the global daily ceiling are what actually bound spend;
  per-game quotas are the polite layer, not the load-bearing one.
- **The body cap is measured in characters, not bytes.** 16 K characters is up to ~64 KB
  of UTF-8. The platform's own request limit is the real backstop.

## Running it without any secrets

Nothing is required. With no `OPENAI_API_KEY`, the server treats every paid call as
unavailable and the local engine plays Darry — the same code path CI exercises. See the
README for the variables a real deployment wants.
