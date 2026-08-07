/**
 * The renderer, mounted for real against jsdom.
 *
 * These are the end-to-end guarantees the packages below it exist to provide:
 * a document renders, an unknown tag is a notice rather than a crash, a
 * half-typed document keeps the last good render instead of blanking, and the
 * ids in the DOM are the ones the table of contents links to.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMdxRegistry, defineMdxPlugin, extractHeadings } from '@mdxstudio/core';
import type { MdxRegistry } from '@mdxstudio/core';
import { MdxRenderer } from '../src/MdxRenderer';
import { createRendererRegistry } from '../src/plugin';
import { THEMES } from '../src/themes';

const theme = THEMES['github-light'];

function Widget({ label, count }: { label?: string; count?: number }) {
  return (
    <div data-testid="widget">
      {label}:{count}
    </div>
  );
}

function FenceStub({ language, children }: { language?: string; children?: React.ReactNode }) {
  return (
    <div data-testid="fence" data-language={language}>
      {children}
    </div>
  );
}

function Exploding(): React.ReactElement {
  throw new Error('component exploded');
}

const fencePlugin = defineMdxPlugin({
  name: '@mdxstudio/test-fences',
  components: { MermaidDiagram: FenceStub },
  aliases: { Mermaid: 'MermaidDiagram' },
  codeFences: { mermaid: 'MermaidDiagram' },
});

/** Stable across renders, as MdxRenderer's documentation requires. */
const registry: MdxRegistry = createRendererRegistry(fencePlugin, { Widget, Exploding });

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

interface Rendered {
  container: HTMLDivElement;
  root: HTMLElement;
  html: () => string;
  text: () => string;
  update: (content: string) => void;
}

