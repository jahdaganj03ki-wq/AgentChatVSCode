import type { WebviewMessage } from './types';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let vscodeApi: VsCodeApi | null = null;

export function getVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

export function postMessage(message: WebviewMessage): void {
  getVsCodeApi().postMessage(message);
}
