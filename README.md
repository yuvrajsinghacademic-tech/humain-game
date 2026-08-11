# hum(ai)n

**will you be replaced?**

A computer-AI horror game. An AI named **Darry** watches the choices you make, how
long you hesitate, and the patterns you repeat, then tries to predict you fifteen
times in a row. Every prediction is sealed before you are allowed to move, and the
machines stay dead until it exists.

No account. No database. Nothing about you is written to disk.

---

## Quick start

The whole game runs with **no secrets at all**. Mock mode engages automatically
when `OPENAI_API_KEY` is absent.

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**.

That is a complete, honest playthrough: real behavioural measurement, real sealed
predictions, real commitment verification. The only thing standing in for the model
is a deterministic local engine.

---

## Flow

```
opening  →  consent  →  choice ─┬─ begin assessment → 24 questions → results → booth
                                └─ skip to the game ──────────────────────────→ booth
booth  →  15 × (Darry picks → machines open → you choose → result)  →  ending
ending  →  play again  →  booth   (assessment never repeats)
```

- **Opening.** The wordmark and one button. Nothing else.
- **Consent.** A modal naming Darry, warning about the content, and stating plainly
  what is and is not collected. `Back` returns to an untouched opening.
- **Choice.** Answer questions first, or walk straight in.
- **Questions.** 24 of them, unexplained. A counter, two abstract options, and a bare
  `+1` or `0` where a reward landed. Darry interrupts every four to six questions.
- **Results.** `testing your results…` → `Your results have been tested.` →
  `Darry is ready.` No analytics are shown.
- **Booth.** `Darry is picking his answer...` with both machines greyed out and
  removed from the tab order, then `Darry has picked his answer.` and they open.
- **Ending.** `loading results…`, then `Unfortunately.`, then
  `You will be replaced.`, then the two percentages.

### Darry's interruptions are true

Every behaviour-specific line has a trigger checked against what the player actually
did — `you hesitated.` only after a response well above their own average,
`again.` only after a real run of repeats, `you changed your answer.` only after an
actual switch, `darry expected that.` only when their own measured habit predicted
the relation they just produced, `pattern forming.` only when the aggregate evidence
really moved. When nothing specific is supported, Darry says something true of any
answer instead. See `src/lib/behavior/interjections.ts` and its tests.

Two of the interruptions are scripted, immediately before the questions flagged for
them: the reactance measurement needs the system to claim it has seen something, and
those claims are the instrument.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Production build (also runs `tsc`) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit and component suite |
| `npm run test:e2e` | Playwright: both paths, replay, keyboard, phone, reduced motion |
| `npm run test:e2e:install` | Download the Chromium build Playwright needs |
| `npm run verify` | lint → typecheck → unit tests → production build |

Screenshot capture for reviewing the art direction:

```bash
CAPTURE=true CAPTURE_DIR=screenshots npx playwright test e2e/screenshots.spec.ts
```

---

## OpenAI usage

| Path | Interpretation | Predictions | Debrief | Total |
| --- | --- | --- | --- | --- |
| Assessment | 1 | ≤ 15 | 1 | **≤ 17** |
| Skip to the game | 0 | ≤ 15 | 1 | **≤ 16** |
| Play again | 0 | ≤ 15 | 1 | **≤ 16** |

Skipping cannot request an interpretation: that call is triggered by the results
phase and skipping never enters it. Replay does not re-enter it either.

- Model pinned server-side to `gpt-5.6-luna`; a client cannot select a model.
- Reasoning effort pinned to `low`; per-call output ceilings pinned.
- Structured outputs via the Responses API (`responses.parse` + `zodTextFormat`).
- `store: false` on every call.
- Darry **never** receives the hidden machine odds — it is predicting a person, not
  solving a bandit. There is no free-form player text anywhere in the game, so there
  is no prompt-injection surface by construction.
- What is sent: rounded behavioural rates, a compact choice/outcome/latency list, and
  the round number. No identifiers, no timestamps, no IP, no user agent.

