import Link from 'next/link';
import { EditorialPage, Note, Prose, Section } from '@/features/editorial/page';
import { editorialMetadata } from '@/features/editorial/metadata';
import { ConsentControl } from '@/features/editorial/ConsentControl';
import { ContactLine, LastUpdated } from '@/features/editorial/legal';

export const metadata = editorialMetadata({
  path: '/privacy-choices',
  title: 'Privacy choices',
  description:
    'The controls that actually exist on hum(ai)n today, what advertising would add, and what you can do in your browser either way.',
});

export default function PrivacyChoicesPage() {
  return (
    <EditorialPage
      path="/privacy-choices"
      file="07"
      kicker="Privacy choices"
      title="Privacy choices"
      lede={
        <>
          What you can control here, in the present tense — and what would change if advertising
          is switched on.
        </>
      }
    >
      <Prose>
        <LastUpdated />
      </Prose>

      <Section n="01" title="Where things stand today">
        <p>
          <strong>No advertising is running on this site.</strong> No advertising script is
          loaded, no advertising network is contacted because of your visit, and no advertising
          cookie or identifier is set.
        </p>
        <p>
          That is the reason this page is short. There is no consent banner to revisit and no
          personalisation to switch off, because there is nothing switched on. A control that
          pretended otherwise would be the opposite of a privacy choice.
        </p>
      </Section>

      <Section n="02" title="Advertising controls">
        <p>
          The line below is not a placeholder. It reports what this page can actually find: a
          control appears there only when a real consent tool is present and offers a documented
          way to reopen it. Nothing is drawn that would not work.
        </p>
        {/*
          Not wrapped in `<Prose>`: this is a control, not running text, and it brings
          its own typography. Nesting it inside the prose rules would let `.prose p`
          out-specify the notice style and render a full sentence as a tracked-out
          uppercase label.
        */}
        <ConsentControl />
        <p>
          Where local law requires a consent choice before advertising cookies may be used —
          across the EEA, the UK and Switzerland in particular — that choice will be presented
          before any such cookie is set, not after. If advertising is enabled and no control
          appears here, the controls in sections 3 and 4 are the ones that apply, and they are
          not dependent on this site.
        </p>
      </Section>

      <Section n="03" title="What you can control right now">
        <ul>
          <li>
            <strong>Sound.</strong> Off from <em>Settings</em> on the main menu, or from the
            corner control during the game. The choice is remembered on your device.
          </li>
          <li>
            <strong>Motion.</strong> Turn on your operating system&rsquo;s reduce-motion setting
            and the game removes every displacement, shake, drift and blink while keeping the
            colour and texture.
          </li>
          <li>
            <strong>Everything the game learned.</strong> Close the tab, or reload the page. The
            profile is held in memory only and is destroyed either way, with nothing left behind.
          </li>
          <li>
            <strong>The two stored items.</strong> Clear this site&rsquo;s data in your browser
            to remove the muted-sound preference and the session cookie. The game still works.
          </li>
          <li>
            <strong>Cookies generally.</strong> Block them for this site if you prefer. The game
            remains playable; the server simply cannot keep the abuse limits attached to your
            game.
          </li>
        </ul>
      </Section>

      <Section n="04" title="Browser and platform controls">
        <p>
          Independently of anything this site does, your browser offers controls worth knowing
          about: blocking third-party cookies, clearing site data, private browsing, and
          extensions that block advertising and tracking outright. None of them will break this
          game.
        </p>
        <p>
          Google offers account-level advertising settings at{' '}
          <a href="https://myadcenter.google.com/" rel="noopener noreferrer">
            myadcenter.google.com
          </a>
          . They apply across every site where Google&rsquo;s advertising appears, they work
          whether or not advertising is ever enabled here, and they belong to you rather than to
          this site — which is exactly why this page points at them rather than trying to
          reproduce them. Following that link is the only thing on this page that contacts
          Google, and only if you choose to.
        </p>
      </Section>

      <Section n="05" title="Analytics">
        <p>
          Page views are counted by a cookieless analytics product, and a small set of anonymous
          product events records whether visitors start and finish a game. Neither carries your
          answers, your profile, your scores or the verdict — that restriction is enforced in
          code, not by policy. The detail is in section 9 of the{' '}
          <Link href="/privacy">privacy policy</Link>.
        </p>
        <p>
          There is no per-person analytics record here, so there is no analytics profile to
          request or delete.
        </p>
      </Section>

      <Section n="06" title="Contact">
        <ContactLine subject="page" />
      </Section>

      <Note>
        <p>
          Full detail: <Link href="/privacy">privacy policy</Link>. Terms:{' '}
          <Link href="/terms">terms of use</Link>.
        </p>
      </Note>
    </EditorialPage>
  );
}
