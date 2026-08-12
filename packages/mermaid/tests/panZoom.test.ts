/**
 * The arithmetic behind pan and zoom.
 *
 * What is load-bearing here is not "the number went up". It is that the reader
 * can always get back: Reset must land on exactly the fitted view, the clamp
 * must make it impossible to drag the drawing off its own frame, and a zoom must
 * keep the thing being looked at under the pointer. The degenerate shapes matter
 * just as much - a diagram inside a collapsed panel measures 0 x 0, and every
 * one of these functions has to answer that with a transform rather than a
 * crash.
 */

import { describe, expect, it } from 'vitest';

import {
  MERMAID_FIT,
  MERMAID_KEY_PAN_STEP,
  MERMAID_MAX_SCALE,
  MERMAID_MIN_SCALE,
  MERMAID_SCALE_STEP,
  clampScale,
  clampTransform,
  isFitted,
  isPannable,
  panBy,
  pinchScale,
  pointerDistance,
  pointerMidpoint,
  transformToCss,
  zoomAbout,
  zoomByStep,
  zoomPercent,
} from '../src/panZoom';

const VIEWPORT = { width: 800, height: 400 };

describe('clampScale', () => {
  it('holds the fitted scale as the floor', () => {
    expect(clampScale(0.2)).toBe(MERMAID_MIN_SCALE);
    expect(clampScale(-4)).toBe(MERMAID_MIN_SCALE);
    expect(clampScale(0)).toBe(MERMAID_MIN_SCALE);
  });

  it('holds the ceiling', () => {
    expect(clampScale(1000)).toBe(MERMAID_MAX_SCALE);
    expect(clampScale(Infinity)).toBe(MERMAID_MAX_SCALE);
  });

  it('passes a scale in range through untouched', () => {
    expect(clampScale(2.5)).toBe(2.5);
  });

  it('answers rubbish with the fitted scale rather than NaN', () => {
    expect(clampScale(NaN)).toBe(MERMAID_MIN_SCALE);
    expect(clampScale(undefined)).toBe(MERMAID_MIN_SCALE);
    expect(clampScale('3' as unknown as number)).toBe(MERMAID_MIN_SCALE);
  });
});

