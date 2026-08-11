/**
 * The imperative mount.
 *
 * Same approach as the React host's tests: the iframe is created for real but
 * given a stand-in `contentWindow`, because what is under test is the bridge -
 * which senders are believed, what crosses it, and what is left behind when the
 * mount is torn down - and none of that needs the frame to actually run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountSandboxedDocument } from '../src/host/mountSandboxedDocument';
import type {
  MountSandboxedDocumentOptions,
  SandboxedDocumentHandle,
} from '../src/host/mountSandboxedDocument';
import { OPAQUE_ORIGIN, SANDBOX_MESSAGE_TAG, sealEnvelope } from '../src/protocol';
import type { GuestMessage, HostMessage, SandboxEnvelope } from '../src/protocol';

interface Mounted {
  handle: SandboxedDocumentHandle;
  container: HTMLDivElement;
  channel: string;
  posted: SandboxEnvelope<HostMessage>[];
  deliver: (
    message: GuestMessage,
    forge?: { channel?: string; origin?: string; source?: unknown }
  ) => void;
  received: <T extends HostMessage['type']>(
    type: T
  ) => Array<SandboxEnvelope<HostMessage> & { type: T }>;
}

/** Every `message` listener added on `window` since the last reset. */
let listenerLedger: {
  added: Array<{ type: string; listener: unknown }>;
  removed: Array<{ type: string; listener: unknown }>;
};

const containers: HTMLDivElement[] = [];
const handles: SandboxedDocumentHandle[] = [];

function mount(options: Partial<MountSandboxedDocumentOptions> = {}): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);

  const handle = mountSandboxedDocument(container, {
    source: '# Document',
    guestScript: '/* guest runtime */',
    ...options,
  });
  handles.push(handle);

  const srcDoc = handle.frame.getAttribute('srcdoc') ?? '';
  const config = /id="mdxstudio-sandbox-config">([^<]*)</.exec(srcDoc);
  const channel = JSON.parse(config![1]).channel as string;

  const posted: SandboxEnvelope<HostMessage>[] = [];
  // jsdom will not run the frame, and the host only needs a window-shaped thing
  // to post into and to compare `event.source` against.
  const contentWindow = {
    postMessage: (data: SandboxEnvelope<HostMessage>) => {
      posted.push(data);
    },
  };
  Object.defineProperty(handle.frame, 'contentWindow', {
    value: contentWindow,
    configurable: true,
  });

  const deliver: Mounted['deliver'] = (message, forge = {}) => {
    const event = new MessageEvent('message', {
      data: sealEnvelope(forge.channel ?? channel, message),
      origin: forge.origin ?? OPAQUE_ORIGIN,
    });
    Object.defineProperty(event, 'source', {
      value: 'source' in forge ? forge.source : contentWindow,
    });
    window.dispatchEvent(event);
  };

  const received: Mounted['received'] = (type) =>
    posted.filter((envelope) => envelope.type === type) as never;

  return { handle, container, channel, posted, deliver, received };
}

/** Mounts and completes the handshake, which is the normal running state. */
function mountReady(options: Partial<MountSandboxedDocumentOptions> = {}): Mounted {
  const sandbox = mount(options);
  sandbox.deliver({ type: 'guest:ready' });
  return sandbox;
}

