import Link from 'next/link';
import { EditorialPage, Note, Section } from '@/features/editorial/page';
import { editorialMetadata } from '@/features/editorial/metadata';

export const metadata = editorialMetadata({
  path: '/behind-the-game',
  title: 'Behind the game',
  description:
    'How hum(ai)n is built: behavioural modelling, server-side prediction commitment, analog-horror art direction, accessibility and a deliberately small data footprint.',
});

export default function BehindTheGamePage() {
  return (
    <EditorialPage
      path="/behind-the-game"
      file="04"
      kicker="Construction"
      title="Behind the game"
      lede={
        <>
          hum(ai)n is an independent web project — one codebase, no publisher, no database, and
          a set of constraints chosen early and then defended.
        </>
      }
      advertising
    >
      <Section n="01" title="The shape of it">
        <p>
          It is a single-page browser experience built on a modern React framework and deployed
          as ordinary static output plus a handful of server routes. There is no account system,
          no content management system and no player database, because none of those would make
          the piece better and all of them would make it heavier.
        </p>
        <p>
          The whole game runs with no configuration at all. With no model credentials present,
          the deterministic local engine plays Darry end to end — the same path the automated
          test suite exercises on every change.
        </p>
      </Section>

      <Section n="02" title="Behavioural modelling">
        <p>
          The profile Darry works from is derived in the browser from the choices you make. Each
          measured tendency carries its own sample size and a confidence value, and every rate is
          smoothed toward an even prior in proportion to how thin the evidence is. This is the
          single most important honesty constraint in the project: it means a short session
          cannot produce a confident-sounding claim, and it is why Darry frequently loses.
        </p>
        <p>
          Left and right placement of the two options is counterbalanced on a shuffled but
          balanced schedule, so a side preference is measurable rather than an artefact of the
          layout. Which option carries the better odds is randomised per game.
        </p>
      </Section>

      <Section n="03" title="The prediction commitment">
        <p>
          The mechanic only works if Darry cannot cheat, so the ordering is enforced by the
          system rather than asserted by the copy. Predictions are produced and sealed on the
          server with authenticated encryption before the browser receives anything, and the
          browser is given a token it cannot read plus a fingerprint it can check afterwards.
        </p>
        <p>
          Each seal is bound to the session, the game and the round, expires, and can be opened
          once. The reveal route does no prediction work — it opens what already existed. The
          state machine will not leave the deciding state without a real sealed prediction, so
          the disabled controls are a consequence of the mechanic and not a timer.
        </p>
        <p>
          The specifics of the scheme, the abuse limits and the prompts are not published. That
          is not secrecy for its own sake: publishing them would mostly help somebody read
          Darry&rsquo;s answer early, which is the one thing that would make the game pointless.
        </p>
      </Section>

      <Section n="04" title="A small data footprint">
        <p>
          The behavioural profile is never written to disk. It lives in memory for the life of
          the tab, which is why it carries across <em>play again</em> — Darry keeps what it
          learned — and why refreshing the page is a complete reset.
        </p>
        <p>
          One preference is stored on your device: whether the sound is muted. Profiles written
          by an earlier release are deleted on load rather than migrated, so an old record cannot
          quietly reappear in this version. What is and is not processed on the server is set out
          in full in the <Link href="/privacy">privacy policy</Link>.
        </p>
      </Section>

      <Section n="05" title="Art direction">
        <p>
          True black, one cold off-white, one restrained error red, and a sickly phosphor tone
          used sparingly for machine state. Everything is monospace, on a font stack that is
          entirely local — nothing is fetched at runtime, so there is no flash of unstyled text
          and no external dependency for the way the piece looks.
        </p>
        <p>
          The escalation runs off a single value that rises with progress and with how well Darry
          is actually reading you. It drives the scanline weight, the grain, the red bleed and
          how far the vignette closes in. Because it tracks something real, a session where Darry
          is failing genuinely feels different from one where it is not.
        </p>
        <p>
          Glitches are authored rather than sprayed. Each one is a specific effect fired at a
          specific moment, which is why the title screen stays readable for minutes at a time
          while the ending does not.
        </p>
      </Section>

      <Section n="06" title="Accessibility and flashing">
        <p>
          No animation in the game cycles opacity or colour faster than three times a second.
          Under <em>prefers-reduced-motion</em> every displacement, shake, drift and blink is
          removed, while the grain, scanlines, vignette and colour remain — so the screen still
          feels wrong without anything jumping. There is an automated test for that.
        </p>
        <p>
          Every control is reachable and operable from the keyboard, with a visible focus ring.
          The booth&rsquo;s machines are removed from the keyboard order entirely while Darry is
          deciding, rather than merely being greyed out. Screen transitions are announced through
          a polite live region, and the wordmark keeps a fixed accessible name however badly the
          glyphs are corrupted. The sound can be turned off from the menu, from the corner of the
          game, and it stays off.
        </p>
      </Section>

      <Section n="07" title="Phones first">
        <p>
          Most people arrive on a phone, frequently from a code printed on something physical, so
          the phone layout is the primary one rather than an adaptation. The layout is tested at
          several handset widths on every change, with a hard rule that nothing may ever scroll
          sideways and every control must meet a minimum touch size.
        </p>
      </Section>

      <Note>
        <p>
          Further reading: <Link href="/how-it-works">the six stages</Link> ·{' '}
          <Link href="/darry">the file on Darry</Link> · <Link href="/faq">questions</Link>
        </p>
      </Note>
    </EditorialPage>
  );
}
