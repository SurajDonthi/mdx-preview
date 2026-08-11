/**
 * The one-call way to put an untrusted document on a page.
 *
 * `SandboxedMdx` is the same bridge with a React component around it. This entry
 * exists because the two hosts that most need the isolation do not have a React
 * tree to hang it from: the CLI's `--host` mode serves a plain page onto the LAN,
 * and a VS Code webview for an untrusted workspace is a bare document. Forcing
 * either to mount React purely to create an iframe would mean shipping a second
 * copy of React on the host side, next to the one already inside the guest
 * bundle - so this half is plain DOM and has no framework dependency at all.
 *
 * What it does *not* do is relax anything. The frame is created with the same
 * `sandbox="allow-scripts"` attribute and no `allow-same-origin`, the same
 * default CSP, the same per-instance channel secret, and the same three-factor
 * check on every inbound message.
 */

import type { MdxExpressionMode, ThemeId } from '@mdxstudio/core';

import { SANDBOX_TARGET_ORIGIN, createChannelId, sealEnvelope, toErrorPayload } from '../protocol';
import type { GuestMessage, HostMessage, SandboxEnvelope } from '../protocol';
import { SANDBOX_ATTRIBUTE, buildSandboxFrameDocument } from './frameDocument';
import type { SandboxCsp } from './frameDocument';
import { isTrustedGuestMessage } from './trust';
import type { SandboxCapabilities, SandboxError, SandboxLogEntry } from './types';

export interface MountSandboxedDocumentOptions {
  /** The document source. Assumed hostile. */
  source: string;
  /**
   * The guest runtime, already bundled to a standalone script.
   *
   * It has to arrive as a string because the frame has no origin it could fetch
   * from. Build it with the `mdxstudioSandboxGuest()` Vite plugin, or with
   * `bundleGuest()` from a Node script.
   *
   * This is also where components come from. There is deliberately no
   * `components` option here: a React component is a function, `postMessage`
   * only carries structured-cloneable values, and the only ways to give the
   * frame a host function are to run it in the host or to hand the frame the
   * host's origin. Both give up the isolation this package exists for, so the
   * component registry is baked into the guest bundle instead - see
   * `startMdxGuest({ registry })`.
   */
  guestScript: string;
  /** Theme the guest renders with. Forwarded as an inert prop. */
  theme?: ThemeId;
  /**
   * How much of an MDX `{...}` expression the guest evaluates.
   *
   * `'full'` is the renderer's own default and needs the `unsafe-eval` that
   * `defaultSandboxCsp` already grants and explains. `'literals'` narrows the
   * document to values its syntax spells out. Neither value changes the CSP:
   * the frame has an opaque origin and `connect-src 'none'` either way.
   */
  expressions?: MdxExpressionMode;
  /**
   * CSS injected into the frame; the frame cannot load a stylesheet itself.
   *
   * Import the component packages' stylesheets as raw text and concatenate them
   * here, or the document renders unstyled.
   */
  styles?: string;
  /** Extra inert data for the document, merged under `theme` and `expressions`. */
  props?: Record<string, unknown>;
  /**
   * Operations the document may ask the host to perform. Everything else is
   * refused. Fixed for the life of the mount.
   */
  capabilities?: SandboxCapabilities;
  /** Overrides for the frame's Content-Security-Policy. Widen with care. */
  csp?: Partial<SandboxCsp>;

  /** The handshake completed and the first document was delivered. */
  onReady?: () => void;
  /**
   * Every failure the guest reports, plus bridge-level ones.
   *
   * The frame has an opaque origin, so nothing thrown inside it reaches the
   * host's `window.onerror`. Without this callback a broken document fails
   * silently and looks like a blank box.
   */
  onError?: (error: SandboxError) => void;
  /** Fired for `sandbox.emit(name, payload)` from inside the document. */
  onEvent?: (name: string, payload: unknown) => void;
  /** Console output from inside the frame. Requires `forwardConsole`. */
  onLog?: (entry: SandboxLogEntry) => void;
  /** The guest reported new content height. */
  onHeightChange?: (height: number) => void;

  /** Mirror the guest's `console` into {@link onLog}. Off by default. */
  forwardConsole?: boolean;
  /** Size the iframe to reported content height. Default `true`. */
  autoResize?: boolean;
  /** Floor for the auto-sized height, in px. Default `120`. */
  minHeight?: number;
  /** How long a capability call may stay outstanding. Default `10_000`. */
  capabilityTimeoutMs?: number;
  /** How long to wait for the guest's handshake before reporting a boot failure. Default `10_000`. */
  handshakeTimeoutMs?: number;
  /** Ceiling on concurrent capability calls. Default `32`. */
  maxPendingCapabilityCalls?: number;

  /** Accessible name for the frame. Default `'Sandboxed document'`. */
  title?: string;
  /** Class applied to the frame element. */
  className?: string;
}