/** Lets the host's async capability handling settle. */
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  listenerLedger = { added: [], removed: [] };
  // The spies call through, so the bridge really is wired up; the ledger only
  // records what was registered against `window` so a test can prove that
  // dispose takes away exactly what mount put there.
  const realAdd = window.addEventListener.bind(window);
  const realRemove = window.removeEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((
    type: string,
    listener: unknown,
    optionsArg?: unknown
  ) => {
    listenerLedger.added.push({ type, listener });
    realAdd(type as never, listener as never, optionsArg as never);
  });
  vi.spyOn(window, 'removeEventListener').mockImplementation((
    type: string,
    listener: unknown,
    optionsArg?: unknown
  ) => {
    listenerLedger.removed.push({ type, listener });
    realRemove(type as never, listener as never, optionsArg as never);
  });
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
  for (const container of containers.splice(0)) container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the frame it creates', () => {
  it('is sandboxed without allow-same-origin and lives in the container', () => {
    const { handle, container } = mount();

    // With allow-scripts, allow-same-origin would give the document the app's
    // origin *and* the ability to strip this attribute itself.
    expect(handle.frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(handle.frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(handle.frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(container.contains(handle.frame)).toBe(true);
    expect(handle.frame.getAttribute('srcdoc')).toContain("connect-src 'none'");
  });

  it('is appended rather than replacing what the container already holds', () => {
    const container = document.createElement('div');
    const existing = document.createElement('p');
    container.appendChild(existing);
    document.body.appendChild(container);
    containers.push(container);

    const handle = mountSandboxedDocument(container, {
      source: '# Document',
      guestScript: '/* guest runtime */',
    });
    handles.push(handle);

    expect(container.contains(existing)).toBe(true);
    expect(container.contains(handle.frame)).toBe(true);
  });

  it('carries a channel secret that differs per mount', () => {
    const first = mount();
    const second = mount();

    expect(second.channel).not.toBe(first.channel);

    // The second mount's traffic is invisible to the first.
    second.deliver({ type: 'guest:ready' });
    expect(first.posted).toEqual([]);
  });

  it('refuses to mount without a container or a guest runtime', () => {
    const container = document.createElement('div');

    expect(() =>
      mountSandboxedDocument(null as never, { source: '', guestScript: 'x' })
    ).toThrow(/requires a DOM element/);
    expect(() => mountSandboxedDocument(container, { source: '', guestScript: '' })).toThrow(
      /requires guestScript/
    );
  });
});

describe('handshake', () => {
  it('answers guest:ready with the capability names and the document', () => {
    const onReady = vi.fn();
    const sandbox = mountReady({
      capabilities: { submitLead: vi.fn(), track: vi.fn() },
      theme: 'github-dark',
      expressions: 'literals',
      onReady,
    });

    expect(sandbox.received('host:ready')).toMatchObject([
      { capabilities: ['submitLead', 'track'], capabilityTimeoutMs: 10_000 },
    ]);
    expect(sandbox.received('host:render')).toMatchObject([
      {
        revision: 1,
        content: '# Document',
        props: { theme: 'github-dark', expressions: 'literals' },
      },
    ]);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('answers a repeated guest:ready without firing onReady again', () => {
    const onReady = vi.fn();
    const sandbox = mountReady({ onReady });

    sandbox.deliver({ type: 'guest:ready' });

    expect(sandbox.received('host:ready')).toHaveLength(2);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('delivers whatever is current when the handshake completes', () => {
    const sandbox = mount({ source: '# First' });

    // Nobody is listening yet, so this must not be posted - and must not be lost.
    sandbox.handle.update('# Second');
    expect(sandbox.posted).toEqual([]);

    sandbox.deliver({ type: 'guest:ready' });
    expect(sandbox.received('host:render')).toMatchObject([{ revision: 1, content: '# Second' }]);
  });

  it('reports a boot failure when the frame never answers', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    mount({ onError, handshakeTimeoutMs: 1_000 });

    vi.advanceTimersByTime(1_000);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'boot', name: 'SandboxHandshakeError' })
    );
  });

  it('does not report a boot failure once the handshake completed', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    mountReady({ onError, handshakeTimeoutMs: 1_000 });

    vi.advanceTimersByTime(1_000);

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('which senders are believed', () => {
  it('ignores a message sealed for a different channel', () => {
    const sandbox = mount();

    sandbox.deliver({ type: 'guest:ready' }, { channel: 'someone-elses-channel' });

    expect(sandbox.posted).toEqual([]);
  });

  it('ignores a message from a window that is not our frame', () => {
    const sandbox = mount();

    sandbox.deliver({ type: 'guest:ready' }, { source: { postMessage: vi.fn() } });

    expect(sandbox.posted).toEqual([]);
  });

  it('ignores a message whose origin is not the opaque one', () => {
    // A same-origin frame reaching this listener would mean the sandbox
    // attribute was lost, which must fail rather than be trusted.
    const sandbox = mount();

    sandbox.deliver({ type: 'guest:ready' }, { origin: 'https://app.example' });

    expect(sandbox.posted).toEqual([]);
  });

  it('seals its own replies with the same channel', () => {
    const sandbox = mountReady();

    for (const envelope of sandbox.posted) {
      expect(envelope.channel).toBe(sandbox.channel);
      expect(envelope.tag).toBe(SANDBOX_MESSAGE_TAG);
    }
  });
});

describe('the handle', () => {
  it('sends a new revision for a changed document and nothing for an unchanged one', () => {
    const sandbox = mountReady();

    sandbox.handle.update('# Edited');
    sandbox.handle.update('# Edited');

    expect(sandbox.received('host:render')).toMatchObject([
      { revision: 1, content: '# Document' },
      { revision: 2, content: '# Edited' },
    ]);
  });

  it('re-renders the current document under a new theme', () => {
    const sandbox = mountReady({ theme: 'github-light' });

    sandbox.handle.setTheme('dracula');
    sandbox.handle.setTheme('dracula');

    expect(sandbox.received('host:render')).toMatchObject([
      { revision: 1, props: { theme: 'github-light' } },
      { revision: 2, content: '# Document', props: { theme: 'dracula' } },
    ]);
  });

  it('keeps theme and expressions ahead of raw props', () => {
    const sandbox = mountReady({ theme: 'nord', expressions: 'literals' });

    sandbox.handle.setProps({ theme: 'cyberpunk', expressions: 'full', extra: 1 });

    expect(sandbox.received('host:render').at(-1)).toMatchObject({
      props: { theme: 'nord', expressions: 'literals', extra: 1 },
    });
  });

  it('pushes host events into a running document, and drops them before it runs', () => {
    const sandbox = mount();

    sandbox.handle.emit('selection', { line: 3 });
    expect(sandbox.received('host:event')).toEqual([]);

    sandbox.deliver({ type: 'guest:ready' });
    sandbox.handle.emit('selection', { line: 3 });

    expect(sandbox.received('host:event')).toMatchObject([
      { name: 'selection', payload: { line: 3 } },
    ]);
  });

  it('sizes the frame from reported height, never below the floor', () => {
    const onHeightChange = vi.fn();
    const sandbox = mountReady({ onHeightChange, minHeight: 120 });

    sandbox.deliver({ type: 'guest:height', height: 40 });
    expect(sandbox.handle.frame.style.height).toBe('120px');

    sandbox.deliver({ type: 'guest:rendered', revision: 1, height: 300.2 });
    expect(sandbox.handle.frame.style.height).toBe('301px');

    // The same height again is not a change.
    sandbox.deliver({ type: 'guest:height', height: 301 });
    sandbox.deliver({ type: 'guest:height', height: Number.NaN });
    expect(onHeightChange.mock.calls).toEqual([[120], [301]]);
  });
});

describe('capability calls', () => {
  it('runs a registered capability and correlates the answer by id', async () => {
    const submitLead = vi.fn(async () => ({ stored: true }));
    const sandbox = mountReady({ capabilities: { submitLead } });

    sandbox.deliver({
      type: 'guest:capability-request',
      id: 'call-1',
      name: 'submitLead',
      payload: { email: 'a@b.c' },
    });
    await settle();

    expect(submitLead).toHaveBeenCalledWith(
      { email: 'a@b.c' },
      { name: 'submitLead', channel: sandbox.channel }
    );
    expect(sandbox.received('host:capability-response')).toMatchObject([
      { id: 'call-1', ok: true, result: { stored: true } },
    ]);
  });

  it('refuses a name that is not registered', async () => {
    const onError = vi.fn();
    const sandbox = mountReady({ capabilities: { submitLead: vi.fn() }, onError });

    sandbox.deliver({
      type: 'guest:capability-request',
      id: 'call-1',
      name: 'deleteEverything',
      payload: null,
    });
    await settle();

    expect(sandbox.received('host:capability-response')).toMatchObject([
      { id: 'call-1', ok: false, error: { name: 'SandboxCapabilityError' } },
    ]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'capability' }));
  });

  it('refuses a name that only exists on the prototype chain', async () => {
    // `name in table` rather than hasOwn would let a document call
    // `constructor` or `toString` and reach a function the host never exposed.
    const sandbox = mountReady({ capabilities: {} });

    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      sandbox.deliver({ type: 'guest:capability-request', id: name, name, payload: null });
    }
    await settle();

    const responses = sandbox.received('host:capability-response');
    expect(responses).toHaveLength(4);
    for (const response of responses) {
      expect(response).toMatchObject({ ok: false });
      expect((response as { error: { message: string } }).error.message).toMatch(
        /is not registered/
      );
    }
  });

  it('reports a throwing handler without handing the guest a stack trace', async () => {
    const onError = vi.fn();
    const sandbox = mountReady({
      capabilities: {
        submitLead: () => {
          throw new Error('database is down');
        },
      },
      onError,
    });

    sandbox.deliver({
      type: 'guest:capability-request',
      id: '1',
      name: 'submitLead',
      payload: null,
    });
    await settle();

    const [response] = sandbox.received('host:capability-response');
    expect(response).toMatchObject({ ok: false, error: { message: 'database is down' } });
    expect((response as unknown as { error: Record<string, unknown> }).error.stack).toBeUndefined();
  });

  it('refuses more calls than the in-flight ceiling allows', async () => {
    let release: (() => void) | null = null;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sandbox = mountReady({
      capabilities: { slow: () => blocked },
      maxPendingCapabilityCalls: 2,
    });

    for (const id of ['1', '2', '3']) {
      sandbox.deliver({ type: 'guest:capability-request', id, name: 'slow', payload: null });
    }
    await settle();

    expect(sandbox.received('host:capability-response')).toMatchObject([
      { id: '3', ok: false, error: { message: 'Too many capability calls in flight (limit 2).' } },
    ]);

    release!();
    await settle();
    expect(sandbox.received('host:capability-response')).toHaveLength(3);
  });

  it('reports a malformed capability request as a protocol failure', async () => {
    const onError = vi.fn();
    const sandbox = mountReady({ onError });

    sandbox.deliver({
      type: 'guest:capability-request',
      id: 42,
      name: 'submitLead',
      payload: null,
    } as never);
    await settle();

    expect(sandbox.received('host:capability-response')).toEqual([]);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'protocol', name: 'SandboxProtocolError' })
    );
  });
});