The interpretation is no longer shown to the player. It is kept in memory and used
for the ending copy, so a paid call is never wasted.

---

## The precommitment

Darry's answer exists before you can act. That is enforced, not asserted.

1. `POST /api/predict` generates the prediction, wraps it in an envelope (prediction,
   confidence, reasoning, source, session reference, game, round, issue time, request
   id, **random nonce**), and serialises it canonically.
2. The envelope is encrypted with **AES-256-GCM** under an HKDF-derived key, with
   session, game and round bound in as additional authenticated data — so a ticket
   cannot be replayed into another round or lifted into another session.
3. The response contains only the opaque token and a SHA-256 commitment. The
   plaintext prediction is not in it.
4. The state machine leaves `booth_picking` only on a sealed ticket, and the machines
   are `disabled`, greyed, and `tabindex="-1"` until it does. The picking state is
   held for at least 500 ms so it is experienced rather than flickered past.
5. `POST /api/reveal` authenticates and decrypts, checks session, game, round and
   expiry, refuses replays, and returns the envelope verbatim — with no model call.
6. The client re-hashes that envelope against the commitment it received. A mismatch
   is recorded rather than swallowed.

**The hash is no longer shown to players.** It was technical furniture in a horror
game. The cryptography is unchanged and still fully covered: `tests/seal.test.ts`
proves the envelope round-trips and rejects every tampering path, and
`tests/api.test.ts` proves the revealed prediction hashes to the commitment
published before the choice and that a second reveal returns the *same* envelope
(identical `requestId` and `nonce`), which is what shows the reveal path does no
model work.

The end-to-end suite proves the ordering a different way, since there is no longer a
hash on screen to read: a `MutationObserver` installed before the app boots records
every transition, and the suite asserts that the machines never became usable except
in a commit where Darry's status already said it had picked, and that across the game
the machines never opened more times than Darry decided.

---

## Abuse and cost protection

Unchanged by the redesign. Every paid call passes through `authorizeAiCall`.

| Layer | Limit |
| --- | --- |
| Per-endpoint sliding window, per identity | 40/min predict, 8/min interpret, 8/min debrief, 80/min reveal |
| Per game | 1 interpretation, 15 predictions, 1 debrief |
| Per identity | 5 AI-backed games per rolling 24 hours |
| Globally | `GLOBAL_DAILY_OPENAI_CALL_LIMIT` per UTC day (default 2000) |

Also enforced: **fail closed in production** without Redis (no paid calls, game still
fully playable on the local engine), prediction idempotency, single-use reveals,
HMAC-hashed IP keys, server-issued signed HTTP-only session cookies, strict Zod
validation, a 16 KB body cap, round-number enforcement cross-checked against history
length, same-origin checks, server timeouts, fixed error codes with no stack traces,
and the security headers in `next.config.ts` including a CSP whose `connect-src 'self'`
means a behavioural profile could not be exfiltrated to another host.

`play again` issues a **new game id**, so the per-game quotas reset per game while the
per-identity 24-hour budget still applies.

---

## Data

Nothing behavioural is persisted. The profile lives in React state for the lifetime of
the tab: it carries across `play again` so Darry keeps learning, and a refresh is a
full reset.

The only key written is `humain.audio.muted`, which is a UI setting.

The previous release did persist profiles under `humain.v2`. Those keys are **deleted
on boot** rather than migrated — see `purgeRetiredProfiles` — so an old remembered
profile can never be silently loaded into this version. `REMEMBER ME` and `FORGET ME`
are gone along with the storage they managed.

The consent panel states all of this plainly: no camera, microphone, location,
contacts or history; only in-game choices and timing summaries reach Darry; and the
whole thing is entertainment, not a psychological diagnosis.

---

## Art direction

True black, cold off-white, one restrained error red, one sickly phosphor tone.
Everything is monospace — this is a machine's interface, not an editorial layout — on
a fully local font stack, so nothing is fetched at runtime and there is no FOUT.