describe('clampTransform', () => {
  it('pins a fitted diagram at the origin, whatever offset it is handed', () => {
    expect(clampTransform({ scale: 1, x: -500, y: 320 }, VIEWPORT)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('allows exactly the overhang the zoom created', () => {
    // At 2x an 800px frame carries 1600px of drawing, so 800px may scroll past.
    expect(clampTransform({ scale: 2, x: -800, y: -400 }, VIEWPORT)).toEqual({
      scale: 2,
      x: -800,
      y: -400,
    });
    expect(clampTransform({ scale: 2, x: -801, y: -401 }, VIEWPORT)).toEqual({
      scale: 2,
      x: -800,
      y: -400,
    });
  });

  it('never lets the drawing pull away from the top left', () => {
    expect(clampTransform({ scale: 3, x: 40, y: 12 }, VIEWPORT)).toEqual({ scale: 3, x: 0, y: 0 });
  });

  it('survives a zero-sized frame', () => {
    expect(clampTransform({ scale: 4, x: -20, y: -20 }, { width: 0, height: 0 })).toEqual({
      scale: 4,
      x: 0,
      y: 0,
    });
  });

  it('survives a missing frame and non-numeric offsets', () => {
    expect(clampTransform({ scale: 2, x: NaN, y: NaN }, null)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(clampTransform({ scale: 2, x: -10, y: -10 }, undefined)).toEqual({
      scale: 2,
      x: 0,
      y: 0,
    });
    expect(
      clampTransform({ scale: 2, x: -10, y: -10 }, { width: NaN, height: -50 })
    ).toEqual({ scale: 2, x: 0, y: 0 });
  });
});

describe('zoomByStep', () => {
  it('multiplies by one step in and divides by one step out', () => {
    const inOnce = zoomByStep(MERMAID_FIT, 1, VIEWPORT);
    expect(inOnce.scale).toBeCloseTo(MERMAID_SCALE_STEP, 10);
    expect(zoomByStep(inOnce, -1, VIEWPORT).scale).toBeCloseTo(MERMAID_MIN_SCALE, 10);
  });

  it('cannot be zoomed out below the fit', () => {
    const out = zoomByStep(MERMAID_FIT, -1, VIEWPORT);
    expect(out).toEqual({ scale: MERMAID_MIN_SCALE, x: 0, y: 0 });
  });

  it('stops at the ceiling however many times it is pressed', () => {
    let state = MERMAID_FIT;
    for (let press = 0; press < 40; press += 1) state = zoomByStep(state, 1, VIEWPORT);
    expect(state.scale).toBe(MERMAID_MAX_SCALE);
  });

  it('zooms about the middle of the frame, so the centre of the drawing stays put', () => {
    const state = zoomByStep(MERMAID_FIT, 1, VIEWPORT);
    const centre = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
    // The point that was in the middle is still in the middle.
    expect(centre.x * state.scale + state.x).toBeCloseTo(centre.x, 6);
    expect(centre.y * state.scale + state.y).toBeCloseTo(centre.y, 6);
  });

  it('returns to exactly the fit after the same number of presses each way', () => {
    let state = MERMAID_FIT;
    for (let press = 0; press < 5; press += 1) state = zoomByStep(state, 1, VIEWPORT);
    for (let press = 0; press < 5; press += 1) state = zoomByStep(state, -1, VIEWPORT);
    expect(state.scale).toBeCloseTo(1, 10);
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
  });

  it('does not throw on a zero-sized frame', () => {
    expect(() => zoomByStep(MERMAID_FIT, 1, { width: 0, height: 0 })).not.toThrow();
    expect(zoomByStep(MERMAID_FIT, 1, { width: 0, height: 0 })).toEqual({
      scale: MERMAID_SCALE_STEP,
      x: 0,
      y: 0,
    });
  });
});

describe('zoomAbout', () => {
  it('keeps the focused point exactly where it was', () => {
    const focus = { x: 640, y: 90 };
    const state = zoomAbout({ scale: 1.5, x: -120, y: -30 }, 3, focus, VIEWPORT);
    const before = (focus.x - -120) / 1.5;
    const after = (focus.x - state.x) / state.scale;
    expect(after).toBeCloseTo(before, 6);
  });

  it('clamps the focused point back inside when the edge gets in the way', () => {
    // Focusing the far right at low zoom asks for an offset the clamp refuses.
    const state = zoomAbout(MERMAID_FIT, 1.2, { x: 800, y: 400 }, VIEWPORT);
    expect(state.x).toBeGreaterThanOrEqual(VIEWPORT.width - VIEWPORT.width * state.scale);
    expect(state.x).toBeLessThanOrEqual(0);
  });

  it('treats a missing focus as the origin', () => {
    expect(zoomAbout(MERMAID_FIT, 2, null, VIEWPORT)).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it('never divides by zero even when handed a zero scale', () => {
    const state = zoomAbout({ scale: 0, x: 0, y: 0 }, 2, { x: 10, y: 10 }, VIEWPORT);
    expect(Number.isFinite(state.x)).toBe(true);
    expect(Number.isFinite(state.y)).toBe(true);
    expect(state.scale).toBe(2);
  });
});

describe('panBy', () => {
  it('moves the drawing by the pointer delta', () => {
    expect(panBy({ scale: 2, x: -100, y: -50 }, -40, -20, VIEWPORT)).toEqual({
      scale: 2,
      x: -140,
      y: -70,
    });
  });

  it('is a no-op at the fitted scale, so a drag cannot displace a fitted diagram', () => {
    expect(panBy(MERMAID_FIT, -200, -200, VIEWPORT)).toEqual(MERMAID_FIT);
  });

  it('stops at the far edge instead of running past it', () => {
    expect(panBy({ scale: 2, x: -700, y: 0 }, -400, 0, VIEWPORT).x).toBe(-800);
  });

  it('lets the reader come straight back from a clamped edge', () => {
    const atEdge = panBy({ scale: 2, x: -700, y: 0 }, -400, 0, VIEWPORT);
    expect(panBy(atEdge, 100, 0, VIEWPORT).x).toBe(-700);
  });

  it('ignores a non-numeric delta rather than poisoning the transform', () => {
    expect(panBy({ scale: 2, x: -100, y: -50 }, NaN, undefined as unknown as number, VIEWPORT)).toEqual({
      scale: 2,
      x: -100,
      y: -50,
    });
  });

  it('takes one keyboard step per arrow press', () => {
    const zoomed = { scale: 2, x: -400, y: -200 };
    expect(panBy(zoomed, -MERMAID_KEY_PAN_STEP, 0, VIEWPORT).x).toBe(-400 - MERMAID_KEY_PAN_STEP);
  });
});

describe('pinch', () => {
  it('measures the distance and midpoint between two pointers', () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pointerMidpoint({ x: 0, y: 10 }, { x: 4, y: 30 })).toEqual({ x: 2, y: 20 });
  });

  it('scales by the ratio the fingers travelled', () => {
    expect(pinchScale(1, 100, 250)).toBeCloseTo(2.5, 10);
    expect(pinchScale(2, 200, 100)).toBeCloseTo(1, 10);
  });

  it('clamps a pinch like any other zoom', () => {
    expect(pinchScale(1, 100, 10)).toBe(MERMAID_MIN_SCALE);
    expect(pinchScale(4, 100, 10000)).toBe(MERMAID_MAX_SCALE);
  });

  it('leaves the scale alone when two fingers land on the same pixel', () => {
    expect(pinchScale(2, 0, 40)).toBe(2);
    expect(pinchScale(2, 40, 0)).toBe(2);
    expect(pinchScale(2, NaN, NaN)).toBe(2);
  });

  it('reads missing pointers as the origin rather than throwing', () => {
    expect(pointerDistance(null, undefined)).toBe(0);
    expect(pointerMidpoint(null, undefined)).toEqual({ x: 0, y: 0 });
  });
});

describe('state predicates', () => {
  it('knows there is nothing to pan at the fit', () => {
    expect(isPannable(MERMAID_FIT)).toBe(false);
    expect(isPannable({ scale: 1.0000001, x: 0, y: 0 })).toBe(false);
    expect(isPannable({ scale: 1.4, x: 0, y: 0 })).toBe(true);
  });

  it('recognises the fitted view, including a sub-pixel drift', () => {
    expect(isFitted(MERMAID_FIT)).toBe(true);
    expect(isFitted({ scale: 1, x: -0.2, y: 0.1 })).toBe(true);
    expect(isFitted({ scale: 1, x: -8, y: 0 })).toBe(false);
    expect(isFitted({ scale: 2, x: 0, y: 0 })).toBe(false);
  });

  it('reports the zoom as a whole percentage', () => {
    expect(zoomPercent(MERMAID_FIT)).toBe(100);
    expect(zoomPercent({ scale: 1.96, x: 0, y: 0 })).toBe(196);
    expect(zoomPercent({ scale: NaN, x: 0, y: 0 })).toBe(100);
  });
});

describe('transformToCss', () => {
  it('writes the transform the stage wears', () => {
    expect(transformToCss({ scale: 2, x: -100, y: -50 })).toBe('translate(-100px, -50px) scale(2)');
  });

  it('rounds off float noise instead of emitting a twenty-digit number', () => {
    expect(transformToCss({ scale: 1.9599999999999997, x: -0.10000001, y: 0 })).toBe(
      'translate(-0.1px, 0px) scale(1.96)'
    );
  });

  it('emits a usable transform for a broken state', () => {
    expect(transformToCss({ scale: NaN, x: NaN, y: NaN })).toBe('translate(0px, 0px) scale(1)');
  });
});
