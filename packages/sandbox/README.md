# @mdxkit/sandbox

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
npm install @mdxkit/sandbox @mdxkit/react @mdxkit/core react react-dom
```

| Peer            | Range     | Why                                                     |
| --------------- | --------- | ------------------------------------------------------- |
| `react`         | `^19.0.0` | Host component.                                          |
| `react-dom`     | `^19.0.0` | The guest mounts its own root inside the frame.          |
| `@mdxkit/core`  | `^0.1.0`  | Registry and render context.                             |
| `@mdxkit/react` | `^0.1.0`  | The default guest renders with `MdxRenderer`.            |

No stylesheet of its own — see [Styling the frame](#styling-the-frame).

## How it fits together

Two halves, two bundles. The frame has no origin to fetch from, so the guest
runtime has to arrive as **source text** and be inlined into the frame document.

1. A guest entry module, bundled to a standalone script.
2. `<SandboxedMdx guestScript={...}>` in your app, which builds the frame.

### 1. The guest entry

```tsx
// src/sandbox-guest.tsx
import { startMdxGuest } from '@mdxkit/sandbox/guest/mdx';
import { createRendererRegistry } from '@mdxkit/react';
import { mermaidPlugin } from '@mdxkit/mermaid';

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
import { mdxkitSandboxGuest } from '@mdxkit/sandbox/vite';

export default defineConfig({
  plugins: [react(), mdxkitSandboxGuest({ entry: './src/sandbox-guest.tsx' })],
});
```

Outside Vite, call `bundleGuest()` from `@mdxkit/sandbox/build` in a Node script
and write the result wherever your app can import it as a string. Both paths need
`esbuild`, which ships as a dependency of this package.

### 3. Render

```tsx
import { SandboxedMdx } from '@mdxkit/sandbox';
import guestScript from 'virtual:mdxkit-sandbox-guest';

import mdxkitCss from '@mdxkit/react/styles.css?raw';
import mermaidCss from '@mdxkit/mermaid/styles.css?raw';

export function UntrustedDocument({ source }: { source: string }) {
  return (
    <SandboxedMdx
      content={source}
      guestScript={guestScript}
      styles={mdxkitCss + mermaidCss}
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

### Styling the frame

The frame cannot load a stylesheet: it has no origin and no network. Pass the CSS
as text through `styles`. In Vite, `?raw` does that; with webpack, use
`asset/source`. Skip it and the document renders unstyled.

## Entry points

| Import                       | Runtime | Contents                                              |
| ---------------------------- | ------- | ----------------------------------------------------- |
| `@mdxkit/sandbox`            | browser | `SandboxedMdx`, `buildSandboxFrameDocument`, CSP types |
| `@mdxkit/sandbox/guest`      | browser | `startGuest` — build a renderer other than MdxRenderer |
| `@mdxkit/sandbox/guest/mdx`  | browser | `startMdxGuest` — the default MdxRenderer guest        |
| `@mdxkit/sandbox/protocol`   | shared  | Wire types and envelope helpers                        |
| `@mdxkit/sandbox/vite`       | node    | `mdxkitSandboxGuest()` Vite plugin                     |
| `@mdxkit/sandbox/build`      | node    | `bundleGuest()`                                        |

ESM only, with TypeScript declarations.

## License

MIT
