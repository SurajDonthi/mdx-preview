/**
 * The half that runs inside the frame.
 *
 * Everything here executes in a document with an opaque origin: no cookies, no
 * `localStorage`, no reference into the parent's DOM, and - under the frame's
 * CSP - no network at all. `window.parent` is the only reachable object outside
 * the frame, and `postMessage` is the only thing that can be done with it.
 */

import {
  OPAQUE_ORIGIN,
  SANDBOX_TARGET_ORIGIN,
  isSandboxEnvelope,
  sealEnvelope,
  toErrorPayload,
} from '../protocol';
import type {
  GuestMessage,
  HostMessage,
  SandboxEnvelope,
  SandboxErrorPhase,
  SandboxLogLevel,
} from '../protocol';

/** The surface a document sees. Handed to the render function and set on `window.sandbox`. */
export interface SandboxGuestApi {
  /**
   * Asks the host to perform a registered operation.
   *
   * Rejects if the name is not registered, if the host's handler throws, or if
   * no answer arrives before the host-configured timeout. This is the only path
   * out of the frame.
   */
  call<TResult = unknown>(name: string, payload?: unknown): Promise<TResult>;
  /** Fire-and-forget signal to the host. No reply, no acknowledgement. */
  emit(name: string, payload?: unknown): void;
  /** Subscribes to `host:event`. Returns an unsubscribe function. */
  on(name: string, listener: (payload: unknown) => void): () => void;
  /** Capability names the host currently offers, so a document can degrade gracefully. */
  readonly capabilities: readonly string[];
  /** Forces a height report. Rarely needed - resizes are observed automatically. */
  reportHeight(): void;
}

export interface GuestRenderArgs {
  /** The element to render into. Owned by the guest runtime. */
  container: HTMLElement;
  /** The document source. */
  content: string;
  /** Inert data from the host. */
  props: Record<string, unknown>;
  /** The capability bridge. */
  sandbox: SandboxGuestApi;
}

export interface StartGuestOptions {
  /**
   * Renders the document. Called once per `host:render`; returning a cleanup
   * function lets a renderer tear down before the next call (React roots do
   * their own reconciliation and generally do not need it).
   */
  render: (args: GuestRenderArgs) => void | (() => void) | Promise<void | (() => void)>;
  /** Root element id. Must match the one in the frame document. */
  rootId?: string;
}

interface GuestConfig {
  channel: string;
  forwardConsole: boolean;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
}

const READY_RETRY_MS = 50;
const READY_RETRY_LIMIT = 200; // 10s, matching the host's default handshake window.

function readConfig(): GuestConfig {
  const element = document.getElementById('mdxstudio-sandbox-config');
  if (!element?.textContent) throw new Error('Sandbox guest booted without a config block.');
  const parsed = JSON.parse(element.textContent) as Partial<GuestConfig>;
  if (typeof parsed.channel !== 'string' || parsed.channel.length === 0) {
    throw new Error('Sandbox guest config is missing a channel.');
  }
  return { channel: parsed.channel, forwardConsole: parsed.forwardConsole === true };
}

/** `postMessage` can only clone plain data, and log arguments are usually neither. */
function stringifyLogArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Boots the guest runtime: completes the handshake, installs the capability
 * bridge, reports height and errors, and calls `render` for each document.
 */
