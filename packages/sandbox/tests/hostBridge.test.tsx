/**
 * The host half of the bridge.
 *
 * `SandboxedMdx` is mounted for real, but its iframe is given a stand-in
 * `contentWindow` rather than a live browsing context: what is under test is the
 * message handling - which senders are believed, which capability names are
 * callable - and none of that needs the frame to actually run.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SandboxedMdx } from '../src/host/SandboxedMdx';
import type { SandboxedMdxProps } from '../src/host/SandboxedMdx';
import { OPAQUE_ORIGIN, SANDBOX_MESSAGE_TAG, sealEnvelope } from '../src/protocol';
import type { GuestMessage, HostMessage, SandboxEnvelope } from '../src/protocol';
import type { SandboxError } from '../src/host/types';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

interface MountedSandbox {
  frame: HTMLIFrameElement;
  /** The per-instance channel secret, read back out of the frame's own config block. */
  channel: string;
  /** Everything the host posted into the frame. */
  posted: SandboxEnvelope<HostMessage>[];
  /** Delivers a guest message, optionally forging the channel, origin or sender. */
  deliver: (
    message: GuestMessage,
    forge?: { channel?: string; origin?: string; source?: unknown }
  ) => void;
  received: <T extends HostMessage['type']>(type: T) => Array<SandboxEnvelope<HostMessage> & { type: T }>;
  rerender: (props: Partial<SandboxedMdxProps>) => void;
}

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function mountSandbox(props: Partial<SandboxedMdxProps> = {}): MountedSandbox {
  const merged: SandboxedMdxProps = {
    content: '# Document',
    guestScript: '/* guest runtime */',
    ...props,
  };

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => {
    root.render(<SandboxedMdx {...merged} />);
  });

  const frame = container.querySelector('iframe') as HTMLIFrameElement;
  const srcDoc = frame.getAttribute('srcdoc') ?? '';
  const config = /id="mdxkit-sandbox-config">([^<]*)</.exec(srcDoc);
  const channel = JSON.parse(config![1]).channel as string;

  const posted: SandboxEnvelope<HostMessage>[] = [];
  // jsdom will not run the frame, and the host only needs a window-shaped thing
  // to post into and to compare `event.source` against.
  const contentWindow = {
    postMessage: (data: SandboxEnvelope<HostMessage>) => {
      posted.push(data);
    },
  };
  Object.defineProperty(frame, 'contentWindow', { value: contentWindow, configurable: true });

  const deliver: MountedSandbox['deliver'] = (message, forge = {}) => {
    const event = new MessageEvent('message', {
      data: sealEnvelope(forge.channel ?? channel, message),
      origin: forge.origin ?? OPAQUE_ORIGIN,
    });
    Object.defineProperty(event, 'source', {
      value: 'source' in forge ? forge.source : contentWindow,
    });
    act(() => {
      window.dispatchEvent(event);
    });
  };

  const received: MountedSandbox['received'] = (type) =>
    posted.filter((envelope) => envelope.type === type) as never;

  const rerender: MountedSandbox['rerender'] = (next) => {
    act(() => {
      root.render(<SandboxedMdx {...merged} {...next} />);
    });
  };

  return { frame, channel, posted, deliver, received, rerender };
}

/** Mounts and completes the handshake, which is the normal running state. */
function mountReady(props: Partial<SandboxedMdxProps> = {}): MountedSandbox {
  const sandbox = mountSandbox(props);
  sandbox.deliver({ type: 'guest:ready' });
  return sandbox;
}

/** Waits for the host's async capability handling to settle. */
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    for (const instance of mounted.splice(0)) {
      instance.root.unmount();
      instance.container.remove();
    }
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the frame', () => {
  it('is sandboxed without allow-same-origin', () => {
    const { frame } = mountSandbox();

    // With allow-scripts, allow-same-origin would give the document the app's
    // origin *and* the ability to strip this attribute itself.
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('carries a channel secret that differs per instance', () => {
    // Two sandboxes on the same page both see every message event, so the
    // secret is what keeps them from reading each other's traffic.
    const first = mountSandbox();
    const second = mountSandbox();

    expect(second.channel).not.toBe(first.channel);

    // The second instance's traffic is invisible to the first.
    second.deliver({ type: 'guest:ready' }, { source: second.frame.contentWindow });
    expect(first.posted).toEqual([]);
  });
});

