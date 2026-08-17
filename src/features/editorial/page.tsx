/**
 * The primitives every editorial page is built from.
 *
 * One page is one `<EditorialPage>`: a file number, a title, a lede, and a run of
 * numbered sections. That structure is the design — it is what makes eight documents
 * written weeks apart read as one filing system rather than eight web pages, and it
 * is what keeps the heading hierarchy correct without anyone having to think about
 * it (`h1` once, `h2` per section, and nothing skipped).
 *
 * All server components. Nothing in this file has state, an effect, or an event
 * handler, so an editorial route ships no JavaScript of its own.
 *
 * The advertising surface is part of the page shell rather than something an author
 * places by hand, so it can only ever land in one position: after the last section,
 * above the footer, separated by a large fixed gap. With no AdSense account
 * configured it renders nothing at all.
 */

import type { ReactNode } from 'react';
import { AdSlot } from '@/components/ads/AdSlot';
import { EditorialShell } from './chrome';
import styles from './Editorial.module.css';

export interface EditorialPageProps {
  /** The route this page is served at, e.g. `/about`. Marks the current nav item. */
  path: string;
  /** Two digits. The document's number in the filing system. */
  file: string;
  /** The word after the file number, e.g. `ABOUT`. */
  kicker: string;
  title: string;
  /** One or two sentences under the title. The only large body type on the page. */
  lede: ReactNode;
  children: ReactNode;
  /**
   * Whether this page may carry advertising. Off for the legal documents: an ad
   * beside a privacy policy is bad manners and, on some readings, bad practice.
   */
  advertising?: boolean;
}

export function EditorialPage({
  path,
  file,
  kicker,
  title,
  lede,
  children,
  advertising = false,
}: EditorialPageProps) {
  return (
    <EditorialShell current={path}>
      <article className={styles.article} data-testid="editorial-article">
        <p className={styles.file}>
          <span className={styles.fileMark}>▮</span>
          <span>
            File {file} — {kicker}
          </span>
        </p>

        <h1 className={styles.title}>{title}</h1>
        <div className={styles.lede}>{lede}</div>

        {/*
          Marked, because "the body copy" is a thing tests need to be able to point at.
          The file line and the lede are also paragraphs, at deliberately different
          sizes, so a bare `article p` selector measures the wrong thing.
        */}
        <div className={styles.body} data-testid="editorial-body">
          {children}
        </div>

        {advertising ? (
          <div className={styles.advert}>
            <AdSlot surface="editorial" />
          </div>
        ) : null}
      </article>
    </EditorialShell>
  );
}

/** A numbered section. The number is decorative; the title is the heading. */
export function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionNumber} aria-hidden="true">
          {n}
        </span>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      <div className={styles.prose}>{children}</div>
    </section>
  );
}

/** Body copy outside a section — used for the odd standalone run of paragraphs. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className={styles.prose}>{children}</div>;
}

/** A key/value record, in the manner of a file header. */
export function Record({ rows }: { rows: ReadonlyArray<{ key: string; value: string; alert?: boolean }> }) {
  return (
    <dl className={styles.record} data-testid="editorial-record">
      {rows.map((row) => (
        <div key={row.key} style={{ display: 'contents' }}>
          <dt className={styles.recordKey}>{row.key}</dt>
          <dd className={`${styles.recordValue} ${row.alert ? styles.recordValueAlert : ''}`}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One question and its answer.
 *
 * The question is an `h3` because it sits inside a section's `h2`, which keeps the
 * outline navigable — a screen-reader user can jump question to question.
 */
export function Qa({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className={styles.qa}>
      <h3 className={styles.question}>{q}</h3>
      <div className={styles.prose}>{children}</div>
    </div>
  );
}

/** A quiet closing aside — smaller, dimmer, above the rule. */
export function Note({ children }: { children: ReactNode }) {
  return <aside className={styles.note}>{children}</aside>;
}
