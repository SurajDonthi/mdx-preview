/**
 * @vitest-environment jsdom
 *
 * A component from the workspace's config throwing.
 *
 * The rest of this project is node - the extension host has no DOM - but this
 * one guarantee is about what React does at render time, and the only way to
 * find out what React does is to let it do it. Written with `createElement`
 * rather than JSX so it stays a `.test.ts` beside the others.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineMdxPlugin } from '@mdxstudio/core';

import { previewRegistry, previewRegistryWith } from '../src/webview/registry';

const h = React.createElement;

/** Throws unless it is told not to, so one instance can be fixed mid-test. */
function Fragile({ ok }: { ok?: boolean }) {
  if (!ok) throw new Error('this component is broken');
  return h('span', { 'data-testid': 'fragile' }, 'fixed');
}

function Fine({ label }: { label?: string }) {
  return h('span', { 'data-testid': 'fine' }, label);
}

const registry = previewRegistryWith([
  defineMdxPlugin({
    name: 'mdxstudio.config.js',
    components: { Fragile, Fine },
    aliases: { Wobbly: 'Fragile' },
  }),
]);

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function mount(element: React.ReactNode): { container: HTMLDivElement; render: (next: React.ReactNode) => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });

  const render = (next: React.ReactNode) => act(() => root.render(next));
  render(element);
  return { container, render };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // React prints the caught error itself; the assertions read the DOM.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
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

describe('a config component that throws', () => {
  it('becomes a marker instead of taking the document with it', () => {
    const Fragile_ = registry.components.Fragile;
    const Fine_ = registry.components.Fine;

    const { container } = mount(
      h('div', null, h(Fine_, { label: 'before', key: 'a' }), h(Fragile_, { key: 'b' }))
    );

    // The sibling is still there: this is the whole point.
    expect(container.querySelector('[data-testid="fine"]')?.textContent).toBe('before');
    expect(container.textContent).toContain('<Fragile> threw: this component is broken');
    expect(container.querySelector('.mdxstudio-vscode-component-error')).not.toBeNull();
  });

  it('is retried once the props change, rather than staying broken', () => {
    const Fragile_ = registry.components.Fragile;
    const { container, render } = mount(h(Fragile_, {}));

    expect(container.textContent).toContain('threw');

    render(h(Fragile_, { ok: true }));
    expect(container.querySelector('[data-testid="fragile"]')?.textContent).toBe('fixed');
  });

  it('guards an alias too, because the alias resolves to the guarded component', () => {
    const Wobbly = registry.components.Wobbly;
    const { container } = mount(h(Wobbly, {}));

    expect(container.textContent).toContain('threw');
  });
});

describe('a config component that works', () => {
  it('renders with its props, wrapped or not', () => {
    const Fine_ = registry.components.Fine;
    const { container } = mount(h(Fine_, { label: 'hello' }));

    expect(container.querySelector('[data-testid="fine"]')?.textContent).toBe('hello');
    // Wrapped, not the component the config handed over.
    expect(Fine_).not.toBe(Fine);
  });

  it('leaves the components the extension ships unwrapped', () => {
    // They are tested; a workspace's are being written. Wrapping them would put
    // a boundary between MdxRenderer and every diagram it draws.
    expect(registry.components.MermaidDiagram).toBe(previewRegistry.components.MermaidDiagram);
  });
});
