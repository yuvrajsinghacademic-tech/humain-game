/**
 * Metadata for an editorial route.
 *
 * One helper so eight pages cannot drift apart on the three things a crawler and a
 * share preview actually read: the title, the description, and the canonical URL.
 *
 * The canonical is absolute. `metadataBase` is set in the root layout, so a relative
 * one would resolve correctly too — but a campaign route already carries an absolute
 * canonical, and having the two forms side by side in the same codebase is the kind
 * of small inconsistency that becomes a bug the day `metadataBase` moves.
 *
 * Everything not named here — icon, social image, robots — is inherited from the
 * root layout unchanged. Editorial pages are indexable; that is the point of them.
 */

import type { Metadata } from 'next';
import { SITE_NAME, absoluteUrl } from '@/lib/site/config';

export interface EditorialMetadataInput {
  path: string;
  /** Shown in the tab and in search results. The site name is appended. */
  title: string;
  /** Roughly 120–160 characters. Written for a person, not for a crawler. */
  description: string;
}

export function editorialMetadata({ path, title, description }: EditorialMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const full = `${title} — ${SITE_NAME}`;

  return {
    title: full,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      siteName: SITE_NAME,
      title: full,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: full,
      description,
    },
  };
}
