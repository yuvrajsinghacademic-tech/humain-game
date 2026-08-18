import Link from 'next/link';
import { EditorialPage, Note, Prose, Section } from '@/features/editorial/page';
import { editorialMetadata } from '@/features/editorial/metadata';
import { ContactLine, LastUpdated } from '@/features/editorial/legal';

export const metadata = editorialMetadata({
  path: '/terms',
  title: 'Terms of use',
  description:
    'The terms for using hum(ai)n: what it is for, what it is not, what you may not do to it, and the limits of what is promised.',
});

export default function TermsPage() {
  return (
    <EditorialPage
      path="/terms"
      file="08"
      kicker="Terms of use"
      title="Terms of use"
      lede={
        <>
          Short, and in plain language, because a set of terms nobody can read is not really a
          set of terms.
        </>
      }
    >
      <Prose>
        <LastUpdated />
      </Prose>

      <Section n="01" title="Accepting these terms">
        <p>
          By using hum(ai)n — this website and the game on it — you agree to these terms. If you
          do not agree with them, please do not use the site. In these terms,{' '}
          <em>the site</em> means hum(ai)n as published at this address, and <em>we</em> means
          whoever operates it.
        </p>
      </Section>

      <Section n="02" title="What the site is for">
        <p>
          hum(ai)n is a work of interactive fiction, provided for entertainment. It is free to
          use. There is nothing to buy, no account to create and no subscription.
        </p>
      </Section>

      <Section n="03" title="Content warning">
        <p>
          The game contains sustained psychological horror, themes of surveillance, prediction
          and loss of control, visual distortion, corrupted imagery and unsettling audio. It is
          designed to create discomfort and may provoke anxiety, disturbed sleep, intrusive
          thoughts or nightmares.
        </p>
        <p>
          The warning shown before the game begins is not a formality, and continuing past it is
          your decision. You can stop at any point by closing the tab. If you are sensitive to
          those themes, or to flashing or moving imagery, please do not continue — and note that
          enabling your system&rsquo;s reduce-motion setting removes the moving effects while
          leaving the rest of the piece intact.
        </p>
      </Section>

      <Section n="04" title="Not advice, and not an assessment">
        <p>
          Nothing in hum(ai)n is medical, psychological, psychiatric, clinical, legal, financial
          or professional advice, and nothing in it is a diagnosis.
        </p>
        <p>
          The behavioural readings, the traits, the percentages and the closing verdict are part
          of a game. They describe regularities in how somebody pressed two buttons for a few
          minutes. They are not an assessment of your personality, your abilities, your mental
          health or your employability, and they must not be treated or presented as one. If you
          are struggling with anything the game touches on, please talk to a qualified
          professional rather than to a piece of horror fiction.
        </p>
      </Section>

      <Section n="05" title="Who may use it">
        <p>
          The site is not directed to children, and given its content it is not appropriate for
          them. Please do not use it if you are under 13, or under the minimum age at which you
          can agree to terms like these where you live, whichever is higher.
        </p>
      </Section>

      <Section n="06" title="Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>
            attempt to break, bypass, overload or interfere with the site or the systems behind
            it, including its rate limits, its usage quotas and the mechanism that seals
            predictions before you choose;
          </li>
          <li>
            access the site by automated means, script it, or generate traffic in a way intended
            to consume its resources;
          </li>
          <li>
            probe for or exploit vulnerabilities, or attempt to obtain data or credentials you
            were not given;
          </li>
          <li>
            reverse-engineer the prediction mechanism in order to read an answer before making a
            choice, or otherwise defeat the ordering the game depends on;
          </li>
          <li>use the site in any way that is unlawful, or that interferes with anybody else&rsquo;s use of it.</li>
        </ul>
        <p>
          Reporting a genuine security problem is welcome and is not a breach of these terms. See{' '}
          <Link href="/privacy">privacy</Link> for what the site holds, and section 12 for how to make
          contact.
        </p>
      </Section>

      <Section n="07" title="Intellectual property">
        <p>
          The game, its writing, its artwork, its sound, its code and the name hum(ai)n belong to
          their author and are protected by copyright. You may play the game, link to it, write
          about it, and record or stream your own playthrough of it, including on monetised
          channels — that is welcome.
        </p>
        <p>
          You may not copy, host, republish or redistribute the game or substantial parts of it
          as your own, or present it as somebody else&rsquo;s work. Third-party names mentioned
          on this site belong to their respective owners.
        </p>
      </Section>

      <Section n="08" title="Third-party services">
        <p>
          The site depends on third-party providers for hosting, model inference and rate
          limiting, and may in future display advertising supplied by a third party. Those
          services are governed by their own terms and their own privacy policies, and their
          availability is not something this site controls. What each of them does is described
          in the <Link href="/privacy">privacy policy</Link>.
        </p>
      </Section>

      <Section n="09" title="Availability">
        <p>
          The site is provided as it is, when it is available. It may be changed, interrupted or
          withdrawn at any time, with or without notice, in whole or in part. Features may be
          removed. The game may become unavailable permanently.
        </p>
        <p>
          Because the game keeps nothing, there is nothing of yours to lose if it does — but do
          not rely on it being here.
        </p>
      </Section>

      <Section n="10" title="Disclaimers and liability">
        <p>
          The site is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind, whether express or implied, including any implied warranty of
          merchantability, fitness for a particular purpose, or non-infringement. It is not
          promised to be uninterrupted, error-free, or free of anything harmful.
        </p>
        <p>
          To the fullest extent permitted by law, we are not liable for any indirect, incidental,
          special, consequential or punitive damages, or for any loss of data, profits or
          goodwill, arising from your use of the site.
        </p>
        <p>
          Nothing in these terms limits or excludes any liability that cannot lawfully be limited
          or excluded — including liability for death or personal injury caused by negligence, or
          for fraud — and nothing in them affects your statutory rights as a consumer where you
          live. Some jurisdictions do not allow certain exclusions, so parts of this section may
          not apply to you.
        </p>
      </Section>

      <Section n="11" title="Restriction and changes">
        <p>
          Access may be restricted or blocked where it is being used in breach of section 6,
          including automatically by the abuse and cost protections that run on every request.
        </p>
        <p>
          These terms may be updated. The date at the top of this page is changed when they are,
          and continuing to use the site after that means accepting the revised version. If a
          provision of these terms is found unenforceable, the rest continues to apply.
        </p>
      </Section>

      <Section n="12" title="Contact">
        <ContactLine subject="page" />
      </Section>

      <Note>
        <p>
          Related: <Link href="/privacy">privacy policy</Link> ·{' '}
          <Link href="/privacy-choices">privacy choices</Link> · <Link href="/about">about the project</Link>
        </p>
      </Note>
    </EditorialPage>
  );
}
