/**
 * The guest half of the bridge, driven without a browser.
 *
 * `startGuest` is booted against a fake parent (a spy on `postMessage`) and fed
 * hand-sealed host messages, so the real correlation, timeout and rejection
 * paths run - the parts a browser test could only observe indirectly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startGuest } from '../src/guest/index';
import type { SandboxGuestApi } from '../src/guest/index';
import { OPAQUE_ORIGIN, sealEnvelope } from '../src/protocol';
import type { GuestMessage, HostMessage, SandboxEnvelope } from '../src/protocol';

const HOST_ORIGIN = 'https://app.example';

let postSpy: ReturnType<typeof vi.spyOn>;
let channelSeq = 0;

interface BootedGuest {
  channel: string;
  /** Only the envelopes this guest sent; stale guests from earlier tests are filtered out. */
  posted: SandboxEnvelope<GuestMessage>[];
  sandbox: SandboxGuestApi;
  render: ReturnType<typeof vi.fn>;
  /** Delivers a host message, optionally forging the channel, origin or sender. */
  deliver: (
    message: HostMessage,
    forge?: { channel?: string; origin?: string; source?: unknown }
  ) => void;
  sent: <T extends GuestMessage['type']>(type: T) => Array<SandboxEnvelope<GuestMessage> & { type: T }>;
}

function bootGuest(render = vi.fn()): BootedGuest {
  channelSeq += 1;
  const channel = `channel-${channelSeq}`;

  document.body.innerHTML =
    '<div id="mdxkit-sandbox-root"></div>' +
    `<script type="application/json" id="mdxkit-sandbox-config">${JSON.stringify({
      channel,
    })}</script>`;

  const posted: SandboxEnvelope<GuestMessage>[] = [];
  postSpy.mockImplementation(((data: unknown) => {
    const envelope = data as SandboxEnvelope<GuestMessage> | null;
    if (envelope && typeof envelope === 'object' && envelope.channel === channel) {
      posted.push(envelope);
    }
  }) as never);

  startGuest({ render });
  const sandbox = (window as unknown as { sandbox: SandboxGuestApi }).sandbox;

  const deliver: BootedGuest['deliver'] = (message, forge = {}) => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: sealEnvelope(forge.channel ?? channel, message),
        origin: forge.origin ?? HOST_ORIGIN,
        source: ('source' in forge ? forge.source : window) as MessageEventSource | null,
      })
    );
  };

  const sent: BootedGuest['sent'] = (type) =>
    posted.filter((envelope) => envelope.type === type) as never;

  return { channel, posted, sandbox, render, deliver, sent };
}

/** Completes the handshake so the guest is in its normal running state. */
function acknowledge(
  guest: BootedGuest,
  overrides: Partial<Extract<HostMessage, { type: 'host:ready' }>> = {}
): void {
  guest.deliver({
    type: 'host:ready',
    capabilities: ['submitLead'],
    capabilityTimeoutMs: 10_000,
    maxPendingCapabilityCalls: 32,
    ...overrides,
  });
}

/** The id the guest minted for its most recent capability request. */
function lastRequest(guest: BootedGuest) {
  const requests = guest.sent('guest:capability-request');
  return requests[requests.length - 1] as unknown as {
    id: string;
    name: string;
    payload: unknown;
  };
}

/** Lets queued microtasks and short timers run under the fake clock. */
const flush = (ms = 1) => vi.advanceTimersByTimeAsync(ms);

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  // jsdom has no ResizeObserver, and height reporting is not what these tests
  // are about. Stubbing both observers also stops a guest booted by an earlier
  // test from firing a callback after its environment is gone.
  vi.stubGlobal('ResizeObserver', ObserverStub);
  vi.stubGlobal('MutationObserver', ObserverStub);
  // Fake timers keep the handshake retry interval from running loose between
  // tests, and are what the capability timeout assertions drive.
  vi.useFakeTimers();
  postSpy = vi.spyOn(window, 'postMessage');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('handshake', () => {
  it('announces itself sealed with its own channel', () => {
    const guest = bootGuest();

    expect(guest.sent('guest:ready')).toHaveLength(1);
    expect(guest.posted[0]).toMatchObject({
      type: 'guest:ready',
      channel: guest.channel,
      tag: 'mdxkit-sandbox',
      version: 1,
    });
  });

  it('refuses to boot without a channel in its config', () => {
    document.body.innerHTML =
      '<script type="application/json" id="mdxkit-sandbox-config">{}</script>';

    expect(() => startGuest({ render: vi.fn() })).toThrow(/missing a channel/);
  });

  it('refuses to boot with no config block at all', () => {
    document.body.innerHTML = '';

    expect(() => startGuest({ render: vi.fn() })).toThrow(/without a config block/);
  });

  it('takes the capability names, timeout and call ceiling from host:ready', () => {
    const guest = bootGuest();
    acknowledge(guest, { capabilities: ['a', 'b', 42 as never], capabilityTimeoutMs: 250 });

    // Non-string names are dropped rather than trusted.
    expect(guest.sandbox.capabilities).toEqual(['a', 'b']);
  });
});