Escalation runs off one custom property, `--dread`, which rises with progress and with
how well Darry is actually reading the player. It drives scanline weight, noise
opacity, red bleed and the vignette.

Glitches are authored, not sprayed: `.glitch-once` and `.glitch-hard` are one-shot
animations applied deliberately, `.chroma` is a static red/cyan separation, and
`useCorruption` swaps one or two glyphs of the wordmark on a jittered schedule of
about eight events per minute.

**Flash discipline.** No animation cycles opacity or colour faster than three times a
second. Under `prefers-reduced-motion` every displacement, shake, drift and blink is
removed while the grain, scanlines, vignette and colour remain, so the screen still
feels wrong without anything jumping. There is an end-to-end test for it.

---

## Architecture

```
src/
  app/                          layout, one page, five API routes
  components/                   Logo, Screen/CrtLayers/CornerMark, Glyph
  features/
    calibration/                QuestionView
    game/                       machine.ts (FSM), useGame.ts, Game.tsx,
                                Opening, Consent, ChoiceScreen, Interjection,
                                ResultsTesting
    prediction/                 Booth, api.ts, localTicket.ts
    ending/                     Ending
  lib/
    ai/                         client, prompts, schemas, orchestration (server-only)
    audio/                      one-track controller (track.ts) + hook
    behavior/                   trials, profile, predictor, narrative, interjections,
                                ending, scoring, rng, hydrate
    security/                   seal, commitment, session, guard, counters,
                                ratelimit, http, env
    storage/                    legacy purge only
    visual/                     useCorruption
  styles/                       globals.css
  types/
tests/                          unit + component suites
e2e/                            Playwright specs and helpers
reference/prediction-booth.html the original, archived unmodified
```

Boundaries that are load-bearing:

- **The state machine is pure.** No React, no fetch, no clock, no randomness. Each
  phase declares which events it accepts; anything else returns the same state object
  by identity. A late response for an abandoned round cannot rewind the game, a
  double-click cannot record two rounds, and a pull during `booth_picking` does
  nothing at all.
- **Domain logic is pure and testable.** Profile derivation, the local predictor, the
  interjection triggers and the ending numbers are all functions over data.
- **The model is server-only.** `src/lib/ai/*` and `src/lib/security/*` import
  `server-only`, so a client component importing them is a build error.

### Phases

`opening → consent → choice → assessment_active → results_testing →
(booth_picking → booth_ready → booth_result) ×15 → ending_loading → ending`

Skipping goes `choice → booth_picking` directly. `play again` goes
`ending → booth_picking`.

---

## What is actually measured

Every trait is smoothed toward an even prior and carries its own sample size and a
0–1 confidence, so a handful of questions can never produce a "100% predictable"
claim. Skipping the assessment starts Darry from a genuinely neutral profile: every
rate at 0.5, zero observations, zero confidence.

| Field | Definition |
| --- | --- |
| `winStayRate` | P(repeat \| previous rewarded choice paid) |
| `loseSwitchRate` | P(switch \| previous rewarded choice missed) |
| `alternationRate` | P(switch) across consecutive same-block choices |
| `explorationRate` | P(choose the option with the lower observed payoff) |
| `riskRate` | P(take the variable payoff over the fixed one) |
| `leftBias` | P(choose the left-rendered option), under counterbalanced placement |
| `recencyWeight` | P(follow the last outcome) when it conflicts with the whole record |
| `reactanceRate` | Change in switching after Darry claims a pattern, centred on 0.5 |
| `consistencyScore` | In-sample hit rate of the best single naive heuristic, rescaled |
| `winStreakStay` | P(repeat \| two or more consecutive payouts) |
| `lossStreakSwitch` | P(switch \| two or more consecutive misses) |
| `meanDecisionMs` | Mean commit latency, non-timed-out questions |
| `switchDecisionMs` / `repeatDecisionMs` | Latency split by repeat vs switch |
| `hesitationDeltaMs` | `switchDecisionMs − repeatDecisionMs` |

