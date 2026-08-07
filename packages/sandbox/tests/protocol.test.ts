/**
 * The envelope, which is the whole of the sandbox's message-level access
 * control.
 *
 * Every page shares one `message` event stream - dev servers, extensions, other
 * embeds and *other sandboxes on the same page* all post into it - and both
 * sides are forced to post with `targetOrigin: '*'` because an opaque origin
 * cannot be named. So the tag, the version and the per-instance channel secret
 * are what decide whether a message is ours.
 */

import { describe, expect, it } from 'vitest';
import {
  OPAQUE_ORIGIN,
  SANDBOX_MESSAGE_TAG,
  SANDBOX_PROTOCOL_VERSION,
  SANDBOX_TARGET_ORIGIN,
  createChannelId,
  isSandboxEnvelope,
  sealEnvelope,
  toErrorPayload,
} from '../src/protocol';
import type { GuestMessage } from '../src/protocol';

const CHANNEL = 'channel-under-test';

describe('sealEnvelope', () => {
  it('stamps the tag, version and channel onto the message', () => {
    expect(sealEnvelope<GuestMessage>(CHANNEL, { type: 'guest:ready' })).toEqual({
      type: 'guest:ready',
      tag: SANDBOX_MESSAGE_TAG,
      version: SANDBOX_PROTOCOL_VERSION,
      channel: CHANNEL,
    });
  });

  it('does not mutate the message it was given', () => {
    const message: GuestMessage = { type: 'guest:height', height: 42 };
    sealEnvelope(CHANNEL, message);

    expect(message).toEqual({ type: 'guest:height', height: 42 });
  });

  it('produces something structured-cloneable', () => {
    const sealed = sealEnvelope<GuestMessage>(CHANNEL, {
      type: 'guest:capability-request',
      id: '1',
      name: 'submitLead',
      payload: { nested: [1, 'two'] },
    });

    expect(() => structuredClone(sealed)).not.toThrow();
  });
});

describe('isSandboxEnvelope', () => {
  const sealed = sealEnvelope<GuestMessage>(CHANNEL, { type: 'guest:ready' });

  it('accepts an envelope sealed with the same channel', () => {
    expect(isSandboxEnvelope(sealed, CHANNEL)).toBe(true);
  });

  it('rejects an envelope sealed for a different channel', () => {
    // Two sandboxes on one page see each other's traffic; this is what keeps
    // them from reading it.
    expect(isSandboxEnvelope(sealEnvelope(CHANNEL, { type: 'guest:ready' }), 'other')).toBe(false);
  });

  it('rejects a message with no channel at all', () => {
    expect(
      isSandboxEnvelope(
        { type: 'guest:ready', tag: SANDBOX_MESSAGE_TAG, version: SANDBOX_PROTOCOL_VERSION },
        CHANNEL
      )
    ).toBe(false);
  });

  it('rejects a foreign tag', () => {
    expect(isSandboxEnvelope({ ...sealed, tag: 'webpack-hmr' }, CHANNEL)).toBe(false);
    expect(isSandboxEnvelope({ ...sealed, tag: undefined }, CHANNEL)).toBe(false);
  });

  it('rejects a version it does not speak', () => {
    expect(isSandboxEnvelope({ ...sealed, version: SANDBOX_PROTOCOL_VERSION + 1 }, CHANNEL)).toBe(
      false
    );
    expect(isSandboxEnvelope({ ...sealed, version: String(SANDBOX_PROTOCOL_VERSION) }, CHANNEL)).toBe(
      false
    );
  });

  it('rejects anything without a string type', () => {
    expect(isSandboxEnvelope({ ...sealed, type: 42 }, CHANNEL)).toBe(false);
    expect(isSandboxEnvelope({ ...sealed, type: undefined }, CHANNEL)).toBe(false);
  });

  it('rejects non-objects', () => {
    for (const value of [null, undefined, 'guest:ready', 7, true, Symbol('x')]) {
      expect(isSandboxEnvelope(value, CHANNEL)).toBe(false);
    }
  });

  it('does not validate the payload, only the envelope', () => {
    // Documented: callers narrow on `type` and must treat every field as
    // attacker-controlled, because the guest is code we do not trust.
    const hostile = sealEnvelope(CHANNEL, {
      type: 'guest:capability-request',
      id: { not: 'a string' },
    } as never);

    expect(isSandboxEnvelope(hostile, CHANNEL)).toBe(true);
  });
});

describe('toErrorPayload', () => {
  it('flattens an Error into cloneable fields', () => {
    const error = new TypeError('bad input');
    const payload = toErrorPayload(error);

    expect(payload.name).toBe('TypeError');
    expect(payload.message).toBe('bad input');
    expect(payload.stack).toBe(error.stack);
    expect(() => structuredClone(payload)).not.toThrow();
  });

  it('describes a thrown non-Error', () => {
    expect(toErrorPayload('just a string')).toEqual({ name: 'Error', message: 'just a string' });
    expect(toErrorPayload({ code: 1 })).toEqual({ name: 'Error', message: '[object Object]' });
    expect(toErrorPayload(undefined)).toEqual({ name: 'Error', message: 'undefined' });
  });
});

describe('createChannelId', () => {
  it('returns a distinct high-entropy id each time', () => {
    const ids = new Set(Array.from({ length: 100 }, createChannelId));

    expect(ids.size).toBe(100);
    for (const id of ids) expect(id.length).toBeGreaterThanOrEqual(32);
  });
});

describe('constants', () => {
  it('pins the values both halves and the frame document depend on', () => {
    // A sandboxed frame reports the *string* "null" as its origin. Accepting
    // '*' here instead would accept every frame and opener on the page.
    expect(OPAQUE_ORIGIN).toBe('null');
    expect(SANDBOX_TARGET_ORIGIN).toBe('*');
  });
});
