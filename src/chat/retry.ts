const RETRYABLE_ERROR_PREFIXES = ['RATE_LIMITED', 'TIMEOUT', 'NETWORK'];
const NON_RETRYABLE_PREFIXES = ['AUTH_FAILED', 'QUOTA_EXCEEDED', 'MODEL_UNAVAILABLE'];

const RETRY_DELAYS = [1000, 2000, 4000];

export function isRetryable(error: Error): boolean {
  return RETRYABLE_ERROR_PREFIXES.some((p) => error.message.startsWith(p));
}

export function getErrorType(error: Error): string {
  return error.message.split(':')[0];
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (!isRetryable(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      const delay = RETRY_DELAYS[attempt] || 4000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
