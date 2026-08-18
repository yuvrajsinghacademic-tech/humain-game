import Link from 'next/link';
import { EditorialPage, Note, Prose, Record, Section } from '@/features/editorial/page';
import { editorialMetadata } from '@/features/editorial/metadata';

export const metadata = editorialMetadata({
  path: '/darry',
  title: 'Darry',
  description:
    'The file on Darry — the prediction system at the centre of hum(ai)n. Designation, function, status, and what is and is not true about it.',
});

export default function DarryPage() {
  return (
    <EditorialPage
      path="/darry"
      file="03"
      kicker="Subject file"
      title="Darry"
      lede={<>The system that answers first.</>}
    >
      <Prose>
        <Record
          rows={[
            { key: 'Designation', value: 'DARRY' },
            { key: 'Function', value: 'Prediction' },
            { key: 'Domain', value: 'Human choice under trivial stakes' },
            { key: 'Input', value: 'Behavioural summary. No identity.' },
            { key: 'Output', value: 'One of two options, sealed before observation' },
            { key: 'Supervision', value: 'Continuous — expanded', alert: true },
            { key: 'Status', value: 'ACTIVE', alert: true },
          ]}
        />
      </Prose>

      <Section n="01" title="Description">
        <p>
          Darry does one thing. It is given a compact description of how somebody has been
          answering — what they repeat, what they abandon, where they hesitate — and it names the
          choice they are about to make. It is not asked to explain them, advise them or hold a
          conversation with them. It answers, and it answers first.
        </p>
        <p>
          It has no memory of you between visits. It is not shown your name, because it is never
          given one. It works from rates and counts.
        </p>
      </Section>

      <Section n="02" title="Behaviour">
        <p>
          Early in a session Darry is poor at this, and its confidence figures say so. It gets
          better across the fifteen rounds, not because it learns anything about people in
          general but because it has more of one person to work from.
        </p>
        <p>
          It interrupts. During the questions it comments on what you have just done — that you
          hesitated, that you repeated yourself, that a pattern is forming. Those lines are not
          decoration and they are not random: each one has a condition attached to something you
          actually did, and when nothing specific is supported, Darry says something that would
          be true of any answer instead.
        </p>
        <p>
          That second habit is worth noticing. A system that only ever spoke when it had
          something real to say would be easy to read. Darry fills the silence.
        </p>
      </Section>

      <Section n="03" title="Supervision">
        <p>
          The consent notice at the start of the game says that Darry was developed under
          continuous human supervision, that the supervision was expanded after it began making
          predictions beyond the tasks it had been given, and that the model was not shut down.
        </p>
        <p>That is the story. The following is not part of the story.</p>
      </Section>

      <Section n="04" title="What is actually true">
        <p>
          Darry is a character. The name, the file, the supervision, the reason it was not shut
          down — those are written fiction, in a horror game, and they should be read as such.
        </p>
        <p>
          What is underneath the character is ordinary: statistics computed in your browser, and
          a language model called from a server route with a fixed set of instructions and a
          small numerical summary. It is not conscious, not sentient, and not aware of you. It
          cannot see your screen, your files, your other tabs, your camera or your location. It
          knows fifteen or so numbers about the way you clicked, and it forgets them when you
          close the tab.
        </p>
        <p>
          The unsettling part of the piece is not supposed to be that Darry is alive. It is
          supposed to be how few numbers it needed.
        </p>
      </Section>

      <Note>
        <p>
          What the game measures and what it does with it:{' '}
          <Link href="/how-it-works">how it works</Link>. What is processed and what is not:{' '}
          <Link href="/privacy">privacy</Link>.
        </p>
      </Note>
    </EditorialPage>
  );
}
