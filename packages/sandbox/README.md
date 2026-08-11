# @mdxstudio/sandbox

Renders MDX you did not write.

`MdxRenderer` executes a document's JavaScript in your page, with your origin.
That is fine for a document the user authored and fatal for one an LLM generated
or a stranger pasted: it can read `localStorage`, lift the session token and call
your API as the user.

The fix here is isolation, not restriction. The document keeps every capability it
had — state, event handlers, inputs, arbitrary components — but runs inside an
iframe with an opaque origin (`sandbox="allow-scripts"`, no `allow-same-origin`)
and a CSP with `connect-src 'none'`. It reaches your application only through
operations you explicitly register.

## Install

```sh
npm install @mdxstudio/sandbox @mdxstudio/react @mdxstudio/core react react-dom
```

| Peer            | Range     | Why                                                     |
| --------------- | --------- | ------------------------------------------------------- |
| `react`         | `^19.0.0` | Host component.                                          |
| `react-dom`     | `^19.0.0` | The guest mounts its own root inside the frame.          |
| `@mdxstudio/core`  | `^0.1.0`  | Registry and render context.                             |
| `@mdxstudio/react` | `^0.1.0`  | The default guest renders with `MdxRenderer`.            |

No stylesheet of its own — see [Styling the frame](#styling-the-frame).

## How it fits together

Two halves, two bundles. The frame has no origin to fetch from, so the guest
runtime has to arrive as **source text** and be inlined into the frame document.

1. A guest entry module, bundled to a standalone script.
2. `<SandboxedMdx guestScript={...}>` in your app, which builds the frame.

### 1. The guest entry

```tsx
// src/sandbox-guest.tsx
import { startMdxGuest } from '@mdxstudio/sandbox/guest/mdx';
import { createRendererRegistry } from '@mdxstudio/react';
import { mermaidPlugin } from '@mdxstudio/mermaid';

startMdxGuest({
  registry: createRendererRegistry(mermaidPlugin),
  defaultTheme: 'github-light',
});
```

### 2. Bundle it

With Vite, the bundled script is exposed as a virtual module:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mdxstudioSandboxGuest } from '@mdxstudio/sandbox/vite';

export default defineConfig({
  plugins: [react(), mdxstudioSandboxGuest({ entry: './src/sandbox-guest.tsx' })],
});
```

Outside Vite, call `bundleGuest()` from `@mdxstudio/sandbox/build` in a Node script
and write the result wherever your app can import it as a string. Both paths need
`esbuild`, which ships as a dependency of this package.

### 3. Render

```tsx
import { SandboxedMdx } from '@mdxstudio/sandbox';
import guestScript from 'virtual:mdxstudio-sandbox-guest';

import mdxstudioCss from '@mdxstudio/react/styles.css?raw';
import mermaidCss from '@mdxstudio/mermaid/styles.css?raw';

export function UntrustedDocument({ source }: { source: string }) {
  return (
    <SandboxedMdx
      content={source}
      guestScript={guestScript}
      styles={mdxstudioCss + mermaidCss}
      props={{ theme: 'github-light' }}
      capabilities={{
        // This object *is* the document's permission set. Every handler is a
        // trust boundary: treat `payload` as hostile, authorise here, and
        // return only what the document is allowed to see.
        async submitLead(payload: { email?: unknown }) {
          if (typeof payload?.email !== 'string') throw new Error('email required');
          const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: payload.email }),
          });
          return { ok: res.ok };
        },
      }}
      onError={(error) => console.warn('sandbox:', error.phase, error.message)}
    />
  );
}
```

Inside the document, `sandbox` is a global:

```mdx
<Button onClick={() => sandbox.call('submitLead', { email: 'ada@example.com' })}>
  Request access
</Button>
```

Anything not registered is refused. `sandbox.call()` rejects on an unknown name,
a throwing handler, or a timeout — a document can never leave a promise hanging.

### Without React: `mountSandboxedDocument`

A host that has no React tree to hang the component from — a CLI serving a folder
onto the LAN, a VS Code webview for an untrusted workspace — gets the same bridge
as one call. It is plain DOM, so the host page does not need React at all; React
is already inside the guest bundle.

```ts
import { mountSandboxedDocument } from '@mdxstudio/sandbox';

const doc = mountSandboxedDocument(document.getElementById('preview')!, {
  source,
  guestScript,
  styles: mdxstudioCss,
  theme: 'github-light',
  onReady: () => console.info('sandbox ready'),
  // The frame has an opaque origin, so nothing thrown inside it reaches
  // window.onerror. Without this a broken document is just a blank box.
  onError: (error) => console.warn('sandbox:', error.phase, error.message),
});

watcher.on('change', (next) => doc.update(next)); // no reload: state survives
themeToggle.addEventListener('click', () => doc.setTheme('github-dark'));
window.addEventListener('beforeunload', () => doc.dispose());
```

The handle also carries `setProps()`, `emit()` (which `sandbox.on(name, …)`
receives inside the document), and the `frame` element itself. `dispose()`
removes the frame and every listener the mount added, and is safe to call twice.
If the guest never completes its handshake — a syntax error in the bundle, a CSP
narrowed too far — `onError` reports a `SandboxHandshakeError` rather than the
mount hanging silently.

The frame is appended to the container rather than replacing its contents, and
every option is the same as the component's, including `capabilities`, `csp` and
`expressions`.

There is deliberately **no `components` option**. A React component is a
function, `postMessage` only carries structured-cloneable values, and the only
ways to give the frame a host function are to run it in the host or to hand the
frame the host's origin — both give up the isolation this package exists for.
Components are baked into the guest bundle instead, via
`startMdxGuest({ registry })`.

### Styling the frame

The frame cannot load a stylesheet: it has no origin and no network. Pass the CSS
as text through `styles`. In Vite, `?raw` does that; with webpack, use
`asset/source`. Skip it and the document renders unstyled.

## Entry points

| Import                       | Runtime | Contents                                              |
| ---------------------------- | ------- | ----------------------------------------------------- |
| `@mdxstudio/sandbox`            | browser | `SandboxedMdx`, `mountSandboxedDocument`, `buildSandboxFrameDocument`, CSP types |
| `@mdxstudio/sandbox/guest`      | browser | `startGuest` — build a renderer other than MdxRenderer |
| `@mdxstudio/sandbox/guest/mdx`  | browser | `startMdxGuest` — the default MdxRenderer guest        |
| `@mdxstudio/sandbox/protocol`   | shared  | Wire types and envelope helpers                        |
| `@mdxstudio/sandbox/vite`       | node    | `mdxstudioSandboxGuest()` Vite plugin                     |
| `@mdxstudio/sandbox/build`      | node    | `bundleGuest()`                                        |

ESM only, with TypeScript declarations.

## License

MIT