describe('capability calls', () => {
  it('posts a request and resolves when the host answers it', async () => {
    const guest = bootGuest();
    acknowledge(guest);

    const promise = guest.sandbox.call('submitLead', { email: 'a@b.c' });
    const request = lastRequest(guest);

    expect(request.name).toBe('submitLead');
    expect(request.payload).toEqual({ email: 'a@b.c' });

    guest.deliver({
      type: 'host:capability-response',
      id: request.id,
      ok: true,
      result: { stored: true },
    });

    await expect(promise).resolves.toEqual({ stored: true });
  });

  it('correlates concurrent calls by id, whatever order they are answered in', async () => {
    const guest = bootGuest();
    acknowledge(guest);

    const first = guest.sandbox.call('submitLead', 1);
    const second = guest.sandbox.call('submitLead', 2);
    const [firstRequest, secondRequest] = guest.sent('guest:capability-request') as never as Array<{
      id: string;
      payload: number;
    }>;

    expect(firstRequest.id).not.toBe(secondRequest.id);

    guest.deliver({
      type: 'host:capability-response',
      id: secondRequest.id,
      ok: true,
      result: 'second',
    });
    guest.deliver({
      type: 'host:capability-response',
      id: firstRequest.id,
      ok: true,
      result: 'first',
    });

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });

  it('rejects with the host error when the name is not registered', async () => {
    const guest = bootGuest();
    acknowledge(guest);

    const promise = guest.sandbox.call('deleteEverything');
    const { id } = lastRequest(guest);

    // What SandboxedMdx sends back for a name that is not an own function.
    guest.deliver({
      type: 'host:capability-response',
      id,
      ok: false,
      error: {
        name: 'SandboxCapabilityError',
        message: 'Capability "deleteEverything" is not registered.',
      },
    });

    await expect(promise).rejects.toThrow('Capability "deleteEverything" is not registered.');
    await expect(promise).rejects.toHaveProperty('name', 'SandboxCapabilityError');
  });

  it('rejects with a default when the host sends no error detail', async () => {
    const guest = bootGuest();
    acknowledge(guest);

    const promise = guest.sandbox.call('submitLead');
    guest.deliver({
      type: 'host:capability-response',
      id: lastRequest(guest).id,
      ok: false,
      error: undefined as never,
    });

    await expect(promise).rejects.toThrow('Capability call failed.');
  });

  it('rejects a call with no name without posting anything', async () => {
    const guest = bootGuest();
    acknowledge(guest);

    await expect(guest.sandbox.call('')).rejects.toThrow(/requires a capability name/);
    expect(guest.sent('guest:capability-request')).toHaveLength(0);
  });

  it('refuses to queue more calls than the host allows', async () => {
    const guest = bootGuest();
    acknowledge(guest, { maxPendingCapabilityCalls: 2 });

    const settled = [
      guest.sandbox.call('submitLead'),
      guest.sandbox.call('submitLead'),
      guest.sandbox.call('submitLead'),
    ];

    await expect(settled[2]).rejects.toThrow('Too many capability calls in flight (limit 2).');
    expect(guest.sent('guest:capability-request')).toHaveLength(2);

    // The two real calls are still outstanding; settle them so nothing leaks.
    for (const request of guest.sent('guest:capability-request') as never as Array<{ id: string }>) {
      guest.deliver({ type: 'host:capability-response', id: request.id, ok: true, result: null });
    }
    await Promise.all([settled[0], settled[1]]);
  });

  it('rejects a call the host never answers, and ignores the late answer', async () => {
    const guest = bootGuest();
    acknowledge(guest, { capabilityTimeoutMs: 500 });

    const promise = guest.sandbox.call('submitLead');
    const { id } = lastRequest(guest);

    vi.advanceTimersByTime(500);
    await expect(promise).rejects.toThrow('Capability "submitLead" timed out after 500ms.');

    // The host answering afterwards must not throw on a call that is gone.
    expect(() =>
      guest.deliver({ type: 'host:capability-response', id, ok: true, result: 'late' })
    ).not.toThrow();
  });

  it('frees the slot a timed-out call was holding', async () => {
    const guest = bootGuest();
    acknowledge(guest, { capabilityTimeoutMs: 500, maxPendingCapabilityCalls: 1 });

    const first = guest.sandbox.call('submitLead');
    vi.advanceTimersByTime(500);
    await expect(first).rejects.toThrow(/timed out/);

    const second = guest.sandbox.call('submitLead');
    guest.deliver({
      type: 'host:capability-response',
      id: lastRequest(guest).id,
      ok: true,
      result: 'ok',
    });
    await expect(second).resolves.toBe('ok');
  });
});

