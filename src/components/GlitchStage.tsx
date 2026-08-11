'use client';

/**
 * Renders the glitch effects and the procedural background interference.
 *
 * The effects that matter most are the ones that hit the middle of the screen, so
 * this takes a copy of the central composition and duplicates it into clipped,
 * offset fragments — that is how the splits, bands, delayed blocks and misplaced
 * wordmark are produced. Duplicates are `inert` as well as `aria-hidden`, so they
 * contribute no accessible text and nothing inside them can be tabbed to.
 *
 * Every overlay is `pointer-events: none`. Nothing here can swallow a click.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { mulberry32 } from '@/lib/behavior/rng';
import { useSeededPattern } from '@/lib/visual/clientOnly';
import type { ActiveGlitch, GlitchName } from '@/lib/visual/glitchScheduler';
import styles from './GlitchStage.module.css';

function ghostPosition(seed: number): CSSProperties {
  const edge = Math.floor(seed * 4);
  const drift = `${8 + ((seed * 100) % 60)}%`;
  switch (edge) {
    case 0:
      return { top: '3.5%', left: drift };
    case 1:
      return { bottom: '4%', left: drift };
    case 2:
      return { left: '2.5%', top: drift };
    default:
      return { right: '2.5%', top: drift };
  }
}

interface Interference {
  blocks: Array<{ top: string; left: string; width: string; height: string }>;
  deadRows: Array<{ top: string; height: string }>;
  contamination: { top: string; height: string };
}

function buildInterference(rng: () => number): Interference {
  return {
    blocks: Array.from({ length: 5 }, () => ({
      top: `${rng() * 90}%`,
      left: `${rng() * 88}%`,
      width: `${4 + rng() * 16}%`,
      height: `${1 + rng() * 5}%`,
    })),
    deadRows: Array.from({ length: 2 }, () => ({
      top: `${10 + rng() * 78}%`,
      height: `${0.4 + rng() * 1.1}%`,
    })),
    contamination: { top: `${15 + rng() * 65}%`, height: `${0.8 + rng() * 2.2}%` },
  };
}

export function BackgroundInterference({ seed }: { seed: number | null }) {
  const pattern = useSeededPattern<Interference>(`interference:${seed ?? 'random'}`, () =>
    buildInterference(seed === null ? Math.random : mulberry32(seed + 977)),
  );

  if (!pattern) return null;

  return (
    <div className={styles.interference} aria-hidden="true" data-testid="interference">
      {pattern.blocks.map((block, index) => (
        <span key={`b${index}`} className={styles.block} style={block} />
      ))}
      {pattern.deadRows.map((row, index) => (
        <span key={`r${index}`} className={styles.deadRow} style={row} />
      ))}
      <span className={styles.contamination} style={pattern.contamination} />
    </div>
  );
}

/** Stuck red pixels and dead cells, positioned from the event seed. */
function DeadCells({ seed }: { seed: number }) {
  const cells = useMemo(() => {
    const rng = mulberry32(Math.floor(seed * 1e6) + 1);
    return Array.from({ length: 14 }, () => ({
      top: `${rng() * 100}%`,
      left: `${rng() * 100}%`,
      size: `${1 + Math.floor(rng() * 3)}px`,
      red: rng() < 0.45,
    }));
  }, [seed]);

  return (
    <>
      {cells.map((cell, index) => (
        <span
          key={index}
          className={cell.red ? styles.cellRed : styles.cellDead}
          style={{ top: cell.top, left: cell.left, width: cell.size, height: cell.size }}
        />
      ))}
    </>
  );
}

/**
 * A clipped, offset copy of the central composition.
 *
 * `inert` keeps everything inside — including the button — out of the tab order and
 * out of the accessibility tree, so a duplicated composition never produces a second
 * focusable control or a second copy of the label.
 */
function Fragment({
  composition,
  top,
  height,
  offset,
  className = '',
  style,
}: {
  composition: ReactNode;
  top: number;
  height: number;
  offset: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`${styles.fragmentCopy} ${className}`}
      aria-hidden="true"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `inert` lands in React 19 types unevenly
      {...({ inert: '' } as any)}
      style={{
        clipPath: `inset(${top}% 0 ${Math.max(0, 100 - top - height)}% 0)`,
        transform: `translateX(${offset}px)`,
        ...style,
      }}
    >
      {composition}
    </div>
  );
}

