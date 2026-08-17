import Link from 'next/link';
import { EditorialPage, Note, Prose, Section } from '@/features/editorial/page';
import { editorialMetadata } from '@/features/editorial/metadata';
import { ContactLine, LastUpdated } from '@/features/editorial/legal';

export const metadata = editorialMetadata({
  path: '/privacy',
  title: 'Privacy policy',
  description:
    'What hum(ai)n processes, what it stores, what it never touches, who else is involved, and how long anything lasts. Written against the actual implementation.',
});

export default function PrivacyPage() {
  return (
    <EditorialPage
      path="/privacy"
      file="06"
      kicker="Privacy policy"
      title="Privacy policy"
      lede={
        <>
          hum(ai)n is a game about being measured, so it would be a poor joke to be vague about
          what it measures. This describes what the software actually does.
        </>
      }
    >
      <Prose>
        <LastUpdated />
      </Prose>

      <Section n="01" title="The short version">
        <p>
          There is no account, no sign-in and no player database. Nothing you do inside the game
          is written to a permanent record anywhere. What Darry learns about you lives in your
          browser&rsquo;s memory and is gone when you close the tab.
        </p>
        <p>
          What is not nothing: one preference is stored on your device, one short-lived
          first-party cookie is set, the server processes gameplay summaries in order to generate
          predictions, request data is used to enforce abuse and cost limits, and the site uses a
          privacy-oriented analytics product that counts page views. Each of those is described
          below.
        </p>
      </Section>

      <Section n="02" title="What you provide by playing">
        <p>
          Only choices and timings. Every interaction in this game is a press of one of two
          buttons, so what the game observes is: which of the two options you picked, where it
          was on the screen, how long you took, whether that option paid out, and the round or
          question number.
        </p>
        <p>
          There is nowhere in this game to type. It never asks for your name, your email address,
          your age, your location or anything else about you, and it has no field in which you
          could offer them.
        </p>
      </Section>

      <Section n="03" title="Temporary gameplay state">
        <p>
          Those choices are folded into a small statistical profile — a set of rates such as how
          often you repeat a choice that just paid out, how often you switch after one that did
          not, and your average decision time. This is the profile Darry predicts from.
        </p>
        <p>
          It is held in your browser&rsquo;s memory for the life of the tab and nowhere else. It
          is not written to your device, not sent anywhere to be stored, and not associated with
          you. It carries across <em>play again</em> within the same tab, and refreshing the page
          destroys it completely.
        </p>
      </Section>

      <Section n="04" title="Stored on your device">
        <p>
          One item, in your browser&rsquo;s local storage: whether you have muted the sound. That
          is a setting, not a record of your behaviour, and it is what makes the sound stay off
          on your next visit.
        </p>
        <p>
          An earlier version of this game stored behavioural profiles on the device. Those
          entries are deleted when the current version loads rather than migrated, so an old
          record cannot be silently carried into it.
        </p>
      </Section>

      <Section n="05" title="Cookies">
        <p>
          One first-party cookie, named <code>hg_sid</code>. It holds a randomly generated session
          identifier and a signature proving the server issued it. It is marked HTTP-only — so
          page scripts cannot read it — restricted to this site, and it expires after twelve
          hours.
        </p>
        <p>
          It exists because the sealed predictions and the abuse limits have to be attached to
          the right game. It contains nothing about you, is not used for advertising, and is not
          used to recognise you across other websites.
        </p>
        <p>
          No other cookies are set by this site at present. If advertising is enabled in future,
          the advertising provider may set its own — see section 11.
        </p>
      </Section>

      <Section n="06" title="What the server receives">
        <p>
          When Darry needs to produce something, your browser sends the server a compact summary
          and nothing more: the rounded behavioural rates described above, a short list of this
          game&rsquo;s rounds as choice, outcome and decision time, the round number, and a
          server-issued game identifier.
        </p>
        <p>
          These requests are processed to answer them and are not written to a database. The game
          identifier is random, generated by the server, and is not connected to any person.
        </p>
      </Section>

      <Section n="07" title="Abuse and cost limits">
        <p>
          Calls to the language model cost money, so the server enforces limits per game, per
          visitor and per day. Enforcing a per-visitor limit requires a stable key.
        </p>
        <p>
          That key is derived from the network address the hosting platform reports for the
          request: the address is combined with a secret held only on the server and truncated, so
          the result cannot be reversed back into an address. That derived value is what the
          counters are stored against. The address itself is not stored by this application and is
          not written into its logs. Like any web service, the hosting platform necessarily
          processes network addresses in order to deliver the page at all.
        </p>
        <p>
          The counters record only how many calls a key has made, and they expire on their own
          between two and forty-eight hours after they are written.
        </p>
      </Section>

      <Section n="08" title="The language model">
        <p>
          When a language model is available, predictions and the closing text are generated by
          OpenAI on the server&rsquo;s behalf. What is sent is the numerical summary described in
          section 6. What is not sent: any identifier, any address, any timestamp, any browser or
          device information, and any text you wrote — because there is none.
        </p>
        <p>
          The calls are made with retention switched off at the provider, so the exchange is not
          kept as part of a conversation history. If a model is not available, or a limit is
          reached, a deterministic engine in this codebase produces the answer instead and the
          game continues unchanged.
        </p>
      </Section>

      <Section n="09" title="Analytics">
        <p>
          The site uses Vercel Web Analytics to count page views and referrers. It sets no cookie
          and does not follow visitors to other websites; to count unique visits it derives a
          short-lived, non-reversible value from ordinary request data such as the network address
          and browser identification string.
        </p>
        <p>
          Alongside page views, a small number of anonymous product events are recorded so it is
          possible to know whether people who arrive actually start and finish: that a game
          started, that the questions were completed, that the booth was entered, that a game was
          completed, that <em>play again</em> was used, and that a share control was pressed. The
          share event carries one detail — whether the device&rsquo;s own share sheet or the
          clipboard was used.
        </p>
        <p>
          Those events carry an event name and nothing else. Your answers, your profile, your
          scores, Darry&rsquo;s predictions, its reasoning and the verdict are never attached to
          any analytics event. This is enforced in code: the analytics helper accepts only names
          from a fixed list and discards any property that is not on a per-event allowlist.
        </p>
        <p>
          Which address you arrived at is itself the campaign measurement. Printed codes point at
          their own path on this site, so the page view alone shows which placement worked. There
          is no tracking parameter, no identifier and no cross-site pixel involved in that.
        </p>
      </Section>

      <Section n="10" title="Service providers">
        <p>
          Three, each doing one thing:
        </p>
        <ul>
          <li>
            <strong>Vercel</strong> — hosting and web analytics. It receives requests for this
            site and, as any host must, the network information that comes with them.
          </li>
          <li>
            <strong>OpenAI</strong> — generates Darry&rsquo;s predictions and closing text from
            the summary in section 6, when a model is available.
          </li>
          <li>
            <strong>Upstash</strong> — stores the expiring rate-limit counters described in
            section 7.
          </li>
        </ul>
        <p>
          None of them is sent your name, your email address or anything you have written,
          because the game holds none of those things.
        </p>
      </Section>

      <Section n="11" title="Advertising">
        <p>
          <strong>No advertising is running on this site at present.</strong> No advertising
          script is loaded, and no advertising network receives a request as a result of your
          visit.
        </p>
        <p>
          This site is being prepared to display advertising through Google AdSense in future. If
          and when that is switched on, it will change some of what is written above, and this is
          what it will change:
        </p>
        <ul>
          <li>
            Advertising will appear only on informational pages like this one and in the area
            below the end of a finished game. It will never appear during play — not on the
            opening, the warning, the questions, the booth, a round, or the ending itself.
          </li>
          <li>
            Google and its partners may set cookies or read similar identifiers in order to serve
            and measure advertising, and may use those to show ads based on prior visits to this
            or other sites. That processing is Google&rsquo;s, under Google&rsquo;s own policies.
          </li>
          <li>
            Nothing the game learns about you is passed to any advertising system. There is no
            code path by which a profile, an answer, a score or a verdict can reach one.
          </li>
        </ul>
        <p>
          Your options, and what will be available where you are, are set out on{' '}
          <Link href="/privacy-choices">privacy choices</Link>. This section will be rewritten in the
          present tense — and the date at the top updated — before any ad is served.
        </p>
      </Section>

      <Section n="12" title="How long anything lasts">
        <ul>
          <li>The behavioural profile: the life of the browser tab. It is never stored.</li>
          <li>The muted-sound preference: until you clear your browser&rsquo;s site data.</li>
          <li>The session cookie: twelve hours.</li>
          <li>Rate-limit counters: between two and forty-eight hours, then automatic deletion.</li>
          <li>
            Analytics: aggregate figures retained by the analytics provider under its own
            retention policy. There is no per-person record to delete.
          </li>
        </ul>
      </Section>

      <Section n="13" title="Security">
        <p>
          The site is served over HTTPS with a strict content security policy that forbids the
          page from sending data to any other host, and with camera, microphone, location and
          payment capabilities switched off at the page level. Predictions are sealed with
          authenticated encryption before they leave the server. Error responses carry a fixed
          code and never a message from an underlying system.
        </p>
        <p>
          No system is perfect, and this one is a game rather than a bank. It is designed so that
          the worst case is small: there is almost nothing held about you to lose.
        </p>
      </Section>

      <Section n="14" title="Your choices">
        <ul>
          <li>Close the tab. The profile ceases to exist; nothing is left behind to erase.</li>
          <li>
            Clear this site&rsquo;s data in your browser to remove the sound preference and the
            session cookie.
          </li>
          <li>Block cookies for this site. The game remains playable.</li>
          <li>
            Turn the sound off from the menu or from the corner of the screen during play, and
            enable your system&rsquo;s reduce-motion setting to remove the moving effects.
          </li>
          <li>
            When advertising is enabled, use the controls described on{' '}
            <Link href="/privacy-choices">privacy choices</Link>.
          </li>
        </ul>
        <p>
          Depending on where you live you may have rights to access, correct or delete personal
          information held about you, or to object to its processing. Requests of that kind are
          welcome, with an honest caveat: this site holds no account and no stored record tied to
          you, so in almost every case there is nothing to retrieve or erase.
        </p>
      </Section>

      <Section n="15" title="Children">
        <p>
          hum(ai)n is not directed to children. It contains sustained psychological horror and is
          not appropriate for them. It does not knowingly collect personal information from
          anyone, including children under 13, and it has no mechanism through which a person of
          any age could provide it.
        </p>
      </Section>

      <Section n="16" title="Changes">
        <p>
          If this policy changes, the date at the top of this page changes with it. Material
          changes — in particular, advertising going live — will be reflected here before they
          take effect rather than afterwards.
        </p>
      </Section>

      <Section n="17" title="Contact">
        <ContactLine subject="privacy policy" />
      </Section>

      <Note>
        <p>
          Related: <Link href="/terms">terms of use</Link> ·{' '}
          <Link href="/privacy-choices">privacy choices</Link> ·{' '}
          <Link href="/behind-the-game">how the game is built</Link>
        </p>
      </Note>
    </EditorialPage>
  );
}