function renderMdx(
  content: string,
  props: Partial<React.ComponentProps<typeof MdxRenderer>> = {}
): Rendered {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  mounted.push({ root: reactRoot, container });

  const render = (next: string) => {
    act(() => {
      reactRoot.render(
        <MdxRenderer
          content={next}
          themeConfig={theme}
          registry={registry}
          showFrontmatterHeader={false}
          {...props}
        />
      );
    });
  };

  render(content);

  return {
    container,
    root: container.querySelector('.mdxkit-root') as HTMLElement,
    html: () => container.innerHTML,
    text: () => container.textContent ?? '',
    update: render,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // The renderer prints its diagnostics; the assertions read the DOM instead.
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

describe('markdown', () => {
  it('renders headings, prose and lists', () => {
    const view = renderMdx('# Title\n\nSome **bold** prose.\n\n- one\n- two\n');

    expect(view.container.querySelector('h1')?.textContent).toBe('Title');
    expect(view.container.querySelector('strong')?.textContent).toBe('bold');
    expect(view.container.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders GFM tables', () => {
    const view = renderMdx('| a | b |\n| - | - |\n| 1 | 2 |\n');

    expect(view.container.querySelectorAll('table')).toHaveLength(1);
    expect(view.container.querySelectorAll('td')).toHaveLength(2);
  });

  it('strips a javascript: link target', () => {
    const view = renderMdx('[click](javascript:alert(1))\n');
    const link = view.container.querySelector('a')!;

    expect(link.getAttribute('href')).toBeNull();
    expect(link.textContent).toBe('click');
  });

  it('does not nest a block JSX tag inside the paragraph it was written in', () => {
    // `<p>text</p>` on one line is a *text* element to MDX, so it lands inside
    // the markdown paragraph that line produced. React rejects <p> in <p>.
    const view = renderMdx('<div>block on one line</div>\n');

    expect(view.container.querySelector('p > div')).toBeNull();
    expect(view.text()).toContain('block on one line');
  });
});

describe('heading ids', () => {
  it('stamps exactly the ids the table of contents links to', () => {
    const source = [
      '# Getting started',
      '',
      '## Setup',
      '',
      '### The **fast** path',
      '',
      '## Setup',
      '',
      'Body.',
    ].join('\n');

    const view = renderMdx(source);
    const inDom = [...view.container.querySelectorAll('h1, h2, h3, h4')].map((node) => node.id);

    expect(inDom).toEqual(extractHeadings(source).map((heading) => heading.id));
    // Spelled out, so a change to either side has to be deliberate.
    expect(inDom).toEqual(['getting-started', 'setup', 'the-fast-path', 'setup-1']);
  });

  it('does not treat a heading inside a code fence as a heading', () => {
    const source = ['# Real', '', '```bash', '# not a heading', '```', '', '## Also real'].join(
      '\n'
    );

    const view = renderMdx(source);

    expect([...view.container.querySelectorAll('h1, h2')].map((node) => node.id)).toEqual([
      'real',
      'also-real',
    ]);
  });
});

describe('components', () => {
  it('resolves a tag from the registry', () => {
    const view = renderMdx('<Widget label="hits" count={7} />\n');

    expect(view.container.querySelector('[data-testid="widget"]')?.textContent).toBe('hits:7');
  });

  it('resolves a registry alias', () => {
    const view = renderMdx('<Mermaid language="mermaid">graph TD;</Mermaid>\n');

    expect(view.container.querySelector('[data-testid="fence"]')).not.toBeNull();
  });

  it('resolves a built-in component the react plugin ships', () => {
    const view = renderMdx('<Callout type="info" title="Heads up">\n\nBody.\n\n</Callout>\n');

    expect(view.text()).toContain('Heads up');
    expect(view.text()).toContain('Body.');
  });

  it('renders a notice for an unregistered tag instead of throwing', () => {
    const view = renderMdx('<NotRegistered>children survive</NotRegistered>\n\nAfter.\n');
    const notice = view.container.querySelector('[data-mdx-unknown-component]');

    expect(notice?.getAttribute('data-mdx-unknown-component')).toBe('NotRegistered');
    expect(view.text()).toContain('<NotRegistered>');
    // The tag's own children still render, and so does the rest of the page.
    expect(view.text()).toContain('children survive');
    expect(view.text()).toContain('After.');
  });

  it('names the whole dotted path when a namespaced tag does not resolve', () => {
    const view = renderMdx('<Missing.Nested />\n');

    expect(
      view.container.querySelector('[data-mdx-unknown-component]')?.getAttribute(
        'data-mdx-unknown-component'
      )
    ).toBe('Missing.Nested');
  });

  it('catches a component that throws and keeps the page up', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = renderMdx('# Heading\n\n<Exploding />\n');

    expect(view.text()).toContain('MDX Component Error');
    expect(view.text()).toContain('component exploded');
  });
});

describe('code fences', () => {
  it('routes a claimed fence language through the registry', () => {
    const view = renderMdx('```mermaid\ngraph TD;\n  A-->B;\n```\n');
    const fence = view.container.querySelector('[data-testid="fence"]');

    expect(fence).not.toBeNull();
    expect(fence?.getAttribute('data-language')).toBe('mermaid');
    expect(fence?.textContent).toBe('graph TD;\n  A-->B;');
    // Not also syntax-highlighted as an ordinary block.
    expect(view.container.querySelector('.mdxkit-code')).toBeNull();
  });

  it('matches a fence language case-insensitively', () => {
    const view = renderMdx('```Mermaid\ngraph TD;\n```\n');

    expect(view.container.querySelector('[data-testid="fence"]')).not.toBeNull();
  });

  it('syntax-highlights a language nothing claimed', () => {
    const view = renderMdx('```js\nconst a = 1;\n```\n');

    expect(view.container.querySelector('.mdxkit-code')).not.toBeNull();
    expect(view.container.querySelector('.mdxkit-code__lang')?.textContent).toBe('js');
    expect(view.text()).toContain('const a = 1;');
  });

  it('renders a backtick span as inline code, not a block', () => {
    const view = renderMdx('Run `npm ci` first.\n');

    expect(view.container.querySelector('.mdxkit-code')).toBeNull();
    expect(view.container.querySelector('code')?.textContent).toBe('npm ci');
  });
});

describe('a document that does not parse', () => {
  it('shows a located banner and nothing else on a first bad render', () => {
    const view = renderMdx('# Title\n\n<Wrapper>\n\n</Other>\n');

    expect(view.text()).toMatch(/MDX: Line 5, Column \d+ -/);
    expect(view.text()).toContain('Nothing to show');
  });

  it('keeps the last good render behind the banner', () => {
    const view = renderMdx('# Good heading\n\nBody text.\n');
    expect(view.container.querySelector('h1')?.textContent).toBe('Good heading');

    view.update('# Good heading\n\nBody text.\n\n<Unclosed\n');

    expect(view.text()).toContain('Last good render');
    // The preview did not blank while the author was mid-keystroke.
    expect(view.container.querySelector('h1')?.textContent).toBe('Good heading');
    expect(view.text()).toContain('Body text.');
  });

  it('clears the banner once the document parses again', () => {
    const view = renderMdx('# Title\n');
    view.update('# Title\n\n<Unclosed\n');
    expect(view.text()).toContain('MDX:');

    view.update('# Title\n\n<Closed />\n');

    expect(view.text()).not.toContain('MDX:');
  });

  it('renders a document whose expression is not renderable without blanking', () => {
    const view = renderMdx('# Title\n\n{({ a: 1 })}\n\nAfter.\n');

    expect(view.container.querySelector('h1')?.textContent).toBe('Title');
    expect(view.text()).toContain('After.');
  });
});

describe('expression modes', () => {
  const source = '<Widget label={"a" + "b"} count={[1, 2, 3].length} />\n';

  it('evaluates real expressions in full mode', () => {
    const view = renderMdx(source, { expressions: 'full' });

    expect(view.container.querySelector('[data-testid="widget"]')?.textContent).toBe('ab:3');
  });

  it('omits an expression it will not evaluate in literals mode', () => {
    const view = renderMdx(source, { expressions: 'literals' });

    // Both attributes are refused, so the component renders with neither - and
    // the document still renders.
    expect(view.container.querySelector('[data-testid="widget"]')?.textContent).toBe(':');
  });

  it('still accepts JSON-shaped attributes in literals mode', () => {
    const view = renderMdx('<Widget label="fixed" count={7} />\n', { expressions: 'literals' });

    expect(view.container.querySelector('[data-testid="widget"]')?.textContent).toBe('fixed:7');
  });

  it('does not run a call written in a literals-mode document', () => {
    const called = vi.fn();
    const view = renderMdx('<Widget count={danger()} />\n', {
      expressions: 'literals',
      registry: createMdxRegistry({ Widget, danger: called as never }),
    });

    expect(called).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-testid="widget"]')).not.toBeNull();
  });
});

describe('frontmatter header', () => {
  it('renders the header from frontmatter when asked', () => {
    const view = renderMdx('---\ntitle: Architecture\ntags: [Renderer]\n---\n\n# Body\n', {
      showFrontmatterHeader: true,
    });

    expect(view.text()).toContain('Architecture');
    expect(view.text()).toContain('Renderer');
  });

  it('marks the tree for the export pass in pdf mode', () => {
    const view = renderMdx('# Title\n', { renderMode: 'pdf' });

    expect(view.root.getAttribute('data-mdx-render-mode')).toBe('pdf');
    // The export always captures light, whatever the screen theme is.
    expect(view.root.getAttribute('data-mdxkit-theme')).toBe('light');
  });
});
