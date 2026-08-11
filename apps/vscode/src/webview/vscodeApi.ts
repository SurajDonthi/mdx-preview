import type { WebviewMessage } from '../shared/protocol';

/**
 * `acquireVsCodeApi()` may be called exactly once per webview document, so the
 * handle is taken here and shared.
 */
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api: VsCodeApi | null =
  typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

export function post(message: WebviewMessage): void {
  api?.postMessage(message);
}

/**
 * What VS Code hands back to the panel serializer after a window reload. Only
 * the document identity: the text is re-read from the editor, never from here.
 */
export function rememberDocument(uri: string): void {
  api?.setState({ uri });
}

export function rememberedDocument(): string | null {
  const state = api?.getState() as { uri?: string } | undefined;
  return state?.uri ?? null;
}
