/**
 * The image lightbox.
 *
 * What is worth testing here is not that an overlay appears - it is the
 * keyboard and focus contract, which is the part that silently rots: the image
 * has to be reachable and activatable without a mouse, Escape has to close, and
 * focus has to come back to where it was.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MdxRenderer } from '../src/MdxRenderer';
import { THEMES } from '../src/themes';

const theme = THEMES['github-light'];
const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const DOCUMENT = '![A diagram](diagram.png)\n';

function renderMdx(
  props: Partial<React.ComponentProps<typeof MdxRenderer>> = {}
): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  mounted.push({ root: reactRoot, container });

  act(() => {
    reactRoot.render(
      <MdxRenderer
        content={DOCUMENT}
        themeConfig={theme}
        showFrontmatterHeader={false}
        {...props}
      />
    );
  });

  return container;
}

const imageIn = (container: HTMLElement): HTMLImageElement =>
  container.querySelector('.mdxstudio-prose img') as HTMLImageElement;

const overlayIn = (container: HTMLElement): HTMLElement | null =>
  container.querySelector('[data-mdx-lightbox]');

function press(key: string): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    for (const instance of mounted.splice(0)) {
      instance.root.unmount();
      instance.container.remove();
    }
  });
  vi.restoreAllMocks();
});

describe('opening', () => {
  it('makes the image itself a keyboard-reachable control', () => {
    const image = imageIn(renderMdx());

    expect(image.getAttribute('role')).toBe('button');
    expect(image.tabIndex).toBe(0);
    expect(image.getAttribute('alt')).toBe('A diagram');
  });

  it('opens the overlay on a click', () => {
    const container = renderMdx();

    act(() => imageIn(container).click());

    const overlay = overlayIn(container);
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).toBe('dialog');
    expect(overlay?.getAttribute('aria-modal')).toBe('true');
    expect(overlay?.querySelector('img')?.getAttribute('src')).toBe('diagram.png');
  });

  it('opens the overlay on Enter', () => {
    const container = renderMdx();

    act(() => {
      imageIn(container).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );
    });

    expect(overlayIn(container)).not.toBeNull();
  });

  it('opens the overlay on Space', () => {
    const container = renderMdx();

    act(() => {
      imageIn(container).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    expect(overlayIn(container)).not.toBeNull();
  });

  it('moves focus onto the close button', () => {
    const container = renderMdx();

    act(() => imageIn(container).click());

    expect(document.activeElement).toBe(container.querySelector('.mdxstudio-lightbox__close'));
  });
});

describe('closing', () => {
  it('closes on Escape and puts focus back on the image', () => {
    const container = renderMdx();
    const image = imageIn(container);

    act(() => image.click());
    expect(overlayIn(container)).not.toBeNull();

    press('Escape');

    expect(overlayIn(container)).toBeNull();
    expect(document.activeElement).toBe(image);
  });

  it('closes on a click outside the image', () => {
    const container = renderMdx();

    act(() => imageIn(container).click());
    act(() => (overlayIn(container) as HTMLElement).click());

    expect(overlayIn(container)).toBeNull();
  });

  it('stays open when the enlarged image itself is clicked', () => {
    const container = renderMdx();

    act(() => imageIn(container).click());
    act(() => (overlayIn(container)?.querySelector('img') as HTMLImageElement).click());

    expect(overlayIn(container)).not.toBeNull();
  });

  it('closes from the close button', () => {
    const container = renderMdx();

    act(() => imageIn(container).click());
    act(() => (container.querySelector('.mdxstudio-lightbox__close') as HTMLElement).click());

    expect(overlayIn(container)).toBeNull();
  });

  it('keeps focus inside the overlay while it is open', () => {
    const container = renderMdx();

    act(() => imageIn(container).click());
    press('Tab');

    expect(document.activeElement).toBe(container.querySelector('.mdxstudio-lightbox__close'));
  });
});

describe('turning it off', () => {
  it('renders a plain image when the host disables it', () => {
    const container = renderMdx({ lightbox: false });
    const image = imageIn(container);

    expect(image.getAttribute('role')).toBeNull();
    expect(image.tabIndex).toBe(-1);

    act(() => image.click());

    expect(overlayIn(container)).toBeNull();
  });

  it('is off in pdf mode, where nothing can be clicked', () => {
    const container = renderMdx({ renderMode: 'pdf' });

    expect(imageIn(container).getAttribute('role')).toBeNull();
  });
});