describe('guest reports', () => {
  it('surfaces a guest error rather than letting it vanish into the opaque origin', () => {
    const onError = vi.fn();
    const sandbox = mountReady({ onError });

    sandbox.deliver({
      type: 'guest:error',
      phase: 'render',
      error: { name: 'SyntaxError', message: 'unexpected token', stack: 'at line 1' },
    });

    expect(onError).toHaveBeenCalledWith({
      phase: 'render',
      name: 'SyntaxError',
      message: 'unexpected token',
      stack: 'at line 1',
    });
  });

  it('fills in defaults for an error with nothing usable in it', () => {
    const onError = vi.fn();
    const sandbox = mountReady({ onError });

    sandbox.deliver({ type: 'guest:error', phase: undefined, error: {} } as never);

    expect(onError).toHaveBeenCalledWith({
      phase: 'runtime',
      name: 'Error',
      message: 'Unknown guest error.',
      stack: undefined,
    });
  });

  it('forwards guest events and console output', () => {
    const onEvent = vi.fn();
    const onLog = vi.fn();
    const sandbox = mountReady({ onEvent, onLog });

    sandbox.deliver({ type: 'guest:event', name: 'lead', payload: { id: 7 } });
    sandbox.deliver({ type: 'guest:event', name: 42 as never, payload: null });
    sandbox.deliver({ type: 'guest:log', level: 'warn', args: ['careful'] });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('lead', { id: 7 });
    expect(onLog).toHaveBeenCalledWith({ level: 'warn', args: ['careful'] });
  });
});