describe('handshake', () => {
  it('answers guest:ready with the capability names and the document', () => {
    const onReady = vi.fn();
    const sandbox = mountReady({
      capabilities: { submitLead: vi.fn(), track: vi.fn() },
      props: { theme: 'dark' },
      onReady,
    });

    expect(sandbox.received('host:ready')).toMatchObject([
      { capabilities: ['submitLead', 'track'], capabilityTimeoutMs: 10_000 },
    ]);
    expect(sandbox.received('host:render')).toMatchObject([
      { revision: 1, content: '# Document', props: { theme: 'dark' } },
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

  it('reports a boot failure when the frame never answers', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    mountSandbox({ onError, handshakeTimeoutMs: 1_000 });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'boot', name: 'SandboxHandshakeError' })
    );
  });

  it('does not report a boot failure once the handshake completed', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    mountReady({ onError, handshakeTimeoutMs: 1_000 });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('which senders are believed', () => {
  it('ignores a message sealed for a different channel', () => {
    const sandbox = mountSandbox();

    sandbox.deliver({ type: 'guest:ready' }, { channel: 'someone-elses-channel' });

    expect(sandbox.posted).toEqual([]);
  });

  it('ignores a message from a window that is not our frame', () => {
    const sandbox = mountSandbox();

    sandbox.deliver({ type: 'guest:ready' }, { source: { postMessage: vi.fn() } });

    expect(sandbox.posted).toEqual([]);
  });

  it('ignores a message whose origin is not the opaque one', () => {
    // A same-origin frame reaching this listener would mean the sandbox
    // attribute was lost, which must fail rather than be trusted.
    const sandbox = mountSandbox();

    sandbox.deliver({ type: 'guest:ready' }, { origin: 'https://app.example' });

    expect(sandbox.posted).toEqual([]);
  });

  it('ignores a message that is not one of ours at all', () => {
    const sandbox = mountSandbox();
    const event = new MessageEvent('message', {
      data: { type: 'webpackHotUpdate' },
      origin: OPAQUE_ORIGIN,
    });
    Object.defineProperty(event, 'source', { value: sandbox.frame.contentWindow });

    act(() => {
      window.dispatchEvent(event);
    });

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

  it('keeps concurrent calls apart', async () => {
    const capabilities = {
      slow: vi.fn(async () => 'slow result'),
      fast: vi.fn(async () => 'fast result'),
    };
    const sandbox = mountReady({ capabilities });

    sandbox.deliver({ type: 'guest:capability-request', id: 'a', name: 'slow', payload: null });
    sandbox.deliver({ type: 'guest:capability-request', id: 'b', name: 'fast', payload: null });
    await settle();

    expect(sandbox.received('host:capability-response')).toMatchObject([
      { id: 'a', ok: true, result: 'slow result' },
      { id: 'b', ok: true, result: 'fast result' },
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
      {
        id: 'call-1',
        ok: false,
        error: {
          name: 'SandboxCapabilityError',
          message: 'Capability "deleteEverything" is not registered.',
        },
      },
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

  it('refuses a call with no capability table at all', async () => {
    const sandbox = mountReady();

    sandbox.deliver({ type: 'guest:capability-request', id: '1', name: 'anything', payload: null });
    await settle();

    expect(sandbox.received('host:capability-response')).toMatchObject([{ id: '1', ok: false }]);
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

    sandbox.deliver({ type: 'guest:capability-request', id: '1', name: 'submitLead', payload: null });
    await settle();

    const [response] = sandbox.received('host:capability-response');
    expect(response).toMatchObject({
      id: '1',
      ok: false,
      error: { name: 'Error', message: 'database is down' },
    });
    expect((response as unknown as { error: Record<string, unknown> }).error.stack).toBeUndefined();
    // The host itself still sees the stack.
    expect((onError.mock.calls[0][0] as SandboxError).stack).toBeTruthy();
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
      {
        id: '3',
        ok: false,
        error: { message: 'Too many capability calls in flight (limit 2).' },
      },
    ]);

    release!();
    await settle();
    expect(sandbox.received('host:capability-response')).toHaveLength(3);
  });

  it('reports a malformed capability request as a protocol failure', async () => {
    const onError = vi.fn();
    const sandbox = mountReady({ capabilities: { submitLead: vi.fn() }, onError });

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
  it('passes a guest error through with its phase', () => {
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

  it('forwards a guest event and its payload', () => {
    const onEvent = vi.fn();
    const sandbox = mountReady({ onEvent });

    sandbox.deliver({ type: 'guest:event', name: 'lead', payload: { id: 7 } });
    sandbox.deliver({ type: 'guest:event', name: 42 as never, payload: null });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('lead', { id: 7 });
  });

  it('forwards console output', () => {
    const onLog = vi.fn();
    const sandbox = mountReady({ onLog });

    sandbox.deliver({ type: 'guest:log', level: 'warn', args: ['careful'] });

    expect(onLog).toHaveBeenCalledWith({ level: 'warn', args: ['careful'] });
  });

  it('sizes the frame from reported height, never below the floor', () => {
    const onHeightChange = vi.fn();
    const sandbox = mountReady({ onHeightChange, minHeight: 120 });

    sandbox.deliver({ type: 'guest:height', height: 40 });
    expect(onHeightChange).toHaveBeenLastCalledWith(120);

    sandbox.deliver({ type: 'guest:height', height: 300.2 });
    expect(onHeightChange).toHaveBeenLastCalledWith(301);

    // The same height again is not a change.
    sandbox.deliver({ type: 'guest:height', height: 301 });
    expect(onHeightChange).toHaveBeenCalledTimes(2);

    sandbox.deliver({ type: 'guest:height', height: Number.NaN });
    expect(onHeightChange).toHaveBeenCalledTimes(2);
  });
});

describe('pushing documents', () => {
  it('sends a new revision when the content changes', () => {
    const sandbox = mountReady();

    sandbox.rerender({ content: '# Edited' });

    expect(sandbox.received('host:render')).toMatchObject([
      { revision: 1, content: '# Document' },
      { revision: 2, content: '# Edited' },
    ]);
  });

  it('does not resend for a props object that is new but equal', () => {
    // Hosts write `props={{ theme }}`, which is a fresh object every commit;
    // keying on identity would re-send the document on every render, and a
    // render can be caused by a message from the guest.
    const sandbox = mountReady({ props: { theme: 'dark' } });

    sandbox.rerender({ props: { theme: 'dark' } });
    sandbox.rerender({ props: { theme: 'dark' } });

    expect(sandbox.received('host:render')).toHaveLength(1);
  });

  it('refreshes the capability names the document can see', () => {
    const sandbox = mountReady({ capabilities: { a: vi.fn() } });

    sandbox.rerender({ capabilities: { a: vi.fn(), b: vi.fn() } });

    expect(sandbox.received('host:ready').at(-1)).toMatchObject({ capabilities: ['a', 'b'] });
  });
});
