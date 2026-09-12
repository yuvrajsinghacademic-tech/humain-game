# Monetization

*Internal. Not published as a page.*

The site is built to support AdSense, but serving stays disabled until the site is
approved and a real editorial ad unit is configured.

**Priority: player experience, viral growth, measurement, then revenue.** Advertising
must never interrupt the game or turn a low-content application screen into ad
inventory.

---

## Current state

With the serving environment variables unset:

- no advertising script is loaded;
- no request is made to a Google ad-serving host;
- `/ads.txt` publishes the verified account's one `DIRECT` record;
- every `<AdSlot>` renders `null`;
- the AdSense ownership meta tag remains present for review.

`ads.txt` is seller authorisation, not evidence that ads are currently running.

---

## Placement policy

There is **one advertising surface type: editorial**.

Ads may appear only after substantial original publisher content on approved editorial
files such as `/about`, `/how-it-works`, `/behind-the-game`, and `/faq`. The article
must come first; the unit lives after the final section and before the footer.

Ads may **never** appear on:

- `/` (the public publisher-content landing page);
- `/play`;
- any campaign route (`/sunset-a`, `/dtla`, `/linkedin`, etc.);
- boot, menu, warning, assessment, questions, transitions, Prediction Booth or rounds;
- the ending, results, share controls or PLAY AGAIN area;
- `/privacy`, `/privacy-choices` or `/terms`;
- any page whose main purpose is navigation, status, confirmation, or another thin UI.

There is no post-game ad unit. That surface was removed after AdSense site review
reported **"Google-served ads on screens without publisher-content / Low value
content."** The code now enforces editorial-only placement structurally in
`tests/ads.test.tsx`.

---

## Site architecture for review

The public root `/` is server-rendered original publisher content explaining the
project, what Darry does, why the project exists, and what a player should know before
starting. It links to the supporting editorial files and to `/play`.

The interactive game lives at `/play`. That route is `noindex, follow` and canonical to
`/`. It has no ad surface. Campaign URLs continue to launch the same `/play` component
directly so QR codes and referral measurement do not change; those routes are also
`noindex, follow` and canonical to `/`.

This split is deliberate: searchable publisher content is content, while the
application/game screens are treated as the experience rather than as pages on which
to sell impressions.

---

## Configuration

Only two public serving values are supported:

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | Publisher id (`ca-pub-...`) |
| `NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL` | Responsive display ad-unit id for editorial articles |

`NEXT_PUBLIC_AD_PLACEHOLDERS=true` is development-only and draws an empty labelled
editorial outline. It never contacts Google and is ignored in production.

The publisher and slot ids are validated. Missing or malformed values fail closed and
render no ad.

The publisher id is inlined at build time, so setting or changing it in Vercel requires
a redeploy. `next.config.ts` widens the CSP to the named Google ad hosts only when that
publisher id is configured.

---

## `ads.txt`

`/ads.txt` is derived from the verified account in
`src/lib/ads/verification.ts` and serves:

```
google.com, pub-5771510660460861, DIRECT, f08c47fec0942fa0
```

The record is intentionally independent of the serving environment variables so Google
can verify the authorised seller while the site remains ad-free during review.

---

## Consent and privacy

Google's Privacy & messaging configuration is account-side. Before live advertising:

1. Publish the required European regulations message for applicable EEA/UK/Swiss
   traffic.
2. Publish the applicable US states message.
3. Test the real production consent and revocation flow.
4. Verify `/privacy-choices` reflects the actual Google configuration rather than a
   fake or inert control.
5. Update `/privacy` from future-tense/ad-free wording to the actual live advertising
   state and update its revision date.

`/privacy-choices` only exposes Google's revocation control when the documented runtime
API is genuinely available. It never invents a button that cannot work.

---

## Approval and launch sequence

1. Keep ad serving disabled during AdSense site review.
2. Confirm `/`, the editorial files, `/play`, campaign routes, `ads.txt`, robots and
   canonical metadata in production.
3. Request a new AdSense review only after the publisher-content architecture is live.
4. After approval, create **one responsive editorial display unit**.
5. Set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` and `NEXT_PUBLIC_ADSENSE_SLOT_EDITORIAL` in
   Vercel and redeploy.
6. Verify ads appear only below substantial editorial articles and nowhere in the
   interactive experience.
7. Complete consent/privacy production checks before treating monetization as live.

Do not enable Auto Ads. The site intentionally controls where inventory may exist.
