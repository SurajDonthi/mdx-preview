import type { SandboxErrorPayload, SandboxErrorPhase, SandboxLogLevel } from '../protocol';

/**
 * A single operation the host is willing to perform on the document's behalf.
 *
 * This is the whole security model. The guest has no network, no storage and no
 * handle on the parent; the only thing it can do to the outside world is name
 * one of these and wait. So the set of capabilities passed here *is* the
 * document's permission set, and each handler is a trust boundary: treat
 * `payload` as hostile input, authorise inside the handler, and return only what
 * the document is allowed to see.
 */
export type SandboxCapability<TPayload = any, TResult = unknown> = (
  payload: TPayload,
  context: SandboxCapabilityContext
) => TResult | Promise<TResult>;

export interface SandboxCapabilityContext {
  /** The name the document called. Handy when one function backs several names. */
  name: string;
  /** The sandbox instance that called, so a host with several frames can tell them apart. */
  channel: string;
}

/**
 * The registry handed to `<SandboxedMdx capabilities={...} />`.
 *
 * Only own, enumerable, function-valued keys are callable; inherited names such
 * as `constructor` or `toString` are rejected like any other unknown name.
 */
export type SandboxCapabilities = Record<string, SandboxCapability>;

/** An error observed by the host, whether it originated in the guest or the bridge. */
export interface SandboxError extends SandboxErrorPayload {
  phase: SandboxErrorPhase;
}

export interface SandboxLogEntry {
  level: SandboxLogLevel;
  args: string[];
}
