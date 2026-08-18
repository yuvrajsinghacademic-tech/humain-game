import Link from 'next/link';
import { EditorialPage, Note, Section } from '@/features/editorial/page';
import { editorialMetadata } from '@/features/editorial/metadata';

export const metadata = editorialMetadata({
  path: '/how-it-works',
  title: 'How it works',
  description:
    'Calibration, observation, prediction, commitment, reveal, verdict — the six stages of hum(ai)n, and why Darry has to answer first.',
});

export default function HowItWorksPage() {
  return (
    <EditorialPage
      path="/how-it-works"
      file="02"
      kicker="How it works"
      title="Six stages, and one rule"
      lede={
        <>
          The rule is that Darry commits before you do. Everything else in the game exists to
          make that commitment mean something.
        </>
      }
      advertising
    >
      <Section n="01" title="Calibration">
        <p>
          The game opens with a run of short, abstract questions. They are deliberately
          unexplained: two options, no context, a counter in the corner, and occasionally a
          small reward when one of them pays out.
        </p>
        <p>
          The questions look arbitrary because the content is not the measurement. What is being
          measured is the shape of your answering — which option you take after one has just
          worked, which you take after one has just failed, whether you stay on a side of the
          screen, and how long each decision takes you.
        </p>
        <p>
          You can skip this entirely. If you do, Darry begins from a genuinely blank profile —
          every tendency at even odds and nothing observed — and has to learn you from the
          fifteen rounds alone.
        </p>
      </Section>

      <Section n="02" title="Observation">
        <p>
          Your answers are folded into a small profile: a set of rates, each with the number of
          observations behind it and a confidence figure derived from that count. Every rate is
          pulled toward an even prior in proportion to how little evidence supports it, so a
          handful of questions cannot produce a confident reading. Darry is allowed to be
          uncertain, and early on it usually is.
        </p>
        <p>
          The profile keeps updating during the game. Each round you play becomes another
          observation in the same vocabulary as the questions, which is why Darry tends to get
          sharper toward the end — and why playing again is not a fresh start.
        </p>
      </Section>

      <Section n="03" title="Prediction">
        <p>
          Before each round, Darry produces a prediction from the profile and the rounds so far.
          It receives a compact numerical summary and nothing else. It is never told the hidden
          payout odds of the two machines, because it is meant to be predicting a person, not
          solving a puzzle.
        </p>
        <p>
          There is no free text anywhere in this game, in either direction. Nothing you write can
          reach Darry, because there is nothing to write.
        </p>
      </Section>

      <Section n="04" title="Commitment">
        <p>
          This is the part that matters. The prediction is sealed on the server before it is sent
          to your browser, using authenticated encryption, and the browser receives only an
          unreadable token and a fingerprint of it. The prediction itself is not in the response.
        </p>
        <p>
          The seal is bound to your session, that game and that round number, so a sealed answer
          cannot be moved to a different round or replayed later. It expires, and it can only be
          opened once. The controls in the booth stay disabled — and out of the keyboard order —
          until a sealed prediction actually exists, which is why the wait before each round is
          real rather than theatrical.
        </p>
        <p>
          The effect is that there is no moment at which Darry&rsquo;s answer could be adjusted
          to match yours. It was decided while the machines were still dead.
        </p>
      </Section>

      <Section n="05" title="Reveal">
        <p>
          When you choose, the browser asks the server to open the sealed answer. That step does
          no prediction work at all — it authenticates, decrypts, checks that the session, game
          and round still match, and returns what was already there. Your browser then checks the
          revealed answer against the fingerprint it was given before you moved. A mismatch would
          be recorded rather than ignored.
        </p>
        <p>
          Then you are shown what Darry chose. That is the whole round: it decides, you decide,
          and the order is not negotiable.
        </p>
      </Section>

      <Section n="06" title="Verdict">
        <p>
          After fifteen rounds you are shown two percentages. Darry&rsquo;s is its real accuracy
          across those rounds — not a curve, not a floor, not a flattering rounding — and yours
          is exactly the remainder. The two always total one hundred.
        </p>
        <p>
          The closing line is fixed and is part of the fiction. The line underneath it is not: if
          Darry did badly, it says so.
        </p>
      </Section>

      <Note>
        <p>
          Some of this page is deliberately non-specific. The exact measurements, the sealing
          scheme&rsquo;s parameters and the abuse limits are not published, for the ordinary
          reason that a game about being predicted is less interesting when the prediction can be
          gamed. <Link href="/behind-the-game">Behind the game</Link> covers the construction; the
          numbers behind the seal stay on the server.
        </p>
      </Note>
    </EditorialPage>
  );
}
