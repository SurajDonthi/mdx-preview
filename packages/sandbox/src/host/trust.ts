/**
 * Which senders a host believes.
 *
 * Every host-side listener runs on the page's single `message` stream, which
 * carries traffic from dev servers, extensions, other embeds and every other
 * sandboxed frame on the page. Getting this predicate wrong is the whole attack
 * surface, so it lives in one place and both hosts - the React component and the
 * imperative mount - call it rather than restating the rules.
 */

import { OPAQUE_ORIGIN, isSandboxEnvelope } from '../protocol';
import type { GuestMessage, SandboxEnvelope } from '../protocol';

export function isTrustedGuestMessage(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
  channel: string
): event is MessageEvent & { data: SandboxEnvelope<GuestMessage> } {
  // Identity first: only the window we created may talk to us. This is the
  // check that actually holds - `origin` is "null" for every sandboxed frame on
  // the page, so it cannot distinguish ours from anyone else's.
  if (!frame || event.source !== frame.contentWindow) return false;
  // Belt and braces: a same-origin frame reaching this listener would mean the
  // sandbox attribute was lost, which should fail loudly rather than be trusted.
  if (event.origin !== OPAQUE_ORIGIN) return false;
  // The channel secret is the third factor, and the one that keeps two
  // sandboxes on the same page from reading each other's traffic.
  return isSandboxEnvelope<GuestMessage>(event.data, channel);
}
