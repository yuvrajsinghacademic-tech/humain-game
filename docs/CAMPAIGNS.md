# Campaign routes

*Internal. Not published as a page.*

A campaign route is the same game at a second address. A code on a sticker in Silver
Lake points at `/silverlake`; the visitor plays exactly what a visitor to `/` plays,
and the only thing that differs is the line Vercel Web Analytics files the visit
under.

**The URL is the tracking.** There is no query string, no cookie, no identifier and
no second analytics provider. Nothing on screen tells the player where they came
from, and nothing is stored about them because of it.

---

## Where things live

| What | Where |
| --- | --- |
| The registry — every campaign, one row each | `src/lib/campaigns/index.ts` |
| The shared route that serves them | `src/app/[campaign]/page.tsx` |
| `/linkedin`, which has its own file | `src/app/linkedin/page.tsx` |
| QR generation | `scripts/generate-qr.mjs` (`npm run qr`) |
| Tests | `tests/campaigns.test.ts`, `e2e/phase2.spec.ts` |
| Creative notes for printed placements | `docs/internal/sticker-campaigns.md` |

The registry is the source of truth. The route, the metadata, the QR generator, the
sitemap exclusion and the tests all read from it.

---

## Adding a campaign

One edit, then two commands.

**1. Add a row** to `CAMPAIGNS` in `src/lib/campaigns/index.ts`:

```ts
{ slug: 'fairfax-a', channel: 'street', placement: 'Fairfax Ave', creative: 'A — WILL YOU BE REPLACED?' },
```

- `slug` — lowercase `a-z0-9`, single hyphens, 20 characters or fewer. It is going on
  a sticker; somebody may have to type it.
- `channel` — `street`, `campus` or `social`. Internal grouping only.
- `placement` — human-readable. You will be reading an analytics table months from
  now with no memory of what `dtla` meant.
- `creative` — only when a placement is running an A/B pair. See below.

**2. Verify.**

```bash
npm run qr -- --list      # the row is there, with the URL it will encode
npm test                  # the registry's own invariants
npm run build             # the route is prerendered
```

**3. Generate the code.**

```bash
npm run qr -- fairfax-a
```

That is the whole procedure. No route file is created, no metadata is written, no
sitemap is edited. `/fairfax-a` exists as a prerendered static page from the next
build.

---

## Naming convention

- Lowercase, hyphen-separated, no underscores. `sunset-a`, not `Sunset_A`.
- **Place, not campaign week.** `melrose`, not `melrose-jan`. A sticker outlives the
  month it was printed in, and a date in the slug turns a still-scanning code into a
  meaningless label.
- **A suffix letter means a creative, not a location.** `sunset-a` and `sunset-b` are
  two different posters on the same street.
- Neighbourhood or institution, spelled the way a local would: `dtla`, `silverlake`,
  `usc`.
- Short. It sits under a QR code and occasionally gets typed.

### Slugs are permanent

A sticker cannot be edited. Removing a row from `CAMPAIGNS` retires an address that is
still on a wall somewhere and turns a real scan into a 404 — so retire a campaign by
leaving the row in place and simply not printing more. Never reuse a slug for a
different placement: the analytics for the two would be indistinguishable.

---

## A/B testing physical creative

Two posters on the same street can only be told apart by the address they point at.
There is no other signal — no referrer, no parameter, nothing in the scan itself.

So: **one slug per creative.**

```
sunset-a  →  "WILL YOU BE REPLACED?"        /  15 rounds. one AI.
sunset-b  →  "AN AI THINKS YOU'RE PREDICTABLE."  /  PROVE IT WRONG.
```

Both carry the same `placement`, which is what makes them comparable, and different
`creative` values, which is what makes the comparison legible later. Put roughly equal
numbers of each up, in interleaved positions rather than one street each — otherwise
you are measuring the block, not the poster.

---

## How the SEO side works, and why

Nine addresses serving one page is duplicate content. Left alone, campaign URLs would
compete with the homepage for the ranking the homepage should have.

Each campaign route therefore declares exactly two metadata fields, from
`campaignMetadata()`:

- `alternates.canonical` → `https://www.willyoubereplaced.com/` — ranking signals
  earned by a campaign URL consolidate onto the homepage.
- `robots` → `{ index: false, follow: true }` — keep the address out of the index,
  keep crawling onward through its links.

Everything else — title, description, icon, social preview — is inherited from the
root layout, so a campaign URL shared into a message thread previews identically to
the homepage.

Campaign paths are **excluded from `sitemap.xml`** and **deliberately not disallowed
in `robots.txt`**. That second point looks backwards and is not: a path a crawler may
not fetch is a path whose `noindex` is never read, and such a URL can still be indexed
as a bare address on the strength of inbound links. Let it be crawled; let the meta
tag do its job.

---

## Reading the results

Vercel Web Analytics → Pages. Each campaign address appears as its own row.

| Question | Where the answer is |
| --- | --- |
| Did Sunset work? | Page views on `/sunset-a` + `/sunset-b` |
| Which poster worked? | The two rows compared against each other |
| Did Melrose beat DTLA? | `/melrose` vs `/dtla` views |
| Did they actually start? | `play_started` events against arrivals |
| Did they finish? | `game_completed` against `play_started` |
| Did they share? | `share_clicked` against `game_completed` |
| Did it keep going on its own? | Views on `/` with no campaign path, over time |

The funnel events are defined in `src/lib/analytics/events.ts` — six names, no
properties beyond the share method. They are **not** attributed to a campaign in the
event payload; the page path already carries that, and adding it to the event would be
building a tracking identifier for no gain.

Two honest caveats when reading this:

- Custom events are a plan-dependent Vercel feature. Page views are always recorded;
  if events are unavailable on the current plan the site behaves identically and the
  funnel columns are simply empty.
- A share sends people to `/`, never to a campaign address. So a friend who arrives
  through a share counts as organic, which is correct — they did not see the sticker.

---

## Things that will break this if you do them

- **Redirecting a campaign route to `/`.** Analytics records the page that rendered.
  A redirect files every scan under `/` and there is nothing left to measure. The
  routes re-export the root page component precisely so that no redirect is needed.
- **Copying the game into a campaign page.** Two implementations drift. Both routes
  resolve to the identical component reference and `tests/campaigns.test.ts` asserts
  that identity.
- **Putting the slug on screen.** "You arrived from Sunset" turns an invisible
  measurement into a visible one and breaks the fiction for no benefit.
- **Adding a tracking parameter.** `?utm_source=` on a printed code is a longer URL, a
  denser QR, and a thing that gets stripped by scanners and share sheets. The path is
  already the signal.
- **Reusing a retired slug.** The old stickers are still out there.