Left/right placement is counterbalanced on a balanced shuffled schedule per block —
balanced so position bias is measurable, shuffled so it never degenerates into strict
alternation. Which option holds the better odds is randomised per game.

Booth rounds fold back into the same vocabulary, with each game in its own block so
the first pull of a new game is never read as a repeat of the last pull of the
previous one.

---

## Deploying to Vercel

Standard Next.js App Router conventions — no `vercel.json` needed.

1. **OpenAI.** Create a project-scoped key and **set a hard monthly budget** on that
   project before the first public link goes out. The in-app ceiling is a second line
   of defence, not the first.
2. **Upstash Redis.** Create a database in the region closest to your Vercel region and
   copy the **REST** URL and token.
3. **Environment variables** (Production and Preview):

| Variable | Required | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | for real AI | Without it the game runs on the local engine |
| `GAME_SEAL_SECRET` | **yes** | ≥32 chars, random |
| `UPSTASH_REDIS_REST_URL` | **yes in production** | Without it, paid calls fail closed |
| `UPSTASH_REDIS_REST_TOKEN` | **yes in production** | |
| `GLOBAL_DAILY_OPENAI_CALL_LIMIT` | recommended | Start low, e.g. `300` |
| `MOCK_AI` | no | Leave unset in production |
| `NEXT_PUBLIC_ALLOW_SEED` | no | Test-only. Never set in production |

4. `vercel` for a preview, `vercel --prod` for production.

### Post-deployment smoke test

- [ ] The opening shows the lowercase wordmark and one button, and nothing else.
- [ ] `curl -I https://<host>` shows `content-security-policy`, `x-frame-options`,
      `strict-transport-security`, and no `x-powered-by`.
- [ ] `x-humain-ai-source` is **absent** in production responses.
- [ ] Consent: `Back` returns to the opening, Escape closes it, focus returns to the
      opening button.
- [ ] `skip to the game` goes straight to the booth and shows no question.
- [ ] During a round, both machines are visibly greyed and unclickable until
      `Darry has picked his answer.`
- [ ] Devtools → Network → `predict`: the response has a token and a commitment and
      **no** `prediction` field.
- [ ] The ending's two percentages total exactly 100.
- [ ] `play again` returns to the booth without repeating the assessment, and the
      network shows no second `interpret` call.
- [ ] `localStorage` contains nothing but `humain.audio.muted`.
- [ ] Complete a playthrough on a phone. No horizontal scrolling anywhere.
- [ ] With `prefers-reduced-motion` enabled, nothing moves and everything is legible.

### Abuse-protection verification

- [ ] Play 5 complete games from one IP, then start a sixth: still playable, and
      `hg:games:*` in Upstash shows 5.
- [ ] `POST /api/predict` from another origin → `403 forbidden_origin`.
- [ ] `POST /api/predict` with no cookie → `401 no_session`.
- [ ] `POST /api/predict` with a 1 MB body → `413 body_too_large`.
- [ ] `POST /api/predict` with `round: 99` → `400`.
- [ ] Replay the same `predict` request for a round: same token back, no extra call
      on the OpenAI dashboard.
- [ ] Reveal a round twice with the same token → succeeds; with a different token →
      `400 invalid_ticket`.
- [ ] Set `GLOBAL_DAILY_OPENAI_CALL_LIMIT=1`, redeploy, play: the game completes and
      the dashboard shows one call.
- [ ] Remove the Upstash variables in a preview: the game remains fully playable and
      the dashboard shows **zero** calls.
- [ ] Confirm the OpenAI project budget is set.

---

## Credit

The booth mechanic descends from *The Prediction Booth*, archived unmodified at
`reference/prediction-booth.html`. That prototype was a nod to Binz et al.'s *Centaur*
(Nature, 2025), a model fine-tuned on over 10 million real human choices across 160
experiments. Nothing here is fine-tuned on anything; Darry measures one person for
ninety seconds and then shows them how little that took.

This is an entertainment experience. It is not a psychological assessment, and the
closing verdict is fiction written for the game.
