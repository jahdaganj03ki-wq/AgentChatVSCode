import { ChatChunk } from '../providers/base-provider';

export function createStreamController() {
  const abortController = new AbortController();

  return {
    signal: abortController.signal,
    cancel: () => abortController.abort(),
  };
}

export function isStreamCancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}
