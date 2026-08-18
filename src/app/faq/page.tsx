import Link from 'next/link';
import { EditorialPage, Note, Qa, Section } from '@/features/editorial/page';
import { editorialMetadata } from '@/features/editorial/metadata';

export const metadata = editorialMetadata({
  path: '/faq',
  title: 'FAQ',
  description:
    'Common questions about hum(ai)n: whether Darry is really AI, what the game remembers, whether it works on a phone, flashing imagery, and how to turn the sound off.',
});

export default function FaqPage() {
  return (
    <EditorialPage
      path="/faq"
      file="05"
      kicker="Questions"
      title="Questions people actually ask"
      lede={
        <>
          Answered against what the game really does, not against what would be reassuring to
          say.
        </>
      }
      advertising
    >
      <Section n="01" title="The game">
        <Qa q="What is hum(ai)n?">
          <p>
            A short browser horror experience, about ten minutes long. You answer a set of
            unexplained questions, then play fifteen rounds against a prediction system called
            Darry that commits to a guess before each of your choices. At the end you are shown
            how often it was right.
          </p>
        </Qa>

        <Qa q="Is Darry actually AI?">
          <p>
            Partly, and the honest answer has two halves. The behavioural measurement — what
            builds the profile Darry predicts from — is ordinary statistics computed in your
            browser. The prediction itself is made by a language model called from the server,
            when one is available; when it is not, a deterministic engine in the same codebase
            makes it instead.
          </p>
          <p>
            Both are real. Neither is conscious, aware, or in any way a character outside the
            fiction. The name, the file and the backstory are written for the game.
          </p>
        </Qa>

        <Qa q="Why does Darry sometimes fall back to local behaviour?">
          <p>
            Because model calls are metered. The game enforces per-round and per-session limits,
            a per-visitor budget, and a hard daily ceiling on total spend, and it refuses paid
            calls outright if the systems that count them are unavailable. Any refusal — a limit,
            a timeout, a missing credential — hands the round to the local engine.
          </p>
          <p>
            The game never shows you an error for this, because there is nothing for a player to
            do about it and a modal apologising for a rate limit would break the piece. Darry
            simply answers.
          </p>
        </Qa>

        <Qa q="Can I play again?">
          <p>
            Yes. <em>Play again</em> returns you straight to the booth without repeating the
            questions, and Darry keeps everything it learned in the game you just finished — so
            the second game is usually harder than the first. Reloading the page instead is a
            complete reset: the profile is held in memory only, and it does not survive a
            refresh.
          </p>
        </Qa>

        <Qa q="Does the game work on mobile?">
          <p>
            Yes, and the phone layout is the primary one — most people arrive from a code on
            something physical. It is tested at several handset widths, with nothing scrolling
            sideways and every control meeting a minimum touch size.
          </p>
        </Qa>
      </Section>

      <Section n="02" title="What it knows about you">
        <Qa q="Does the game remember me?">
          <p>
            Not between visits. What Darry learns lives in your browser&rsquo;s memory for the
            life of the tab: it carries across <em>play again</em>, and it is gone when you
            refresh or close the tab. Nothing behavioural is written to your device and nothing
            behavioural is stored on the server.
          </p>
          <p>
            Two things do persist, and neither is behavioural: whether you muted the sound, kept
            on your device; and a short-lived signed session cookie the server uses to keep the
            sealed predictions and the abuse limits attached to the right game.
          </p>
        </Qa>

        <Qa q="Is this a psychological test?">
          <p>
            No. The tendencies it measures are regularities inside a made-up task with no stakes.
            They are not a personality profile and they are not a clinical instrument. The closing
            verdict is a line of fiction, not a finding, and nothing here is advice of any kind.
          </p>
        </Qa>

        <Qa q="Can Darry see my computer?">
          <p>
            No. The game never asks for your camera, microphone, location, contacts, files,
            clipboard or browsing history, and the site sends a permissions policy that switches
            those capabilities off for the page rather than merely declining to use them.
          </p>
          <p>
            What reaches the server is a numerical summary of choices made inside the game, plus
            the round number. There is nowhere in this game to type, so there is nothing you have
            written for it to read.
          </p>
        </Qa>

        <Qa q="Does hum(ai)n sell my personal information?">
          <p>
            No. It is not sold, and there is very little of it to sell: no account, no name, no
            email address, no behavioural record kept after your tab closes.
          </p>
          <p>
            Advertising is not currently running on this site. If it is switched on in future it
            will appear only on pages like this one and after the game has ended, never inside
            it, and the <Link href="/privacy">privacy policy</Link> and{' '}
            <Link href="/privacy-choices">privacy choices</Link> pages describe exactly what that
            changes.
          </p>
        </Qa>
      </Section>

      <Section n="03" title="Comfort and controls">
        <Qa q="Why is the game unsettling?">
          <p>
            Because that is what it is. It contains sustained psychological horror, themes of
            surveillance and loss of control, visual distortion and unpleasant audio, and it is
            designed to create discomfort. The warning shown before you start is not a formality.
            If those themes are difficult for you, this is not a piece to push through.
          </p>
        </Qa>

        <Qa q="Is there flashing or glitching?">
          <p>
            There is glitching — displacement, chromatic separation, corrupted text, grain and
            scanlines. There is no strobing: nothing in the game cycles opacity or colour faster
            than three times a second.
          </p>
          <p>
            If your system is set to reduce motion, the game reads that setting and removes every
            displacement, shake, drift and blink while keeping the colour and texture. The screen
            still looks wrong; nothing jumps.
          </p>
        </Qa>

        <Qa q="How do I turn the sound off?">
          <p>
            From <em>Settings</em> on the main menu before you start, or from the small sound
            control in the corner of the screen at any point during the game. The choice is
            remembered on your device, so it stays off next time.
          </p>
        </Qa>

        <Qa q="Nothing plays at all — is it broken?">
          <p>
            Probably not. Browsers refuse to start audio until you have interacted with the page,
            which is why the first screen has a single button and why the sound begins there. If
            it still does not play, check whether the tab is muted at the browser or system level.
          </p>
        </Qa>
      </Section>

      <Note>
        <p>
          Not answered here? <Link href="/how-it-works">How it works</Link> covers the mechanic,{' '}
          <Link href="/behind-the-game">behind the game</Link> covers the construction, and{' '}
          <Link href="/privacy">privacy</Link> covers the data in detail.
        </p>
      </Note>
    </EditorialPage>
  );
}