export interface SandboxedDocumentHandle {
  /** The frame element, so a caller can style or measure it. Do not re-parent it. */
  readonly frame: HTMLIFrameElement;
  /** This instance's channel secret. Useful to tell several mounts apart in logs. */
  readonly channel: string;
  /** Replaces the document without reloading the frame, so its state survives. */
  update(source: string): void;
  /** Re-renders the current document under a different theme. */
  setTheme(theme: ThemeId): void;
  /** Replaces the inert props. `theme` and `expressions` still win over them. */
  setProps(props: Record<string, unknown>): void;
  /** Pushes data into the running document, where `sandbox.on(name, ...)` receives it. */
  emit(name: string, payload?: unknown): void;
  /** Removes the frame and every listener this mount added. Safe to call twice. */
  dispose(): void;
}

const DEFAULT_CAPABILITY_TIMEOUT_MS = 10_000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PENDING_CALLS = 32;
const DEFAULT_MIN_HEIGHT = 120;

/**
 * Mounts an untrusted document into `container` and returns a handle to it.
 *
 * The frame is appended, not swapped in, so a container may hold other content;
 * `dispose()` removes exactly the frame this call created.
 *
 * ```ts
 * const doc = mountSandboxedDocument(document.getElementById('preview')!, {
 *   source,
 *   guestScript,
 *   theme: 'github-light',
 *   onError: (error) => console.warn('sandbox:', error.phase, error.message),
 * });
 *
 * watcher.on('change', (next) => doc.update(next));
 * window.addEventListener('beforeunload', () => doc.dispose());
 * ```
 */
