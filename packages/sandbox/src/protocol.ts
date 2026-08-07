/**
 * The wire protocol shared by the two halves of the sandbox.
 *
 * The host runs in the application. The guest runs inside an iframe with
 * `sandbox="allow-scripts"` and *without* `allow-same-origin`, so the two are
 * separated by a real origin boundary and can only exchange structured-cloneable
 * values over `postMessage`. This module is compiled into both bundles, so it
 * must stay free of React, of DOM globals at module scope, and of anything that
 * only exists on one side.
 */

/** Bumped when a message shape changes incompatibly. Both sides pin it. */
export const SANDBOX_PROTOCOL_VERSION = 1;

/**
 * Envelope discriminator. Every page shares one `message` event stream - dev
 * servers, extensions and other embeds all post into it - so an unrecognised
 * tag is the cheapest way to drop traffic that was never meant for us.
 */
export const SANDBOX_MESSAGE_TAG = 'mdxstudio-sandbox';

/**
 * The origin a sandboxed frame reports.
 *
 * Dropping `allow-same-origin` assigns the frame an opaque origin, which
 * serialises in `MessageEvent.origin` as the *string* `"null"` - not the value
 * `null`, and never the parent's own origin. So the host cannot compare against
 * `location.origin`, and must not fall back to accepting `"*"` (that would
 * accept messages from every frame and every opener on the page). It pins this
 * exact string instead, and pairs it with an identity check on `event.source`.
 */
export const OPAQUE_ORIGIN = 'null';

/**
 * The `targetOrigin` both sides must use when posting.
 *
 * An opaque origin cannot be *named*, so `postMessage` to the guest has to pass
 * `'*'`. That is not a broadcast: `iframe.contentWindow.postMessage` still
 * delivers to exactly that one frame. It only means "do not assert the
 * receiver's origin", which is unavoidable here. The guest compensates by
 * checking `event.source === window.parent` plus the channel secret.
 */
export const SANDBOX_TARGET_ORIGIN = '*';

/** Where an error was raised, so the host can present it usefully. */
export type SandboxErrorPhase =
  /** The guest runtime failed before it could accept a document. */
  | 'boot'
  /** The document failed to compile or render. */
  | 'render'
  /** An uncaught error or unhandled rejection from document code. */
  | 'runtime'
  /** A capability call failed on the host, or was refused. */
  | 'capability'
  /** A malformed or unauthorised message was received. */
  | 'protocol';

/** A structured-cloneable error. `Error` itself does not survive `postMessage`. */
export interface SandboxErrorPayload {
  name: string;
  message: string;
  stack?: string;
}

export type SandboxLogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error';

/* -------------------------------------------------------------------------- */
/* Guest -> host                                                              */
/* -------------------------------------------------------------------------- */

export type GuestMessage =
  /**
   * Handshake, step 1. The guest runtime has installed its listeners and is
   * ready to receive. Sent repeatedly on a short retry until the host answers,
   * because the host's own listener may attach after the frame has executed.
   */
  | { type: 'guest:ready' }
  /** Content box height changed. Drives host-side auto-sizing. */
  | { type: 'guest:height'; height: number }
  /** A render pass finished. `revision` echoes the `host:render` that caused it. */
  | { type: 'guest:rendered'; revision: number; height: number }
  /** Something failed inside the frame. Never silent. */
  | { type: 'guest:error'; phase: SandboxErrorPhase; error: SandboxErrorPayload }
  /** Fire-and-forget signal from the document to the host. No reply. */
  | { type: 'guest:event'; name: string; payload: unknown }
  /** The document asks the host to perform a registered operation. */
  | { type: 'guest:capability-request'; id: string; name: string; payload: unknown }
  /** Console output forwarded for debugging. Opt-in on the host. */
  | { type: 'guest:log'; level: SandboxLogLevel; args: string[] };

/* -------------------------------------------------------------------------- */
/* Host -> guest                                                              */
/* -------------------------------------------------------------------------- */

export type HostMessage =
  /**
   * Handshake, step 2. Acknowledges `guest:ready` and tells the document which
   * capability names exist, so it can degrade instead of calling into the void.
   */
  | {
      type: 'host:ready';
      capabilities: string[];
      capabilityTimeoutMs: number;
      maxPendingCapabilityCalls: number;
    }
  /** Deliver (or replace) the document to render. */
  | { type: 'host:render'; revision: number; content: string; props: Record<string, unknown> }
  /** Correlated reply to `guest:capability-request`. */
  | { type: 'host:capability-response'; id: string; ok: true; result: unknown }
  | { type: 'host:capability-response'; id: string; ok: false; error: SandboxErrorPayload }
  /** Push data into a running document. */
  | { type: 'host:event'; name: string; payload: unknown };

/** What actually travels on the wire. */
export type SandboxEnvelope<M> = M & {
  tag: typeof SANDBOX_MESSAGE_TAG;
  version: number;
  /**
   * Per-instance secret, generated by the host and embedded in the frame
   * document. Keeps two sandboxes on the same page from reading each other's
   * traffic, and is a second factor behind the `event.source` identity check.
   */
  channel: string;
};

export type GuestEnvelope = SandboxEnvelope<GuestMessage>;
export type HostEnvelope = SandboxEnvelope<HostMessage>;

/**
 * Validates the envelope of an incoming message.
 *
 * Deliberately does *not* validate the payload: callers narrow on `type` and
 * must treat every field as attacker-controlled anyway, since the guest is
 * running code we do not trust.
 */
export function isSandboxEnvelope<M>(data: unknown, channel: string): data is SandboxEnvelope<M> {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as Record<string, unknown>;
  return (
    message.tag === SANDBOX_MESSAGE_TAG &&
    message.version === SANDBOX_PROTOCOL_VERSION &&
    message.channel === channel &&
    typeof message.type === 'string'
  );
}

export function sealEnvelope<M>(channel: string, message: M): SandboxEnvelope<M> {
  return {
    ...message,
    tag: SANDBOX_MESSAGE_TAG,
    version: SANDBOX_PROTOCOL_VERSION,
    channel,
  };
}

/** Flattens anything thrown into a shape `postMessage` can clone. */
export function toErrorPayload(value: unknown): SandboxErrorPayload {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return { name: 'Error', message: typeof value === 'string' ? value : String(value) };
}

/** A high-entropy channel id. Falls back for non-secure contexts. */
export function createChannelId(): string {
  const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoRef?.getRandomValues) cryptoRef.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
