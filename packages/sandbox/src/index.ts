/**
 * `@mdxkit/sandbox` - render MDX you did not write.
 *
 * The unsandboxed renderer executes a document's JavaScript in the page, with
 * the page's origin. That is fine for a document the user authored and fatal for
 * one an LLM generated or a stranger pasted: it can read `localStorage`, lift
 * the session token and call the app's API as the user.
 *
 * The fix here is isolation rather than restriction. The document keeps every
 * capability it had - state, event handlers, inputs, arbitrary components - but
 * runs inside an iframe with an opaque origin and no network, and reaches the
 * application only through operations the host explicitly registered.
 *
 * The host half is exported here. The guest half lives at `@mdxkit/sandbox/guest`
 * and is bundled separately (see `@mdxkit/sandbox/vite`).
 */

export { SandboxedMdx } from './host/SandboxedMdx';
export type { SandboxedMdxProps } from './host/SandboxedMdx';

export {
  buildSandboxFrameDocument,
  defaultSandboxCsp,
  SANDBOX_ATTRIBUTE,
} from './host/frameDocument';
export type { SandboxCsp, SandboxFrameDocumentOptions } from './host/frameDocument';

export type {
  SandboxCapabilities,
  SandboxCapability,
  SandboxCapabilityContext,
  SandboxError,
  SandboxLogEntry,
} from './host/types';

export {
  OPAQUE_ORIGIN,
  SANDBOX_MESSAGE_TAG,
  SANDBOX_PROTOCOL_VERSION,
  SANDBOX_TARGET_ORIGIN,
} from './protocol';
export type {
  GuestMessage,
  HostMessage,
  SandboxEnvelope,
  SandboxErrorPayload,
  SandboxErrorPhase,
  SandboxLogLevel,
} from './protocol';
