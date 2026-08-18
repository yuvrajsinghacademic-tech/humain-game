/**
 * The two things every legal document needs and neither should restate by hand: the
 * revision date, and how to reach somebody.
 *
 * The contact line is the interesting one. Nothing in this repository establishes who
 * is publicly answerable for the site — no company, no address, no mailbox — and a
 * privacy policy is precisely the wrong document to invent one in. So the address is
 * read from configuration, and when it is absent the page says so plainly instead of
 * printing a plausible placeholder that would be a lie in a document whose entire
 * value is that it is not.
 *
 * Setting `NEXT_PUBLIC_CONTACT_EMAIL` turns every one of these into a real address.
 */

import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_ISO, contactEmail } from '@/lib/site/config';
import styles from './Editorial.module.css';

export function LastUpdated() {
  return (
    <p className={styles.recordKey} data-testid="last-updated">
      Last updated: <time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED}</time>
    </p>
  );
}

export function ContactLine({ subject }: { subject: string }) {
  const email = contactEmail();

  if (email) {
    return (
      <p data-testid="contact-line">
        Questions about this {subject} can be sent to{' '}
        <a href={`mailto:${email}`}>{email}</a>.
      </p>
    );
  }

  return (
    <p data-testid="contact-line">
      A contact address for hum(ai)n has not been published yet. One will be listed here before
      any advertising is enabled on this site.
    </p>
  );
}
