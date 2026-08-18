# Monetization

*Internal. Not published as a page.*

The site is built to display advertising and is currently displaying none. Everything
below describes an architecture that is inert until three real values from a real
AdSense account are configured.

**The hierarchy this was built to, in order: the player's experience, then viral
growth, then measurement, then revenue.** Advertising monetises traffic that already
exists; it must never be the reason traffic stops arriving. Every placement decision
below follows from that and none of them are worth revisiting to gain one impression.

---

## Current state

With no environment variables set — the state of this repository:

- no advertising script is loaded, on any page, at any point;
- no request is made to any Google host as a result of a visit;
- `/ads.txt` returns **404**, rather than a record that looks valid and is not;
- every `<AdSlot>` renders `null` — no element, no reserved space, no console output;
- the emitted Content-Security-Policy is **byte-identical** to the ad-free one.

`tests/ads.test.tsx` asserts each of those, and `e2e/phase2.spec.ts` re-checks the
important ones against a real production build.

---

## Where an ad may appear

Exactly two surfaces.

### 1. Editorial pages — below the article

`/about`, `/how-it-works`, `/behind-the-game`, `/faq`. After the last section, above
the footer, separated by a large fixed gap.

Not on `/darry` — it is short and atmospheric and an ad would be most of the page.
Not on `/privacy`, `/privacy-choices` or `/terms`: an advertisement beside a privacy
policy is bad manners and, on some readings, worse.

### 2. The post-game area — well below the reveal

On the ending screen only, and only in the fifth stage — after `Unfortunately.`, after
`You will be replaced.`, after the two percentages, after the share controls and after
PLAY AGAIN.

**Clearance: a minimum of 180px**, measured from the bottom edge of the PLAY AGAIN
button to the first pixel of the ad block, its `ADVERTISEMENT` label included. Above
that floor it scales with the viewport — `max(180px, 24vh)` — so a tall screen pushes
the ad further down while a short one is held at the floor.

The gap is load-bearing, not decorative: it is what guarantees a thumb reaching for
PLAY AGAIN lands on empty screen rather than on a click-through, and it keeps the ad
off-screen entirely while the verdict is in view on every handset.

It lives in one place, `--postgame-ad-clearance` in `Ending.module.css`, and it is
*measured* rather than assumed. The property is registered with `@property` as a
`<length>`, so the browser resolves the expression to real pixels and
`e2e/phase2.spec.ts` reads it back at both desktop and phone widths; a second test
reads the stylesheet and fails if the floor is ever edited below 150px.

### Where an ad may never appear

The boot screen · the main menu and the PLAY button · the consent warning · the
assessment · any question · the results transition · the Prediction Booth · any round
· any round transition · the ending reveal itself.

And never as: an interstitial between rounds, a popup, autoplay video, or anything
styled to resemble a game control.

This is enforced structurally rather than by review. `tests/ads.test.tsx` reads the
source of every gameplay module and fails if `AdSlot` or `adsbygoogle` appears in one,
so a future placement on the booth fails in CI rather than in a player's session.

---

## Configuration

Three public values, all printed into the ad tag itself and none of them secret.

| Variable | What it is | Where it comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | Publisher id, `ca-pub-` + 16 digits | AdSense → Account → Account information |
| `NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL` | Ad unit id for the editorial surface | AdSense → Ads → By ad unit |
| `NEXT_PUBLIC_ADSENSE_SLOT_POSTGAME` | Ad unit id for the post-game surface | AdSense → Ads → By ad unit |

Plus one development-only switch:

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_AD_PLACEHOLDERS=true` | Draws an empty labelled outline where an ad would sit, so spacing can be judged. Loads nothing, contacts nobody, ignored in production builds. |

Both ids are **format-validated**. A half-pasted value disables advertising for that
surface rather than shipping a broken tag on every page. Each surface is independent:
configuring the editorial slot does not switch on the post-game one.

The publisher id is read at **build time** — Next inlines `NEXT_PUBLIC_` values by
textual substitution — so setting it in Vercel requires a redeploy to take effect, and
so does the CSP change it triggers.

---

## The Content-Security-Policy

`next.config.ts` adds Google's advertising hosts to `script-src`, `img-src`,
`connect-src` and `frame-src` **only when `NEXT_PUBLIC_ADSENSE_CLIENT_ID` is set**.
The hosts are named individually; nothing is widened to `*` or to `https:`.

Two things that do not change, ever:

- `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Ads are framed *by* this page;
  this page is still framed by nobody.
- `connect-src` remains `'self'` plus two named Google hosts. A behavioural profile
  still has nowhere to be sent.

**One honest caveat.** Ad *creatives* are served from advertisers' own domains, not
from Google's. Once real units are running, some creatives will be blocked by the
`img-src` and `frame-src` lists above, which will show up as blank units and CSP
violations in the console. Widening those two directives is then a deliberate,
reviewed change — make it by editing the named lists, not by reaching for a wildcard,
and never touch `script-src` or `connect-src` to fix a broken image.

---

## `ads.txt`

`/ads.txt` is generated from the publisher id by `src/app/ads.txt/route.ts` rather than
committed as a file, so there is only one value to keep in step. With the id set it
serves exactly:

