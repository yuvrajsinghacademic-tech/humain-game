/**
 * The abstract marks used throughout calibration.
 *
 * Inline SVG only — no raster assets, no external image service, nothing that
 * can fail to load or leak a request. Each mark is deliberately meaningless: the
 * player must not be able to infer a "correct" answer from what it depicts, only
 * from the feedback the trial gives them.
 */

import type { GlyphName } from '@/lib/behavior/trials';

export interface GlyphProps {
  name: GlyphName;
  size?: number;
  /** Marks are decorative; the accessible name lives on the enclosing button. */
  className?: string;
}

const STROKE = 1.5;

export function Glyph({ name, size = 56, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
    >
      {shapeFor(name)}
    </svg>
  );
}

function shapeFor(name: GlyphName) {
  switch (name) {
    case 'bar':
      return <rect x="20" y="6" width="8" height="36" />;
    case 'ring':
      return <circle cx="24" cy="24" r="15" />;
    case 'wedge':
      return <path d="M24 8 L40 38 L8 38 Z" />;
    case 'cross':
      return (
        <>
          <line x1="10" y1="10" x2="38" y2="38" />
          <line x1="38" y1="10" x2="10" y2="38" />
        </>
      );
    case 'lattice':
      return (
        <>
          <line x1="10" y1="17" x2="38" y2="17" />
          <line x1="10" y1="31" x2="38" y2="31" />
          <line x1="17" y1="10" x2="17" y2="38" />
          <line x1="31" y1="10" x2="31" y2="38" />
        </>
      );
    case 'arc':
      return <path d="M9 34 A15 15 0 0 1 39 34" />;
    case 'dot':
      return <circle cx="24" cy="24" r="6" fill="currentColor" stroke="none" />;
    case 'notch':
      return <path d="M12 12 H36 V26 H26 V36 H12 Z" />;
    default:
      return <rect x="14" y="14" width="20" height="20" />;
  }
}

/** A short run of marks, used to pose the sequence-continuation trials. */
export function GlyphSequence({ marks, size = 30 }: { marks: readonly GlyphName[]; size?: number }) {
  return (
    <div
      style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', justifyContent: 'center' }}
      aria-hidden="true"
    >
      {marks.map((mark, index) => (
        <Glyph key={`${mark}-${index}`} name={mark} size={size} />
      ))}
      <span
        style={{
          fontFamily: 'var(--mono)',
          color: 'var(--bone-faint)',
          fontSize: `${size * 0.6}px`,
          letterSpacing: '0.15em',
        }}
      >
        ?
      </span>
    </div>
  );
}
