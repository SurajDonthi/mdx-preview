/**
 * The arithmetic behind panning and zooming a diagram, kept out of the
 * component so it can be reasoned about — and tested — without a DOM.
 *
 * The model is deliberately small. Mermaid has already drawn the diagram at its
 * fitted size; we never re-lay it out. The stage carrying it is transformed with
 * `translate(x, y) scale(s)` about its top-left corner, so a point `p` in the
 * fitted drawing lands at `p * s + offset` inside the viewport. Because a CSS
 * transform does not touch layout, the card keeps exactly the height it had
 * before the reader started exploring, and the surrounding document never
 * reflows underneath them.
 *
 * Every function here is total: it takes whatever numbers it is handed —
 * including the `NaN` a zero-width container produces, or the `0 x 0` viewport
 * of a diagram inside a collapsed panel — and returns a usable transform. None
 * of them throw.
 */

/** Fitted size. Zooming below it would only add empty margin. */
export const MERMAID_MIN_SCALE = 1;
/** Past this the drawing is a handful of pixels wide and navigation is hopeless. */
export const MERMAID_MAX_SCALE = 8;
/** One button press. Roughly a third bigger each time, so four presses ~= 4x. */
export const MERMAID_SCALE_STEP = 1.4;
/** One arrow key press, in viewport pixels. */
export const MERMAID_KEY_PAN_STEP = 48;

export interface MermaidViewportSize {
  width: number;
  height: number;
}

export interface MermaidTransform {
  scale: number;
  x: number;
  y: number;
}

/** The initial fit, and what Reset returns to. */
export const MERMAID_FIT: MermaidTransform = { scale: MERMAID_MIN_SCALE, x: 0, y: 0 };

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function size(viewport: MermaidViewportSize | null | undefined): MermaidViewportSize {
  return {
    width: Math.max(0, finite(viewport?.width)),
    height: Math.max(0, finite(viewport?.height)),
  };
}

export function clampScale(scale: unknown): number {
  // An infinity is a legible answer to "how far" - it is simply too far - so it
  // lands on the bound it ran past. Anything that is not a number at all has no
  // such reading and falls back to the fit.
  if (scale === Infinity) return MERMAID_MAX_SCALE;
  if (scale === -Infinity) return MERMAID_MIN_SCALE;
  const value = finite(scale, MERMAID_MIN_SCALE);
  if (value < MERMAID_MIN_SCALE) return MERMAID_MIN_SCALE;
  if (value > MERMAID_MAX_SCALE) return MERMAID_MAX_SCALE;
  return value;
}

/**
 * Holds the drawing against the frame. The scaled stage is `width * scale`
 * across, so the offset may run from `width - width * scale` (right edge flush)
 * up to `0` (left edge flush). At the fitted scale both ends are zero, which is
 * why a diagram nobody has zoomed cannot be dragged out of view.
 */
export function clampTransform(
  transform: MermaidTransform,
  viewport: MermaidViewportSize | null | undefined
): MermaidTransform {
  const scale = clampScale(transform?.scale);
  const { width, height } = size(viewport);
  const minX = Math.min(0, width - width * scale);
  const minY = Math.min(0, height - height * scale);
  return {
    scale,
    x: Math.min(0, Math.max(minX, finite(transform?.x))),
    y: Math.min(0, Math.max(minY, finite(transform?.y))),
  };
}

/**
 * Changes the scale while keeping the point under `focus` — the pointer, or the
 * middle of the frame for a button press — where it already is. Without this a
 * zoom throws away whatever the reader was looking at.
 */
export function zoomAbout(
  transform: MermaidTransform,
  nextScale: number,
  focus: { x: number; y: number } | null | undefined,
  viewport: MermaidViewportSize | null | undefined
): MermaidTransform {
  const from = clampTransform(transform, viewport);
  const to = clampScale(nextScale);
  // `from.scale` is clamped to at least 1, so the ratio can never divide by zero.
  const ratio = to / from.scale;
  const focusX = finite(focus?.x);
  const focusY = finite(focus?.y);
  return clampTransform(
    {
      scale: to,
      x: focusX - (focusX - from.x) * ratio,
      y: focusY - (focusY - from.y) * ratio,
    },
    viewport
  );
}

/** One press of the zoom in (`direction >= 0`) or zoom out button. */
export function zoomByStep(
  transform: MermaidTransform,
  direction: number,
  viewport: MermaidViewportSize | null | undefined
): MermaidTransform {
  const current = clampScale(transform?.scale);
  const next = direction >= 0 ? current * MERMAID_SCALE_STEP : current / MERMAID_SCALE_STEP;
  const { width, height } = size(viewport);
  return zoomAbout(transform, next, { x: width / 2, y: height / 2 }, viewport);
}

/**
 * Moves the drawing by a screen-space delta. This is the drag: `dx`/`dy` are the
 * pixels the pointer has travelled, applied to the transform the drag started
 * from rather than accumulated, so a clamped edge never eats the return journey.
 */
export function panBy(
  transform: MermaidTransform,
  dx: number,
  dy: number,
  viewport: MermaidViewportSize | null | undefined
): MermaidTransform {
  return clampTransform(
    {
      scale: clampScale(transform?.scale),
      x: finite(transform?.x) + finite(dx),
      y: finite(transform?.y) + finite(dy),
    },
    viewport
  );
}

/** Distance between two pointers, for a pinch. */
export function pointerDistance(
  a: { x: number; y: number } | null | undefined,
  b: { x: number; y: number } | null | undefined
): number {
  const dx = finite(b?.x) - finite(a?.x);
  const dy = finite(b?.y) - finite(a?.y);
  return Math.hypot(dx, dy);
}

/** Midpoint between two pointers — a pinch zooms about the fingers. */
export function pointerMidpoint(
  a: { x: number; y: number } | null | undefined,
  b: { x: number; y: number } | null | undefined
): { x: number; y: number } {
  return { x: (finite(a?.x) + finite(b?.x)) / 2, y: (finite(a?.y) + finite(b?.y)) / 2 };
}

/**
 * The scale a pinch has reached. Two fingers that have not moved, or a degenerate
 * gesture where both landed on the same pixel, leave the scale alone.
 */
export function pinchScale(startScale: number, startDistance: number, distance: number): number {
  const from = clampScale(startScale);
  const start = finite(startDistance);
  const now = finite(distance);
  if (start <= 0 || now <= 0) return from;
  return clampScale(from * (now / start));
}

/** True once there is something outside the frame to drag into it. */
export function isPannable(transform: MermaidTransform): boolean {
  return clampScale(transform?.scale) > MERMAID_MIN_SCALE + 1e-6;
}

/** True when the view is exactly the initial fit, so Reset would do nothing. */
export function isFitted(transform: MermaidTransform): boolean {
  const clamped = clampScale(transform?.scale);
  return (
    Math.abs(clamped - MERMAID_MIN_SCALE) < 1e-6 &&
    Math.abs(finite(transform?.x)) < 0.5 &&
    Math.abs(finite(transform?.y)) < 0.5
  );
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function transformToCss(transform: MermaidTransform): string {
  const scale = round(clampScale(transform?.scale));
  const x = round(finite(transform?.x));
  const y = round(finite(transform?.y));
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

export function zoomPercent(transform: MermaidTransform): number {
  return Math.round(clampScale(transform?.scale) * 100);
}