export function mountSandboxedDocument(
  container: HTMLElement,
  options: MountSandboxedDocumentOptions
): SandboxedDocumentHandle {
  if (!container || typeof container.appendChild !== 'function') {
    throw new TypeError('mountSandboxedDocument(container) requires a DOM element.');
  }
  if (typeof options?.guestScript !== 'string' || options.guestScript.length === 0) {
    throw new TypeError(
      'mountSandboxedDocument() requires guestScript: the frame has no origin to fetch a runtime from.'
    );
  }

  const {
    capabilities,
    capabilityTimeoutMs = DEFAULT_CAPABILITY_TIMEOUT_MS,
    handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
    maxPendingCapabilityCalls = DEFAULT_MAX_PENDING_CALLS,
    minHeight = DEFAULT_MIN_HEIGHT,
    autoResize = true,
    forwardConsole = false,
    title = 'Sandboxed document',
  } = options;

  // One channel secret per mount, so two sandboxes on the same page cannot read
  // each other's traffic even though both see every message event.
  const channel = createChannelId();

  let source = options.source ?? '';
  let theme = options.theme;
  let expressions = options.expressions;
  let baseProps = { ...(options.props ?? {}) };

  let disposed = false;
  let ready = false;
  let revision = 0;
  let pendingCalls = 0;
  let lastHeight = -1;

  const frame = document.createElement('iframe');
  frame.title = title;
  // Never add `allow-same-origin`. With `allow-scripts` it would give the frame
  // the app's origin - and the ability to strip this attribute itself. Set
  // before `srcdoc`, because the attribute is read when the document loads.
  frame.setAttribute('sandbox', SANDBOX_ATTRIBUTE);
  frame.setAttribute('referrerpolicy', 'no-referrer');
  if (options.className) frame.className = options.className;
  frame.style.display = 'block';
  frame.style.width = '100%';
  frame.style.border = 'none';
  if (autoResize) frame.style.height = `${minHeight}px`;
  frame.srcdoc = buildSandboxFrameDocument({
    channel,
    guestScript: options.guestScript,
    styles: options.styles,
    csp: options.csp,
    forwardConsole,
  });

  const report = (error: SandboxError): void => {
    options.onError?.(error);
  };

  const post = (message: HostMessage): void => {
    if (disposed) return;
    const target = frame.contentWindow;
    if (!target) return;
    // '*' is forced by the opaque origin - see SANDBOX_TARGET_ORIGIN. It targets
    // this one frame, not every listener on the page.
    target.postMessage(sealEnvelope(channel, message), SANDBOX_TARGET_ORIGIN);
  };

  /** `theme` and `expressions` are named options, so they win over raw props. */
  const renderProps = (): Record<string, unknown> => {
    const merged: Record<string, unknown> = { ...baseProps };
    if (theme !== undefined) merged.theme = theme;
    if (expressions !== undefined) merged.expressions = expressions;
    return merged;
  };

  const sendDocument = (): void => {
    revision += 1;
    post({ type: 'host:render', revision, content: source, props: renderProps() });
  };

  const runCapability = async (id: string, name: string, payload: unknown): Promise<void> => {
    // `hasOwn` and not `name in table`: without it the document could call
    // `constructor` or `toString` and reach functions off the prototype chain
    // that the host never meant to expose.
    const handler =
      capabilities && Object.prototype.hasOwnProperty.call(capabilities, name)
        ? capabilities[name]
        : undefined;

    if (typeof handler !== 'function') {
      const error = {
        name: 'SandboxCapabilityError',
        message: `Capability "${String(name)}" is not registered.`,
      };
      report({ ...error, phase: 'capability' });
      post({ type: 'host:capability-response', id, ok: false, error });
      return;
    }

    if (pendingCalls >= maxPendingCapabilityCalls) {
      const error = {
        name: 'SandboxCapabilityError',
        message: `Too many capability calls in flight (limit ${maxPendingCapabilityCalls}).`,
      };
      report({ ...error, phase: 'capability' });
      post({ type: 'host:capability-response', id, ok: false, error });
      return;
    }

    pendingCalls += 1;
    try {
      const result = await handler(payload, { name, channel });
      post({ type: 'host:capability-response', id, ok: true, result });
    } catch (cause) {
      const error = toErrorPayload(cause);
      report({ ...error, phase: 'capability' });
      // The stack is the host's, not the document's business.
      post({
        type: 'host:capability-response',
        id,
        ok: false,
        error: { name: error.name, message: error.message },
      });
    } finally {
      pendingCalls -= 1;
    }
  };

  const onMessage = (event: MessageEvent): void => {
    if (disposed) return;
    if (!isTrustedGuestMessage(event, frame, channel)) return;

    const message = event.data as SandboxEnvelope<GuestMessage>;

    switch (message.type) {
      case 'guest:ready': {
        // Idempotent: the guest retries until acknowledged, because it may have
        // booted before this listener existed.
        post({
          type: 'host:ready',
          capabilities: Object.keys(capabilities ?? {}),
          capabilityTimeoutMs,
          maxPendingCapabilityCalls,
        });
        sendDocument();
        if (!ready) {
          ready = true;
          options.onReady?.();
        }
        break;
      }
      case 'guest:height':
      case 'guest:rendered': {
        const reported = Number(message.height);
        if (!Number.isFinite(reported)) break;
        const next = Math.max(minHeight, Math.ceil(reported));
        if (next === lastHeight) break;
        lastHeight = next;
        if (autoResize) frame.style.height = `${next}px`;
        options.onHeightChange?.(next);
        break;
      }
      case 'guest:error': {
        const raw = (message.error ?? {}) as Partial<SandboxError>;
        report({
          phase: message.phase ?? 'runtime',
          name: typeof raw.name === 'string' ? raw.name : 'Error',
          message: typeof raw.message === 'string' ? raw.message : 'Unknown guest error.',
          stack: typeof raw.stack === 'string' ? raw.stack : undefined,
        });
        break;
      }
      case 'guest:event': {
        if (typeof message.name === 'string') options.onEvent?.(message.name, message.payload);
        break;
      }
      case 'guest:capability-request': {
        if (typeof message.id !== 'string' || typeof message.name !== 'string') {
          report({
            phase: 'protocol',
            name: 'SandboxProtocolError',
            message: 'Malformed capability request.',
          });
          break;
        }
        void runCapability(message.id, message.name, message.payload);
        break;
      }
      case 'guest:log': {
        options.onLog?.({ level: message.level, args: message.args });
        break;
      }
      default:
        break;
    }
  };

  window.addEventListener('message', onMessage);

  // A guest that never boots - a syntax error in the bundle, a CSP the host
  // narrowed too far - is otherwise indistinguishable from a slow one, and its
  // failure cannot reach the host's error handlers through the opaque origin.
  const handshakeTimer = window.setTimeout(() => {
    if (ready || disposed) return;
    report({
      phase: 'boot',
      name: 'SandboxHandshakeError',
      message: `The sandboxed frame did not complete its handshake within ${handshakeTimeoutMs}ms.`,
    });
  }, handshakeTimeoutMs);

  container.appendChild(frame);

  return {
    frame,
    channel,

    update(nextSource: string): void {
      if (disposed || typeof nextSource !== 'string' || nextSource === source) return;
      source = nextSource;
      // Before the handshake there is nobody to send to; `guest:ready` picks up
      // whatever is current at that point.
      if (ready) sendDocument();
    },

    setTheme(nextTheme: ThemeId): void {
      if (disposed || nextTheme === theme) return;
      theme = nextTheme;
      if (ready) sendDocument();
    },

    setProps(nextProps: Record<string, unknown>): void {
      if (disposed) return;
      baseProps = { ...(nextProps ?? {}) };
      if (ready) sendDocument();
    },

    emit(name: string, payload?: unknown): void {
      if (disposed || typeof name !== 'string' || !ready) return;
      post({ type: 'host:event', name, payload });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(handshakeTimer);
      frame.remove();
    },
  };
}
