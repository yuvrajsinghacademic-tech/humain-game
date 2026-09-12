import Link from 'next/link';
import { EditorialPage, Note, Section } from '@/features/editorial/page';

/**
 * The public front door.
 *
 * The game itself lives at `/play`; the homepage is deliberately server-rendered
 * publisher content. That gives a person (and a crawler) a useful explanation of the
 * project before any JavaScript experience starts, while campaign URLs can still open
 * the game directly.
 *
 * No advertising appears on this page. Ads are reserved for long-form editorial files
 * where there is substantial publisher content surrounding them.
 */
export default function Page() {
  return (
    <EditorialPage
      path="/"
      file="00"
      kicker="Entry"
      title="Can an AI predict you before you choose?"
      lede={
        <>
          hum(ai)n is a short interactive horror experiment about a simple question: how much of
          your next decision can be guessed from the small decisions you already made?
        </>
      }
    >
      <Note>
        <p>
          <Link href="/play" data-testid="home-play">
            PLAY THE EXPERIMENT →
          </Link>{' '}
          · about ten minutes · headphones recommended
        </p>
      </Note>

      <Section n="01" title="What happens here">
        <p>
          You begin with a set of deliberately ordinary choices. There is no trivia to know and
          there is no correct answer. The point is the pattern you make while deciding: what you
          repeat, what you abandon, which side you drift toward, and how quickly you commit when
          the choice in front of you does not seem important.
        </p>
        <p>
          Those choices lead into the Prediction Booth. For fifteen rounds, an artificial
          intelligence called Darry picks what it thinks you are about to do before the controls
          open for you. Darry cannot wait for your click and pretend it knew afterward; each
          prediction is committed first, then your choice is made, then the round is revealed.
        </p>
        <p>
          At the end there is no leaderboard and no personality score. You see how often Darry
          predicted you correctly and the remainder that still belonged to you. The rest of the
          ending is fiction. The numbers are the game.
        </p>
      </Section>

      <Section n="02" title="What Darry is actually looking at">
        <p>
          hum(ai)n does not ask for your name, an account, a profile, or access to your social
          history. Darry works from the behaviour produced inside this one session: the sequence
          of choices, repeated or changed responses, timing, and a small set of patterns derived
          from those interactions.
        </p>
        <p>
          Some of the prediction work is performed by a language model on the server and some is
          handled by a deterministic engine in the game. If the model is unavailable, the local
          system can keep the experience moving. The interesting question is not whether a model
          knows who you are. It is whether a surprisingly small amount of behaviour is enough to
          make your next move less private than it felt a minute earlier.
        </p>
        <p>
          This is not a psychological test or a diagnostic tool. The task is invented for the
          game, and the patterns it finds are only patterns inside that task. If you want the
          technical version rather than the horror version, the full mechanism is documented in{' '}
          <Link href="/how-it-works">How it works</Link>.
        </p>
      </Section>

      <Section n="03" title="Why the project exists">
        <p>
          The project started with a smaller prototype called The Prediction Booth. The idea came
          from reading about systems trained on enormous collections of human decisions and then
          wondering what the smallest version of that feeling would be. Not a machine that knows
          everything about you — a machine that gets only a little and still begins to anticipate
          you.
        </p>
        <p>
          Turning that idea into horror made more sense than turning it into an essay. A warning
          about prediction is abstract. Watching a system answer first, round after round, makes
          the same idea physical. hum(ai)n is built to let that tension arrive through play rather
          than through a claim that the software is more powerful than it really is.
        </p>
        <p>
          The project is independent, runs in the browser, and is designed as a short piece with a
          beginning and an ending. There is more detail in <Link href="/about">About</Link>, the
          development story is in <Link href="/behind-the-game">Behind the game</Link>, and the
          file on the prediction system itself is <Link href="/darry">Darry</Link>.
        </p>
      </Section>

      <Section n="04" title="Before you play">
        <p>
          hum(ai)n uses sustained psychological-horror themes around surveillance, prediction,
          loss of control, and replacement. The game gives you a warning before the experience
          begins and lets you leave before committing. It is entertainment, not an assessment of
          your intelligence, personality, mental health, employability, or future.
        </p>
        <p>
          If that sounds like the experience you came for, start the experiment. If you would
          rather understand the system first, read the files below and come back when you are
          ready.
        </p>
      </Section>

      <Note>
        <p>
          <Link href="/play" data-testid="home-play-bottom">
            PLAY →
          </Link>{' '}
          · <Link href="/about">About</Link> · <Link href="/how-it-works">How it works</Link> ·{' '}
          <Link href="/darry">Darry</Link> · <Link href="/faq">FAQ</Link>
        </p>
      </Note>
    </EditorialPage>
  );
}