export function GlitchStage({
  children,
  composition,
  active,
  reducedMotion,
  seed,
}: {
  children: ReactNode;
  /** A copy of the central composition, duplicated to produce the centre effects. */
  composition?: ReactNode;
  active: readonly ActiveGlitch[];
  reducedMotion: boolean;
  seed: number | null;
}) {
  const live = (name: GlitchName) => active.find((entry) => entry.name === name);
  const motion = (name: GlitchName) => (reducedMotion ? undefined : live(name));

  const vsync = motion('vsync');
  const shift = motion('shift');
  const desync = motion('desync');
  const collapse = live('collapse');
  const split = motion('split');
  const bands = motion('bands');
  const blocks = motion('delayed-blocks');
  const wrongLogo = motion('wrong-logo');
  const chromaHard = motion('chroma-hard');
  const tear = motion('tear');
  const fragment = motion('fragment');
  const skip = live('scanline-skip');
  const cells = live('dead-cells');
  const frame = live('red-frame');
  const dim = live('dim');
  const ghost = live('ghost-text');

  /*
   * Whole-screen transforms. A vertical sync error shifts the frame down; a desync
   * shears it. Both are inline styles rather than animations so the duration is
   * governed entirely by the scheduler.
   */
  const stageStyle = useMemo<CSSProperties | undefined>(() => {
    const parts: string[] = [];
    if (vsync) parts.push(`translateY(${(vsync.seed < 0.5 ? 1 : -1) * (2 + vsync.seed * 6)}px)`);
    if (desync) parts.push(`skewX(${(desync.seed - 0.5) * 1.6}deg)`);
    if (shift) parts.push(`translateX(${(shift.seed - 0.5) * 18}px)`);
    if (parts.length === 0) return undefined;
    return { transform: parts.join(' ') };
  }, [vsync, desync, shift]);

  const centreEffects = Boolean(composition) && !reducedMotion;

  return (
    <div
      className={styles.stage}
      style={stageStyle}
      data-glitch={active.map((entry) => entry.name).join(' ')}
      data-testid="glitch-stage"
    >
      <BackgroundInterference seed={seed} />

      {children}

      {/* Duplicated fragments of the centre. Behind the consent document (z-index). */}
      {centreEffects ? (
        <div className={styles.centreLayer} aria-hidden="true">
          {/*
            The composition splitting into two halves pulling apart. The seam sits at
            42% rather than mid-screen, which is where the wordmark actually is — a
            split at 50% cuts below it and barely reads.
          */}
          {split ? (
            <>
              <Fragment composition={composition} top={0} height={42} offset={-22 - split.seed * 30} />
              <Fragment composition={composition} top={42} height={58} offset={22 + split.seed * 30} />
            </>
          ) : null}

          {/* Several horizontal sections sliding in different directions. */}
          {bands
            ? [0, 22, 44, 66, 84].map((top, index) => (
                <Fragment
                  key={`band-${top}`}
                  composition={composition}
                  top={top}
                  height={index === 4 ? 16 : 22}
                  offset={(index % 2 === 0 ? 1 : -1) * (6 + bands.seed * 26)}
                />
              ))
            : null}

          {/* Rectangular regions holding a delayed copy of the composition. */}
          {blocks
            ? [
                { top: 18, height: 14, offset: 10, left: '8%' },
                { top: 46, height: 18, offset: -16, left: '-6%' },
                { top: 70, height: 12, offset: 22, left: '4%' },
              ].map((rect) => (
                <Fragment
                  key={`blk-${rect.top}`}
                  composition={composition}
                  top={rect.top}
                  height={rect.height}
                  offset={rect.offset * (0.5 + blocks.seed)}
                  className={styles.delayed}
                  style={{ left: rect.left }}
                />
              ))
            : null}

          {/* A corrupted duplicate of the wordmark in the wrong place. */}
          {wrongLogo ? (
            <Fragment
              composition={composition}
              top={0}
              height={100}
              offset={0}
              className={styles.wrongPlace}
              style={{
                left: `${(wrongLogo.seed - 0.5) * 46}%`,
                top: `${(wrongLogo.seed - 0.5) * 34}%`,
              }}
            />
          ) : null}

          {/* Large chromatic displacement of the whole centre. */}
          {chromaHard ? (
            <>
              <Fragment
                composition={composition}
                top={0}
                height={100}
                offset={-8 - chromaHard.seed * 10}
                className={styles.chromaRed}
              />
              <Fragment
                composition={composition}
                top={0}
                height={100}
                offset={8 + chromaHard.seed * 10}
                className={styles.chromaCyan}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <div className={styles.layer} aria-hidden="true">
        {/* A tear straight through the middle of the screen, not near an edge. */}
        {tear ? (
          <span
            key={tear.id}
            className={styles.tear}
            data-testid="glitch-tear"
            style={{
              top: `${38 + tear.seed * 22}%`,
              height: `${1.5 + tear.seed * 4}%`,
              transform: `translateX(${(tear.seed - 0.5) * 60}px)`,
            }}
          />
        ) : null}

        {/* Short horizontal fragments across the centre. */}
        {fragment ? (
          <span
            key={fragment.id}
            className={styles.fragmentBar}
            style={{
              top: `${40 + fragment.seed * 20}%`,
              left: `${20 + fragment.seed * 30}%`,
              width: `${8 + fragment.seed * 26}%`,
              height: `${0.5 + fragment.seed * 1.4}%`,
            }}
          />
        ) : null}

        {skip ? (
          <span
            key={skip.id}
            className={styles.skip}
            data-testid="glitch-scanline-skip"
            style={{ top: `${8 + skip.seed * 78}%`, height: `${2 + skip.seed * 7}%` }}
          />
        ) : null}

        {cells ? <DeadCells key={cells.id} seed={cells.seed} /> : null}

        {frame ? (
          <span
            key={frame.id}
            className={styles.redFrame}
            style={{
              top: `${6 + frame.seed * 40}%`,
              left: `${4 + frame.seed * 30}%`,
              width: `${25 + frame.seed * 45}%`,
              height: `${12 + frame.seed * 32}%`,
            }}
          />
        ) : null}

        {dim ? <span key={dim.id} className={styles.dim} /> : null}

        {/* Signal collapse: the picture drops to almost nothing, then returns. */}
        {collapse ? <span key={collapse.id} className={styles.collapse} data-testid="glitch-collapse" /> : null}

        {ghost?.phrase ? (
          <span
            key={ghost.id}
            className={styles.ghost}
            data-testid="glitch-ghost"
            style={ghostPosition(ghost.seed)}
          >
            {ghost.phrase}
          </span>
        ) : null}
      </div>
    </div>
  );
}
