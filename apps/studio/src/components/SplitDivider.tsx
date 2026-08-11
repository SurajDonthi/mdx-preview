import { useRef, type RefObject } from 'react';
import { GripVertical } from 'lucide-react';

// How much of the split view the editor takes. Bounded so neither pane can be
// dragged away entirely; the default is the width the layout used to hard-code.
export const DEFAULT_SPLIT_PERCENT = 45;
export const MIN_SPLIT_PERCENT = 20;
export const MAX_SPLIT_PERCENT = 80;

export const clampSplit = (percent: number): number =>
  Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, percent));

/**
 * Where the pointer puts the boundary, as a percentage of the row the two panes
 * share. Null when the row has no width to measure against, which is what a
 * pane that is not laid out yet looks like.
 */
export function splitPercentAt(
  clientX: number,
  bounds: { left: number; width: number }
): number | null {
  if (!(bounds.width > 0)) return null;
  return clampSplit(((clientX - bounds.left) / bounds.width) * 100);
}

interface SplitDividerProps {
  percent: number;
  isDragging: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onPercentChange: (percent: number) => void;
  /** The row the two panes share, which the percentage is measured against. */
  rowRef: RefObject<HTMLElement | null>;
}

export function SplitDivider({
  percent,
  isDragging,
  onDraggingChange,
  onPercentChange,
  rowRef,
}: SplitDividerProps) {
  const gripRef = useRef<HTMLSpanElement | null>(null);

  /**
   * The grip meets the pointer rather than sitting at the middle of a
   * full-height divider, so it appears under the hand that is reaching for it.
   * Written straight to the node: this fires on every move, and putting it in
   * state would re-render the preview alongside it.
   */
  const positionGrip = (event: React.PointerEvent<HTMLDivElement>) => {
    const grip = gripRef.current;
    if (!grip) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    grip.style.top = `${Math.min(bounds.height, Math.max(0, event.clientY - bounds.top))}px`;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Otherwise the drag starts a text selection across both panes.
    event.preventDefault();
    // Capturing means a fast drag that outruns the pointer keeps reporting here
    // rather than to whatever it happened to pass over.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onDraggingChange(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    positionGrip(event);
    if (!isDragging) return;
    const row = rowRef.current;
    if (!row) return;
    const next = splitPercentAt(event.clientX, row.getBoundingClientRect());
    if (next !== null) onPercentChange(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onDraggingChange(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onPercentChange(clampSplit(percent - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onPercentChange(clampSplit(percent + step));
    } else if (event.key === 'Home' || event.key === 'Enter') {
      event.preventDefault();
      onPercentChange(DEFAULT_SPLIT_PERCENT);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the editor and preview panes"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={MIN_SPLIT_PERCENT}
      aria-valuemax={MAX_SPLIT_PERCENT}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={handlePointerDown}
      onPointerEnter={positionGrip}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onPercentChange(DEFAULT_SPLIT_PERCENT)}
      // z-10: the grip is wider than the divider and hangs over both panes,
      // which are later siblings and would otherwise paint on top of it and
      // shave its sides off.
      className="group relative z-10 hidden md:flex w-2 shrink-0 items-center justify-center cursor-col-resize focus:outline-hidden"
    >
      {/* The seam. Wider and indigo once the divider is in play, so the
          boundary is legible while it is being moved. */}
      <span
        className={`absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full transition-all duration-150 ${
          isDragging
            ? 'w-0.5 bg-indigo-400'
            : 'w-px bg-slate-600 group-hover:w-0.5 group-hover:bg-indigo-400 group-focus-visible:w-0.5 group-focus-visible:bg-indigo-400'
        }`}
      />

      {/* The grip. Out of the way until the divider is worth noticing - pointer
          on it, keyboard focus, or a drag under way. A dark drop shadow is
          invisible on this chrome, so the pill is lifted off the panes by a
          light ring and glows indigo while it is being dragged.

          `top` is written by the pointer handler and deliberately left out of
          the transition, so the grip tracks the cursor instead of chasing it. */}
      <span
        ref={gripRef}
        style={{ top: '50%' }}
        className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-14 w-5 items-center justify-center rounded-full border transition-[opacity,transform,background-color,border-color,box-shadow] duration-150 group-focus-visible:opacity-100 group-focus-visible:scale-100 ${
          isDragging
            ? 'opacity-100 scale-100 bg-indigo-500 border-indigo-300 text-white ring-1 ring-indigo-200/50 shadow-[0_0_20px_rgba(99,102,241,0.6),0_6px_16px_rgba(2,6,23,0.75)]'
            : 'opacity-0 scale-90 bg-slate-700 border-slate-500 text-slate-200 ring-1 ring-white/15 shadow-[0_6px_16px_rgba(2,6,23,0.75)] group-hover:opacity-100 group-hover:scale-100 group-hover:bg-indigo-500 group-hover:border-indigo-300 group-hover:text-white group-hover:ring-indigo-200/40 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.5),0_6px_16px_rgba(2,6,23,0.75)]'
        }`}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </span>
    </div>
  );
}
