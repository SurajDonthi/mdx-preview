/**
 * The two pieces of syntax the parser turns into components: math and GitHub's
 * alert blockquotes.
 *
 * Mounted for real, because the interesting part of each one is the hand-off
 * from the parser to a component - math has to reach KaTeX through a lazy
 * import, and an alert has to come out as the same callout a hand-written
 * `<Callout>` produces.
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

/**
 * Turns the event loop until `done` holds.
 *
 * KaTeX arrives through a dynamic import, so how many ticks that takes is the
 * test runner's business and not something to guess at with a fixed number.
 */
async function settle(done: () => boolean = () => true, turns = 100): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    if (done()) return;
  }
}

const hasKatex = (container: HTMLElement, selector: string) => () =>
  container.querySelector(`${selector} .katex`) !== null;

/** Renders, then lets the lazy KaTeX import settle. */
async function renderMdx(
  content: string,
  props: Partial<React.ComponentProps<typeof MdxRenderer>> = {}
): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  mounted.push({ root: reactRoot, container });

  await act(async () => {
    reactRoot.render(
      <MdxRenderer
        content={content}
        themeConfig={theme}
        showFrontmatterHeader={false}
        {...props}
      />
    );
  });

  await settle();
  return container;
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

describe('math', () => {
  it('typesets an inline expression with KaTeX', async () => {
    const container = await renderMdx('The area is $\\pi r^2$ exactly.\n');
    await settle(hasKatex(container, '.mdxstudio-math--inline'));
    const math = container.querySelector('.mdxstudio-math--inline');

    expect(math).not.toBeNull();
    expect(math?.querySelector('.katex')).not.toBeNull();
    // The prose either side is untouched.
    expect(container.textContent).toContain('The area is');
    expect(container.textContent).toContain('exactly.');
  });

  it('typesets a $$ block as display math', async () => {
    const container = await renderMdx('$$\n\\frac{a}{b}\n$$\n');
    await settle(hasKatex(container, '.mdxstudio-math--display'));
    const math = container.querySelector('.mdxstudio-math--display');

    expect(math).not.toBeNull();
    expect(math?.querySelector('.katex')).not.toBeNull();
  });

  it('renders math in literals mode too', async () => {
    // KaTeX typesets a string; it does not evaluate anything the document
    // wrote, so the safe expression mode has no reason to withhold it.
    const container = await renderMdx('Energy is $E = mc^2$.\n', { expressions: 'literals' });
    await settle(hasKatex(container, '.mdxstudio-math--inline'));

    expect(container.querySelector('.mdxstudio-math--inline .katex')).not.toBeNull();
  });

  it('leaves prices in prose as prose', async () => {
    const container = await renderMdx('it costs $5 and $10 in total\n');

    expect(container.querySelector('.mdxstudio-math')).toBeNull();
    expect(container.textContent).toContain('it costs $5 and $10 in total');
  });

  it('shows the source rather than nothing while KaTeX is still loading', async () => {
    // The first render is synchronous and the import is not: whatever happens,
    // the reader sees the expression.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const reactRoot = createRoot(container);
    mounted.push({ root: reactRoot, container });

    act(() => {
      reactRoot.render(
        <MdxRenderer content={'$a+b$\n'} themeConfig={theme} showFrontmatterHeader={false} />
      );
    });

    expect(container.textContent).toContain('a+b');
  });
});

describe('github alerts', () => {
  it('renders an alert through the callout the packages already ship', async () => {
    const container = await renderMdx('> [!WARNING]\n> Mind the gap.\n');

    expect(container.querySelector('.mdxstudio-callout--warning')).not.toBeNull();
    expect(container.querySelector('.mdxstudio-callout__title')?.textContent).toBe('Warning');
    expect(container.textContent).toContain('Mind the gap.');
    expect(container.querySelector('blockquote')).toBeNull();
  });

  it('renders each marker as its own variant', async () => {
    const container = await renderMdx(
      ['> [!NOTE]\n> n', '> [!TIP]\n> t', '> [!IMPORTANT]\n> i', '> [!CAUTION]\n> c'].join('\n\n')
    );

    expect(container.querySelector('.mdxstudio-callout--note')).not.toBeNull();
    expect(container.querySelector('.mdxstudio-callout--success')).not.toBeNull();
    expect(container.querySelector('.mdxstudio-callout--info')).not.toBeNull();
    expect(container.querySelector('.mdxstudio-callout--error')).not.toBeNull();
  });

  it('renders an alert in literals mode too', async () => {
    // The callout's props are written by the parser as plain strings, so there
    // is no expression for the safe mode to refuse.
    const container = await renderMdx('> [!TIP]\n> Still here.\n', { expressions: 'literals' });

    expect(container.querySelector('.mdxstudio-callout__title')?.textContent).toBe('Tip');
    expect(container.textContent).toContain('Still here.');
  });

  it('leaves an unknown marker as an ordinary quote', async () => {
    const container = await renderMdx('> [!SOMETHING]\n> Still a quote.\n');

    expect(container.querySelector('.mdxstudio-callout')).toBeNull();
    expect(container.querySelector('blockquote')?.textContent).toContain('[!SOMETHING]');
  });
});