describe('dispose', () => {
  it('adds exactly one window listener and takes that same one away', () => {
    const sandbox = mount();

    const added = listenerLedger.added.filter((entry) => entry.type === 'message');
    expect(added).toHaveLength(1);
    expect(listenerLedger.removed).toEqual([]);

    sandbox.handle.dispose();

    const removed = listenerLedger.removed.filter((entry) => entry.type === 'message');
    expect(removed).toHaveLength(1);
    // Identity, not count: `removeEventListener` with a different function is a
    // silent no-op, so a matching count alone would prove nothing.
    expect(removed[0].listener).toBe(added[0].listener);
  });

  it('removes the frame and stops listening', () => {
    const onError = vi.fn();
    const onReady = vi.fn();
    const sandbox = mountReady({ onError, onReady });
    const postedBefore = sandbox.posted.length;

    sandbox.handle.dispose();

    expect(sandbox.container.contains(sandbox.handle.frame)).toBe(false);

    // The listener is gone, so nothing the frame says can reach the host.
    sandbox.deliver({ type: 'guest:ready' });
    sandbox.deliver({ type: 'guest:error', phase: 'runtime', error: { name: 'E', message: 'm' } });

    expect(sandbox.posted).toHaveLength(postedBefore);
    expect(onError).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('is safe to call twice and removes nothing a second time', () => {
    const sandbox = mount();

    sandbox.handle.dispose();
    expect(() => sandbox.handle.dispose()).not.toThrow();

    expect(listenerLedger.removed.filter((entry) => entry.type === 'message')).toHaveLength(1);
  });

  it('cancels the pending handshake timer', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const sandbox = mount({ onError, handshakeTimeoutMs: 1_000 });

    sandbox.handle.dispose();
    vi.advanceTimersByTime(5_000);

    // A mount that is torn down before it boots has not failed to boot.
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('makes every handle method inert', () => {
    const sandbox = mountReady();
    const postedBefore = sandbox.posted.length;

    sandbox.handle.dispose();
    sandbox.handle.update('# Edited');
    sandbox.handle.setTheme('dracula');
    sandbox.handle.setProps({ a: 1 });
    sandbox.handle.emit('ping');

    expect(sandbox.posted).toHaveLength(postedBefore);
  });
});