describe('inbound message filtering', () => {
  it('ignores a response sealed for a different channel', async () => {
    const guest = bootGuest();
    acknowledge(guest, { capabilityTimeoutMs: 200 });

    const promise = guest.sandbox.call('submitLead');
    const { id } = lastRequest(guest);

    // A sibling sandbox on the same page answering our call.
    guest.deliver(
      { type: 'host:capability-response', id, ok: true, result: 'stolen' },
      { channel: 'someone-elses-channel' }
    );

    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow(/timed out/);
  });

  it('ignores a message from anything that is not the parent', async () => {
    const guest = bootGuest();
    acknowledge(guest, { capabilityTimeoutMs: 200 });

    const promise = guest.sandbox.call('submitLead');
    guest.deliver(
      { type: 'host:capability-response', id: lastRequest(guest).id, ok: true, result: 'x' },
      { source: null }
    );

    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow(/timed out/);
  });

  it('ignores a message claiming an opaque origin', async () => {
    const guest = bootGuest();
    acknowledge(guest, { capabilityTimeoutMs: 200 });

    const promise = guest.sandbox.call('submitLead');
    // A sibling sandboxed frame impersonating the host.
    guest.deliver(
      { type: 'host:capability-response', id: lastRequest(guest).id, ok: true, result: 'x' },
      { origin: OPAQUE_ORIGIN }
    );

    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow(/timed out/);
  });
});

describe('events', () => {
  it('emits a fire-and-forget signal to the host', () => {
    const guest = bootGuest();
    acknowledge(guest);

    guest.sandbox.emit('lead', { id: 7 });

    expect(guest.sent('guest:event')).toMatchObject([{ name: 'lead', payload: { id: 7 } }]);
  });

  it('ignores an emit with a name that is not a string', () => {
    const guest = bootGuest();
    acknowledge(guest);

    guest.sandbox.emit(42 as never, {});

    expect(guest.sent('guest:event')).toHaveLength(0);
  });

  it('delivers host:event to subscribers and stops on unsubscribe', () => {
    const guest = bootGuest();
    acknowledge(guest);

    const listener = vi.fn();
    const unsubscribe = guest.sandbox.on('theme', listener);

    guest.deliver({ type: 'host:event', name: 'theme', payload: 'dark' });
    expect(listener).toHaveBeenCalledWith('dark');

    unsubscribe();
    guest.deliver({ type: 'host:event', name: 'theme', payload: 'light' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reports a throwing listener instead of losing the others', () => {
    const guest = bootGuest();
    acknowledge(guest);

    const survivor = vi.fn();
    guest.sandbox.on('theme', () => {
      throw new Error('listener exploded');
    });
    guest.sandbox.on('theme', survivor);

    guest.deliver({ type: 'host:event', name: 'theme', payload: 'dark' });

    expect(survivor).toHaveBeenCalledWith('dark');
    expect(guest.sent('guest:error')).toMatchObject([
      { phase: 'runtime', error: { message: 'listener exploded' } },
    ]);
  });
});

describe('rendering', () => {
  it('renders a document and echoes the revision back', async () => {
    const guest = bootGuest();
    acknowledge(guest);

    guest.deliver({
      type: 'host:render',
      revision: 3,
      content: '# Hello',
      props: { theme: 'dark' },
    });
    await flush();

    expect(guest.render).toHaveBeenCalledTimes(1);
    expect(guest.render.mock.calls[0][0]).toMatchObject({
      content: '# Hello',
      props: { theme: 'dark' },
    });
    expect(guest.sent('guest:rendered')).toMatchObject([{ revision: 3 }]);
  });

  it('substitutes safe defaults for a malformed render message', async () => {
    const guest = bootGuest();
    acknowledge(guest);

    guest.deliver({ type: 'host:render', revision: 1, content: null, props: 'nope' } as never);
    await flush();

    expect(guest.render.mock.calls[0][0]).toMatchObject({ content: '', props: {} });
  });

  it('reports a render failure and still accepts the next document', async () => {
    let shouldThrow = true;
    const render = vi.fn(() => {
      if (shouldThrow) throw new Error('render exploded');
    });
    const guest = bootGuest(render);
    acknowledge(guest);

    guest.deliver({ type: 'host:render', revision: 1, content: 'bad', props: {} });
    await flush();

    expect(guest.sent('guest:error')).toMatchObject([
      { phase: 'render', error: { message: 'render exploded' } },
    ]);
    expect(guest.sent('guest:rendered')).toHaveLength(0);

    shouldThrow = false;
    guest.deliver({ type: 'host:render', revision: 2, content: 'good', props: {} });
    await flush();

    expect(guest.sent('guest:rendered')).toMatchObject([{ revision: 2 }]);
  });

  it('runs renders one at a time', async () => {
    const order: string[] = [];
    const render = vi.fn(async ({ content }: { content: string }) => {
      order.push(`start ${content}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      order.push(`end ${content}`);
    });
    const guest = bootGuest(render as never);
    acknowledge(guest);

    guest.deliver({ type: 'host:render', revision: 1, content: 'a', props: {} });
    guest.deliver({ type: 'host:render', revision: 2, content: 'b', props: {} });
    await flush(10);

    expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
  });
});
