'use client';

/**
 * Television static behind the main menu.
 *
 * Drawn into a deliberately small offscreen canvas (a few hundred pixels wide) and
 * stretched over the viewport with smoothing disabled, which gives coarse analogue
 * grain for a fraction of the cost of generating real pixels at display resolution.
 * Redrawn at about eleven frames a second, not sixty — static reads as static well
 * below the refresh rate, and this keeps the menu cheap enough for a phone.
 *
 * Mostly monochrome, low opacity, behind everything, non-interactive, and hidden from
 * assistive technology. Under reduced motion it renders exactly one frame and stops,
 * leaving a stationary grain texture.
 */

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/lib/visual/clientOnly';
import styles from './TvStatic.module.css';

/** Offscreen buffer size. Small on purpose. */
const BUFFER_WIDTH = 320;
const BUFFER_HEIGHT = 180;
/** Target redraw rate. */
const FPS = 11;

export function TvStatic({ opacity = 0.06 }: { opacity?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const context = node.getContext('2d', { alpha: true });
    if (!context) return;

    node.width = BUFFER_WIDTH;
    node.height = BUFFER_HEIGHT;
    context.imageSmoothingEnabled = false;

    const frame = context.createImageData(BUFFER_WIDTH, BUFFER_HEIGHT);
    const pixels = frame.data;

    const draw = () => {
      for (let i = 0; i < pixels.length; i += 4) {
        // One random luminance per pixel, so the grain is monochrome…
        const value = (Math.random() * 255) | 0;
        pixels[i] = value;
        pixels[i + 1] = value;
        pixels[i + 2] = value;
        // …with a slight red lift on a small minority of cells, which is what keeps
        // it feeling like a contaminated signal rather than neutral noise.
        if (value > 232) pixels[i] = 255;
        pixels[i + 3] = value > 26 ? 255 : 0;
      }
      context.putImageData(frame, 0, 0);
    };

    draw();
    if (reducedMotion) return;

    let raf: number | null = null;
    let last = 0;
    const interval = 1000 / FPS;

    const loop = (time: number) => {
      if (time - last >= interval) {
        last = time;
        draw();
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvas}
      className={styles.static}
      style={{ opacity }}
      aria-hidden="true"
      data-testid="tv-static"
      data-frozen={String(reducedMotion)}
    />
  );
}
