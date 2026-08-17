import Link from 'next/link';
import { EditorialPage, Note, Section } from '@/features/editorial/page';
import { editorialMetadata } from '@/features/editorial/metadata';

export const metadata = editorialMetadata({
  path: '/about',
  title: 'About',
  description:
    'hum(ai)n is an interactive psychological horror experiment about being predicted. What it is, what Darry does, and what it is not.',
});

export default function AboutPage() {
  return (
    <EditorialPage
      path="/about"
      file="01"
      kicker="About"
      title="A game about being predicted"
      lede={
        <>
          hum(ai)n is a short interactive horror experience. An artificial intelligence called
          Darry watches how you make small, meaningless choices, and then tries to make them
          before you do.
        </>
      }
      advertising
    >
      <Section n="01" title="What it is">
        <p>
          hum(ai)n is a browser game that takes about ten minutes. You answer a set of
          deliberately unexplained questions, and then you play fifteen rounds against Darry, who
          commits to a guess about each choice before you are allowed to make it. At the end you
          are shown two numbers: how often Darry was right, and the remainder.
        </p>
        <p>
          There is no account, no sign-in and no score to chase. It is a piece with a beginning
          and an ending, closer to a short film you operate than to a game you progress through.
        </p>
      </Section>

      <Section n="02" title="What Darry actually does">
        <p>
          Darry is a prediction system. While you answer, the game measures ordinary things about
          how you decide: whether you repeat a choice that just paid off, whether you abandon one
          that did not, how much you drift toward one side of the screen, and how long you pause
          before committing.
        </p>
        <p>
          Those measurements become a small statistical profile, and that profile — not your
          identity, not anything you typed, because there is nothing in this game to type — is
          what Darry predicts from. Some of the work is done by a language model on the server;
          the rest is done by a deterministic engine that lives in the same codebase. When the
          model is unavailable, the local engine plays Darry and the game does not tell you,
          because from the outside there is nothing to tell.
        </p>
        <p>
          The one rule the whole piece rests on is that Darry answers first. Each round&rsquo;s
          prediction is generated, sealed and sent to your browser as something the browser
          cannot read, and only then do the controls become usable. It is enforced by the
          software rather than promised by it — see <Link href="/how-it-works">how it works</Link>.
        </p>
      </Section>

      <Section n="03" title="Where it came from">
        <p>
          It began as a much smaller prototype called The Prediction Booth, built after reading
          about models trained on very large collections of real human decisions. The unsettling
          part of that research was never that a machine could be clever. It was how little of a
          person it seemed to need.
        </p>
        <p>
          hum(ai)n is that thought turned into an experience rather than an argument. It measures
          one person for about ninety seconds, and then shows them how little that took.
        </p>
      </Section>

      <Section n="04" title="What it is not">
        <p>
          It is not a psychological test, a personality assessment, or a diagnostic tool of any
          kind. The traits it measures are behavioural regularities in a made-up task, and they
          say nothing about who you are outside of it. The closing verdict is a line of fiction
          written for the ending — it is not a finding.
        </p>
        <p>
          It is also not a horror story that has been softened for a general audience. The
          warning shown before you start is accurate; if the themes described there are not for
          you, they are genuinely not for you.
        </p>
      </Section>

      <Note>
        <p>
          More: <Link href="/how-it-works">how it works</Link> · <Link href="/darry">the file on Darry</Link>{' '}
          · <Link href="/behind-the-game">how it was built</Link> · <Link href="/faq">questions</Link>
        </p>
      </Note>
    </EditorialPage>
  );
}
