/**
 * A ProgressBar is a label, a percentage and two coloured boxes. The exporter's
 * light pass wipes every background on its capture sheet and only restores the
 * ones an element names for itself, so the two boxes - which are nothing but a
 * background - used to disappear from the PDF while the text survived.
 *
 * These run the component's real markup through the exporter's real style pass,
 * because that is where the two halves meet and where the bars were lost.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MdxRenderContext } from '@mdxstudio/core';
import { createWhitePaperContainer } from '@mdxstudio/pdf';
import { ProgressBar } from '../src/CustomComponents';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll('.pdf-export-paper-sheet').forEach((sheet) => sheet.remove());
});

function render(node: React.ReactNode, renderMode: 'live' | 'pdf') {
  act(() => {
    root.render(
      <MdxRenderContext.Provider value={{ renderMode, themeCategory: 'light' }}>
        {node}
      </MdxRenderContext.Provider>
    );
  });
}

const track = () => container.querySelector<HTMLElement>('.mdxstudio-progress__track')!;
const fill = () => container.querySelector<HTMLElement>('.mdxstudio-progress__fill')!;

describe('ProgressBar in the PDF render mode', () => {
  it('names the colours of the track and the fill', () => {
    render(<ProgressBar progress={72} label="Coverage" color="emerald" />, 'pdf');

    expect(fill().dataset.pdfSwatch).toBe('#10b981');
    expect(track().dataset.pdfSwatch).toBeTruthy();
    expect(fill().style.width).toBe('72%');
  });

  it('falls back to the default tone rather than an unknown colour', () => {
    render(<ProgressBar progress={10} color="chartreuse" />, 'pdf');

    expect(fill().className).toContain('mdxstudio-progress__fill--indigo');
    expect(fill().dataset.pdfSwatch).toBe('#4f46e5');
  });

  it('leaves the on-screen markup alone', () => {
    render(<ProgressBar progress={40} label="Coverage" color="rose" />, 'live');

    expect(fill().hasAttribute('data-pdf-swatch')).toBe(false);
    expect(track().hasAttribute('data-pdf-swatch')).toBe(false);
  });

  it('keeps both bars visible once the exporter has styled the capture sheet', async () => {
    render(<ProgressBar progress={90} label="Coverage" color="rose" />, 'pdf');

    const paper = await createWhitePaperContainer(container);
    const sheetTrack = paper.querySelector<HTMLElement>('.mdxstudio-progress__track')!;
    const sheetFill = paper.querySelector<HTMLElement>('.mdxstudio-progress__fill')!;

    // The blanket pass sets `background-color: transparent` on everything it
    // touches; anything still holding a colour here was put back deliberately.
    expect(sheetFill.style.backgroundColor).toBe('rgb(244, 63, 94)');
    expect(sheetTrack.style.backgroundColor).not.toBe('transparent');
    expect(sheetFill.style.width).toBe('90%');
  });

  it('drops the bars when the component does not name its colours', async () => {
    // The state this exists to prevent: markup without the swatches leaves the
    // capture sheet with nothing but the label.
    render(<ProgressBar progress={90} label="Coverage" color="rose" />, 'live');

    const paper = await createWhitePaperContainer(container);
    const sheetFill = paper.querySelector<HTMLElement>('.mdxstudio-progress__fill')!;

    expect(sheetFill.style.backgroundColor).toBe('transparent');
  });
});
