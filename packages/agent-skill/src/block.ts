/**
 * Editing the managed block inside an agent instruction file.
 *
 * Instruction files - `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` and the rest - are
 * hand-written documents that already contain rules their author cares about.
 * This module never rewrites one: it maintains exactly one region delimited by
 * a pair of HTML comments and leaves every other byte alone.
 *
 *     <!-- mdxstudio:begin -->
 *     ...managed content...
 *     <!-- mdxstudio:end -->
 *
 * Everything here is a pure string transform, so the round trip
 * (`upsertBlock` then `stripBlock`) can be tested without touching a disk.
 */

export const BEGIN_MARKER = '<!-- mdxstudio:begin -->';
export const END_MARKER = '<!-- mdxstudio:end -->';

/** What an edit did, for the CLI to report. */
export type BlockAction = 'created' | 'updated' | 'unchanged' | 'removed' | 'absent';

export interface BlockEdit {
  /** The new file contents. */
  text: string;
  action: BlockAction;
  /**
   * True when the file was not in the shape this module writes: a duplicated
   * block, a lone marker, or markers in the wrong order.
   *
   * A complete duplicate region is removed outright - it is unambiguously ours.
   * A *lone* marker only has its marker line removed, because there is no way
   * to tell a half-deleted managed block from something the author wrote by
   * hand, and guessing wrong deletes their work.
   */
  repairedPartialMarkers: boolean;
}

/** A whole line that is nothing but one of the markers. */
function isMarkerLine(line: string, marker: string): boolean {
  return line.trim() === marker;
}

/** Inclusive line range of one well-formed managed region. */
interface Region {
  begin: number;
  end: number;
}

/**
 * Every well-formed managed region, in order.
 *
 * A region is a begin marker and the first end marker after it. Scanning
 * resumes past the end marker, so a well-formed pair can never swallow the one
 * that follows it.
 */
function locateAll(lines: string[]): Region[] {
  const regions: Region[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!isMarkerLine(lines[index], BEGIN_MARKER)) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < lines.length && !isMarkerLine(lines[end], END_MARKER)) end += 1;
    if (end >= lines.length) break;
    regions.push({ begin: index, end });
    index = end + 1;
  }

  return regions;
}

/** True when the file already carries a well-formed managed block. */
export function hasBlock(source: string): boolean {
  return locateAll(source.split('\n')).length > 0;
}

/** The managed region as it is written to disk, without a trailing newline. */
function renderBlock(body: string): string {
  return `${BEGIN_MARKER}\n${body.replace(/^\n+|\n+$/g, '')}\n${END_MARKER}`;
}

/**
 * Rewrites the line array so that at most one managed region survives.
 *
 * `replacement` is spliced in where the first region stood (or nothing, when
 * removing). Later regions - complete duplicates of ours - are deleted whole.
 * Marker lines left over from a half-deleted region are dropped on their own,
 * and whatever prose sat between them stays where it is.
 */
function rewrite(
  lines: string[],
  replacement: string[] | null
): { lines: string[]; hadRegion: boolean; repaired: boolean; seam: number } {
  const regions = locateAll(lines);
  const first = regions[0];
  const dropped = new Set<number>();
  let repaired = regions.length > 1;

  regions.forEach((region, order) => {
    // The first region is replaced in place; the rest are duplicates of ours
    // and go entirely. When removing, the first goes too.
    if (order === 0 && replacement) return;
    for (let line = region.begin; line <= region.end; line += 1) dropped.add(line);
  });

  const out: string[] = [];
  let seam = 0;

  lines.forEach((line, index) => {
    if (first && index === first.begin) {
      // Where the managed block stood, in output coordinates.
      seam = out.length;
      if (replacement) {
        out.push(...replacement);
        return;
      }
    }
    if (first && replacement && index > first.begin && index <= first.end) return;
    if (dropped.has(index)) return;

    // Anything left that is a bare marker line belongs to no complete region.
    if (isMarkerLine(line, BEGIN_MARKER) || isMarkerLine(line, END_MARKER)) {
      repaired = true;
      return;
    }
    out.push(line);
  });

  return { lines: out, hadRegion: regions.length > 0, repaired, seam };
}

/**
 * Inserts the managed block, or replaces it in place when one is already there.
 *
 * Running this twice with the same body is a no-op: the second call reports
 * `unchanged` and returns the input untouched. Content outside the block is
 * never rewritten - a fresh block is appended after the existing text, with one
 * blank line between them.
 */
export function upsertBlock(source: string, body: string): BlockEdit {
  const block = renderBlock(body);
  const { lines, hadRegion, repaired } = rewrite(source.split('\n'), block.split('\n'));

  if (hadRegion) {
    const text = lines.join('\n');
    return {
      text,
      action: text === source ? 'unchanged' : 'updated',
      repairedPartialMarkers: repaired,
    };
  }

  const head = lines.join('\n');
  const text = head.trim() === '' ? `${block}\n` : `${head.replace(/\n+$/, '')}\n\n${block}\n`;

  return {
    text,
    action: text === source ? 'unchanged' : 'created',
    repairedPartialMarkers: repaired,
  };
}

/**
 * Removes the managed block and nothing else.
 *
 * The seam is closed back to what it looked like before the block was inserted:
 * a block at the end of a file leaves the file ending in a single newline, a
 * block at the top leaves no leading blank lines, and a block in the middle
 * leaves one blank line where it stood. For a file that ended in a single
 * newline - which is every well-formed text file - `upsertBlock` followed by
 * `stripBlock` is byte-for-byte identity.
 */
export function stripBlock(source: string): BlockEdit {
  const { lines, hadRegion, repaired, seam } = rewrite(source.split('\n'), null);

  if (!hadRegion) {
    const text = repaired ? lines.join('\n') : source;
    return { text, action: 'absent', repairedPartialMarkers: repaired };
  }

  // Blank lines that abutted the block were the block's own padding, not the
  // author's text, so exactly one separator survives the seam.
  const before = lines.slice(0, seam);
  const after = lines.slice(seam);
  while (before.length > 0 && before[before.length - 1].trim() === '') before.pop();
  while (after.length > 0 && after[0].trim() === '') after.shift();

  const tail = after.join('\n').replace(/\n+$/, '');

  let text: string;
  if (before.length === 0) text = tail === '' ? '' : `${tail}\n`;
  else if (tail === '') text = `${before.join('\n')}\n`;
  else text = `${before.join('\n')}\n\n${tail}\n`;

  return { text, action: 'removed', repairedPartialMarkers: repaired };
}