export function startGuest(options: StartGuestOptions): void {
  const config = readConfig();
  const { channel } = config;
  const parent = window.parent;

  const send = (message: GuestMessage): void => {
    // The parent's origin is knowable but naming it would require the host to
    // hand it in, and a wrong value silently breaks the bridge. Identity is
    // enforced on the host by `event.source`, which is not spoofable.
    parent.postMessage(sealEnvelope(channel, message), SANDBOX_TARGET_ORIGIN);
  };

  const reportError = (phase: SandboxErrorPhase, cause: unknown): void => {
    send({ type: 'guest:error', phase, error: toErrorPayload(cause) });
  };

  /* ---------------------------------------------------------------------- */
  /* Capability bridge                                                      */
  /* ---------------------------------------------------------------------- */

  const pending = new Map<string, PendingCall>();
  let callSeq = 0;
  let capabilityNames: string[] = [];
  let capabilityTimeoutMs = 10_000;
  let maxPendingCalls = 32;

  const call = <TResult>(name: string, payload?: unknown): Promise<TResult> => {
    if (typeof name !== 'string' || name.length === 0) {
      return Promise.reject(new TypeError('sandbox.call(name) requires a capability name.'));
    }
    if (pending.size >= maxPendingCalls) {
      return Promise.reject(
        new Error(`Too many capability calls in flight (limit ${maxPendingCalls}).`)
      );
    }

    callSeq += 1;
    const id = `${channel}:${callSeq}`;

    return new Promise<TResult>((resolve, reject) => {
      // The document's promise must not be able to hang forever: the host may
      // never answer, and an un-settleable promise inside a document is
      // indistinguishable from a hang for its author.
      const timer = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Capability "${name}" timed out after ${capabilityTimeoutMs}ms.`));
      }, capabilityTimeoutMs);

      pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      try {
        send({ type: 'guest:capability-request', id, name, payload });
      } catch (cause) {
        // Typically a DataCloneError: the payload contained something that
        // cannot cross the boundary (a function, a DOM node, a proxy).
        window.clearTimeout(timer);
        pending.delete(id);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  };

  type CapabilityResponse = Extract<HostMessage, { type: 'host:capability-response' }>;

  const settle = (message: CapabilityResponse): void => {
    const entry = pending.get(message.id);
    if (!entry) return; // Late answer to a call that already timed out.
    pending.delete(message.id);
    window.clearTimeout(entry.timer);

    if (message.ok === true) {
      entry.resolve(message.result);
      return;
    }

    const failure = (message as Extract<CapabilityResponse, { ok: false }>).error;
    const error = new Error(failure?.message ?? 'Capability call failed.');
    error.name = failure?.name ?? 'SandboxCapabilityError';
    entry.reject(error);
  };

  /* ---------------------------------------------------------------------- */
  /* Host events                                                            */
  /* ---------------------------------------------------------------------- */

  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const on = (name: string, listener: (payload: unknown) => void): (() => void) => {
    const set = listeners.get(name) ?? new Set();
    set.add(listener);
    listeners.set(name, set);
    return () => {
      set.delete(listener);
    };
  };

  /* ---------------------------------------------------------------------- */
  /* Height reporting                                                       */
  /* ---------------------------------------------------------------------- */

  let lastHeight = -1;
  let heightFrame = 0;

  const measure = (): number => {
    const root = document.getElementById(options.rootId ?? 'mdxstudio-sandbox-root');
    if (!root) return document.documentElement.scrollHeight;
    // Measure the content, never the viewport. `documentElement.scrollHeight`
    // is floored by the frame's own height, so using it makes the frame able to
    // grow but never to shrink - it would just latch at its high-water mark.
    // `rect.bottom` is the content's distance from the top of the document
    // (the frame never scrolls: the stylesheet sets `overflow: hidden`).
    const rect = root.getBoundingClientRect();
    return Math.max(rect.bottom, root.scrollHeight + rect.top);
  };

  const reportHeight = (): void => {
    const height = Math.ceil(measure());
    if (height === lastHeight) return;
    lastHeight = height;
    send({ type: 'guest:height', height });
  };

  const scheduleHeightReport = (): void => {
    // Coalesce: a mounting React tree fires dozens of mutations per frame.
    if (heightFrame) return;
    heightFrame = window.requestAnimationFrame(() => {
      heightFrame = 0;
      reportHeight();
    });
  };

  const sandbox: SandboxGuestApi = {
    call,
    emit: (name, payload) => {
      if (typeof name !== 'string') return;
      try {
        send({ type: 'guest:event', name, payload });
      } catch (cause) {
        reportError('runtime', cause);
      }
    },
    on,
    get capabilities() {
      return capabilityNames;
    },
    reportHeight,
  };

  /* ---------------------------------------------------------------------- */
  /* Rendering                                                              */
  /* ---------------------------------------------------------------------- */

  const rootId = options.rootId ?? 'mdxstudio-sandbox-root';
  let cleanup: (() => void) | void;
  let renderChain: Promise<void> = Promise.resolve();

  const renderDocument = (message: Extract<HostMessage, { type: 'host:render' }>): void => {
    // Serialised so two renders in flight cannot interleave into one container.
    renderChain = renderChain.then(async () => {
      const container = document.getElementById(rootId);
      if (!container) {
        reportError('render', new Error(`Sandbox root "#${rootId}" is missing.`));
        return;
      }
      try {
        if (typeof cleanup === 'function') cleanup();
        cleanup = await options.render({
          container,
          content: typeof message.content === 'string' ? message.content : '',
          props:
            message.props && typeof message.props === 'object'
              ? (message.props as Record<string, unknown>)
              : {},
          sandbox,
        });
        // One immediate report, because a ResizeObserver's first callback can
        // land a frame later and the host would show a collapsed frame until then.
        lastHeight = -1;
        const height = Math.ceil(measure());
        lastHeight = height;
        send({ type: 'guest:rendered', revision: message.revision, height });
      } catch (cause) {
        reportError('render', cause);
      }
    });
  };

  /* ---------------------------------------------------------------------- */
  /* Inbound messages                                                       */
  /* ---------------------------------------------------------------------- */

  let acknowledged = false;

  window.addEventListener('message', (event: MessageEvent) => {
    // The parent is the only party allowed to talk to this frame. `event.origin`
    // is the app's real origin here, but hard-coding it would need the host to
    // pass it in and would break on any redirect; the source identity check is
    // both stricter and cheaper. `OPAQUE_ORIGIN` is rejected explicitly so a
    // sibling sandboxed frame cannot impersonate the host.
    if (event.source !== parent) return;
    if (event.origin === OPAQUE_ORIGIN) return;
    if (!isSandboxEnvelope<HostMessage>(event.data, channel)) return;

    const message = event.data as SandboxEnvelope<HostMessage>;

    switch (message.type) {
      case 'host:ready': {
        acknowledged = true;
        capabilityNames = Array.isArray(message.capabilities)
          ? message.capabilities.filter((name): name is string => typeof name === 'string')
          : [];
        if (Number.isFinite(message.capabilityTimeoutMs)) {
          capabilityTimeoutMs = message.capabilityTimeoutMs;
        }
        if (Number.isFinite(message.maxPendingCapabilityCalls)) {
          maxPendingCalls = message.maxPendingCapabilityCalls;
        }
        break;
      }
      case 'host:render':
        renderDocument(message);
        break;
      case 'host:capability-response':
        settle(message);
        break;
      case 'host:event': {
        const set = listeners.get(message.name);
        if (!set) break;
        for (const listener of set) {
          try {
            listener(message.payload);
          } catch (cause) {
            reportError('runtime', cause);
          }
        }
        break;
      }
      default:
        break;
    }
  });

  /* ---------------------------------------------------------------------- */
  /* Diagnostics                                                            */
  /* ---------------------------------------------------------------------- */

  window.addEventListener('error', (event) => {
    reportError('runtime', event.error ?? new Error(event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError('runtime', event.reason);
  });

  if (config.forwardConsole) {
    const levels: SandboxLogLevel[] = ['debug', 'log', 'info', 'warn', 'error'];
    for (const level of levels) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        original(...args);
        try {
          send({ type: 'guest:log', level, args: args.map(stringifyLogArg) });
        } catch {
          /* Logging must never break the document. */
        }
      };
    }
  }

  const observer = new ResizeObserver(scheduleHeightReport);
  observer.observe(document.documentElement);
  const rootElement = document.getElementById(rootId);
  if (rootElement) observer.observe(rootElement);
  new MutationObserver(scheduleHeightReport).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  /* ---------------------------------------------------------------------- */
  /* Handshake                                                              */
  /* ---------------------------------------------------------------------- */

  // The frame's script runs while the parent is still committing the React tree
  // that created it, so the host's listener may not exist yet. Retry until
  // acknowledged rather than racing once and hanging.
  let attempts = 0;
  send({ type: 'guest:ready' });
  const retry = window.setInterval(() => {
    attempts += 1;
    if (acknowledged || attempts > READY_RETRY_LIMIT) {
      window.clearInterval(retry);
      return;
    }
    send({ type: 'guest:ready' });
  }, READY_RETRY_MS);

  // Documents are compiled and evaluated in this frame's global scope, so a
  // plain global is the ergonomic surface: `await sandbox.call('submitLead', ...)`
  // works from MDX without the renderer knowing the sandbox exists.
  (window as unknown as Record<string, unknown>).sandbox = sandbox;
}
