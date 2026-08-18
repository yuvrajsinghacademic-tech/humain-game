#!/usr/bin/env node

/**
 * Campaign QR codes.
 *
 * Usage:
 *   npm run qr -- sunset-a                 one campaign
 *   npm run qr -- sunset-a melrose usc     several
 *   npm run qr -- --all                    every campaign in the registry
 *   npm run qr -- --list                   print the registry and exit
 *   npm run qr -- sunset-a --out ./tmp     somewhere other than campaign-assets/
 *
 * Writes an SVG per campaign into `campaign-assets/`, which is git-ignored. SVG
 * because a QR code is geometry, not a photograph: it scales to a sticker, a poster
 * or a projection with no resampling, and a print shop can open it directly.
 *
 * Three properties this script is careful about, because a wrong QR code is not a bug
 * you find in review — it is a bug you find after five hundred stickers are printed:
 *
 *  1. **The slug must exist.** An unknown slug is refused, loudly, with the valid list
 *     printed. `/sunset_a` would 404 for every person who scanned it.
 *  2. **The encoded URL is built from the same registry the routes are.** There is no
 *     second place where an address is written down and no opportunity for the code
 *     and the route to disagree.
 *  3. **The encoded text is printed and echoed back.** It is on screen, in the file,
 *     and in the SVG's title — so it can be read without a scanner before anything is
 *     sent to print.
 *
 * Error correction is level H (~30% recoverable), and the quiet zone is the full four
 * modules the specification requires. Both matter for something that will be rained
 * on, scuffed, and partially covered by another sticker.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// ---------------------------------------------------------------------------
// The registry, read from the TypeScript source
// ---------------------------------------------------------------------------

/**
 * `src/lib/campaigns/index.ts` is TypeScript and this is a plain Node script, so the
 * rows are extracted textually rather than imported. That is deliberate: adding a
 * build step to a marketing utility would mean the utility could break the build.
 *
 * It reads the same file the routes read, so the two cannot drift — and if the shape
 * of that file ever changes enough to break this, it fails with a clear message
 * rather than silently producing an empty list.
 */
function readCampaigns() {
  const source = require('node:fs').readFileSync(
    join(ROOT, 'src/lib/campaigns/index.ts'),
    'utf8',
  );
  const block = /export const CAMPAIGNS[^=]*=\s*\[([\s\S]*?)\n\] as const;/.exec(source);
  if (!block) {
    throw new Error('could not find CAMPAIGNS in src/lib/campaigns/index.ts — has it moved?');
  }

  const rows = [];
  const row = /\{\s*slug:\s*'([^']+)'([^}]*)\}/g;
  let match;
  while ((match = row.exec(block[1])) !== null) {
    const [, slug, rest] = match;
    rows.push({
      slug,
      placement: /placement:\s*'([^']*)'/.exec(rest)?.[1] ?? '',
      creative: /creative:\s*"([^"]*)"|creative:\s*'([^']*)'/.exec(rest)?.slice(1).find(Boolean) ?? '',
      channel: /channel:\s*'([^']*)'/.exec(rest)?.[1] ?? '',
    });
  }
  if (rows.length === 0) throw new Error('CAMPAIGNS parsed to zero rows — refusing to continue');
  return rows;
}

/** The canonical origin, read from the same constant the application uses. */
function readSiteUrl() {
  const source = require('node:fs').readFileSync(join(ROOT, 'src/lib/site/config.ts'), 'utf8');
  const found = /export const SITE_URL = '([^']+)'/.exec(source);
  if (!found) throw new Error('could not find SITE_URL in src/lib/site/config.ts');
  return found[1];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * One QR code as an SVG, drawn as a single `<path>` of filled squares.
 *
 * A path rather than one `<rect>` per module: a version-4 code is ~900 modules and a
 * file of 900 elements chokes some print software. `shape-rendering: crispEdges`
 * stops a renderer anti-aliasing module boundaries into grey, which is what makes a
 * small printed code fail to scan.
 */
function toSvg(text, { quietZone = 4 } = {}) {
  // Type 0 lets the library choose the smallest version that fits at this error level.
  const code = qrcode(0, 'H');
  code.addData(text);
  code.make();

  const count = code.getModuleCount();
  const size = count + quietZone * 2;

  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (code.isDark(row, column)) {
        path += `M${column + quietZone} ${row + quietZone}h1v1h-1z`;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"`,
    ` width="1024" height="1024" shape-rendering="crispEdges" role="img"`,
    ` aria-label="QR code for ${text}">`,
    `<title>${text}</title>`,
    // The quiet zone is white, not transparent. A transparent QR printed onto a dark
    // sticker is a QR code that does not scan.
    `<rect width="${size}" height="${size}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#000000"/>`,
    `</svg>`,
    '',
  ].join('');
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const optionValue = (flag, fallback) => {
  const at = argv.indexOf(flag);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};

const campaigns = readCampaigns();
const siteUrl = readSiteUrl();
const slugs = campaigns.map((campaign) => campaign.slug);

/** Widest slug in the registry, so the listings below stay in columns as it grows. */
const SLUG_COLUMN = Math.max(...slugs.map((slug) => slug.length));

if (has('--help') || has('-h')) {
  console.log(
    [
      'Campaign QR codes',
      '',
      '  npm run qr -- <slug> [slug…]   generate for these campaigns',
      '  npm run qr -- --all            generate for every campaign',
      '  npm run qr -- --list           print the registry',
      '  npm run qr -- --out <dir>      output directory (default campaign-assets)',
      '',
      `Campaigns: ${slugs.join(', ')}`,
    ].join('\n'),
  );
  process.exit(0);
}

if (has('--list')) {
  console.log(`campaigns (${campaigns.length}) — ${siteUrl}\n`);
  for (const campaign of campaigns) {
    const detail = [campaign.placement, campaign.creative].filter(Boolean).join(' · ');
    console.log(`  /${campaign.slug.padEnd(SLUG_COLUMN)} ${detail}`);
  }
  process.exit(0);
}

const requested = has('--all')
  ? slugs
  : argv.filter((argument) => !argument.startsWith('-') && argument !== optionValue('--out', null));

if (requested.length === 0) {
  console.error('No campaign given. Try `npm run qr -- --all`, or `npm run qr -- --list`.');
  process.exit(1);
}

const unknown = requested.filter((slug) => !slugs.includes(slug));
if (unknown.length > 0) {
  console.error(`Unknown campaign${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);
  console.error('');
  console.error('A QR code for an address that does not exist is a dead sticker.');
  console.error(`Known campaigns: ${slugs.join(', ')}`);
  console.error('Add a row to CAMPAIGNS in src/lib/campaigns/index.ts first — see docs/CAMPAIGNS.md.');
  process.exit(1);
}

const outDir = resolve(ROOT, optionValue('--out', 'campaign-assets'));
mkdirSync(outDir, { recursive: true });

console.log(`Writing ${requested.length} QR code(s) to ${outDir}\n`);

for (const slug of requested) {
  const url = `${siteUrl}/${slug}`;
  const file = join(outDir, `${slug}.svg`);
  writeFileSync(file, toSvg(url), 'utf8');

  const campaign = campaigns.find((entry) => entry.slug === slug);
  const detail = [campaign?.placement, campaign?.creative].filter(Boolean).join(' · ');
  console.log(`  ${slug.padEnd(SLUG_COLUMN)} → ${url}`);
  if (detail) console.log(`  ${''.padEnd(SLUG_COLUMN)}   ${detail}`);
}

console.log('\nRead the URL under each code before printing. Then scan the printed proof.');