```
google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

`f08c47fec0942fa0` is Google's own published certification authority id, identical for
every AdSense publisher. It is not a secret and is not guessed. The `pub-` number is
derived from the configured `ca-pub-` id.

With nothing configured the route returns 404. That is deliberate: a plausible-looking
publisher number either belongs to nobody, in which case the record is noise, or
belongs to somebody else, in which case this site is publicly authorising a stranger
to sell its inventory.

**Verify after enabling:** `curl https://www.willyoubereplaced.com/ads.txt` and check
the number matches the AdSense account exactly. A wrong `ads.txt` is one of the most
common reasons revenue silently fails to arrive.

---

## Consent

No consent management platform is bundled, and no fake one is drawn.

`/privacy-choices` renders a control **only when one is genuinely present and
reopenable at runtime**. It looks for exactly one entry point:
`googlefc.showRevocationMessage`, the documented way to reopen a message published
through Google's Privacy & messaging tool. If that function is not on the page, the
page says so and points at browser-level and Google-account-level controls instead.
See `src/features/editorial/ConsentControl.tsx`.

### What must not be assumed

**Publishing a message in AdSense does not, by itself, put a working control on this
page.** `googlefc` is installed by Google's own tag. `/privacy-choices` carries no
advertising and loads no Google script — by design, because loading an advertising or
messaging script on the privacy page purely to light up a privacy button would be an
absurd trade. So the reopen API may simply never exist on that route, even with a
fully approved account and a published message.

Whether it does is a fact about the production configuration, not something this
repository can predict. **It has to be tested against the real account** — step 4
below. Depending on what that test shows, there are three honest outcomes:

1. `googlefc` is present site-wide → the control appears and works, no code change.
2. `googlefc` is present only on ad-bearing pages → `/privacy-choices` correctly shows
   the fallback, and the Google-account link in section 4 of that page is the working
   control. This is an acceptable end state, not a bug.
3. A deliberate decision is taken to load the standalone Privacy & messaging script on
   `/privacy-choices` → that is a **new, reviewed change** with its own privacy and CSP
   consequences. It is not something to do by reflex to make a button appear.

An earlier version of this integration also detected a generic TCF v2 `__tcfapi` and
called `displayConsentUi` on it. That command is not in the TCF v2 specification and
would have returned failure while opening nothing — a button that claimed to do
something and did not. It has been removed. Detecting an API is not the same as having
a documented way to reopen it.

### What must be configured in the Google account

Nothing in this repository can complete the consent side. All of it is account
configuration:

1. AdSense → Privacy & messaging → **European regulations message**, published for
   EEA, UK and Swiss traffic.
2. AdSense → Privacy & messaging → **US states message**, published for the applicable
   US state privacy laws, if serving US traffic.
3. Confirm each message is set to appear *before* advertising cookies are set, not
   after.
4. **Test the real revocation control in production** — see step 7 of the sequence
   below.

---

## Enabling advertising: the sequence

Advertising is not "launched" until step 9. Steps 7 and 8 in particular are the ones
that are easy to skip and expensive to have skipped.

1. **Obtain AdSense approval.** Create and verify the account and pass site review.
   Review requires real content on a reachable site — that is what the eight editorial
   documents are for.
2. **Publish a contact address.** Set `NEXT_PUBLIC_CONTACT_EMAIL`. Until it is set,
   the legal pages state honestly that no address has been published, which is
   truthful but is not a good look on a monetised site.
3. **Create two ad units** — one responsive display unit per surface. Two rather than
   one, so their performance is separable and either can be switched off alone.
4. **Set the three variables** in Vercel, Production and Preview, then **redeploy**.
   The ids and the CSP are both build-time.
5. **Verify `/ads.txt`** returns the record with the correct publisher number.
6. **Configure and publish the consent messages** in AdSense → Privacy & messaging:
   the **European regulations message** for EEA/UK/CH traffic, and the **US states
   message** for the applicable US state laws. Confirm each is set to appear before
   advertising cookies are set.
7. **Test the actual production privacy and revocation control.** On the deployed
   site, in a browser presenting as EEA traffic: confirm the message appears, make a
   choice, then confirm it can be reopened and changed. This is a test of Google's
   configuration, not of this codebase.
8. **Confirm `/privacy-choices` against the real Google configuration.** Load the
   deployed page and check which of the three outcomes in the *Consent* section above
   is true. If the control does not appear there, either accept the fallback as the
   end state or make a deliberate, reviewed decision about the standalone messaging
   script — do not assume it will appear on its own.
9. **Rewrite section 11 of `/privacy` into the present tense** and update the date at
   the top of `/privacy`, `/privacy-choices` and `/terms`. The policy currently says
   advertising is not running; leaving that in place once it is would be the single
   worst thing on this list.
10. **Play a whole game on a phone.** Confirm no ad is visible at any point before the
    verdict, and that the post-game unit is clear of PLAY AGAIN by the full clearance
    (see below).

---

## Revenue expectations, stated plainly

Display advertising on an independent site pays a small amount per thousand views. At
the traffic a sticker campaign realistically produces, the revenue is not the point —
the measurement is, and so is having the architecture ready if something goes wide.

The thing genuinely worth optimising is the share loop, because a completed game that
gets shared brings a whole new player, and a player is worth far more than an
impression. Anything that trades away completions or shares for ad inventory is a bad
trade even on purely commercial terms.
