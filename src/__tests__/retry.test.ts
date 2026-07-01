import { describe, it, expect, vi } from 'vitest';
import { isRetryable, getErrorType, withRetry } from '../chat/retry';

describe('retry', () => {
  describe('isRetryable', () => {
    it('returns true for RATE_LIMITED errors', () => {
      expect(isRetryable(new Error('RATE_LIMITED: too many requests'))).toBe(true);
    });

    it('returns true for NETWORK errors', () => {
      expect(isRetryable(new Error('NETWORK: connection refused'))).toBe(true);
    });

    it('returns false for AUTH_FAILED', () => {
      expect(isRetryable(new Error('AUTH_FAILED: invalid key'))).toBe(false);
    });

    it('returns false for QUOTA_EXCEEDED', () => {
      expect(isRetryable(new Error('QUOTA_EXCEEDED: limit reached'))).toBe(false);
    });
  });

  describe('getErrorType', () => {
    it('extracts error type prefix', () => {
      expect(getErrorType(new Error('RATE_LIMITED: retry later'))).toBe('RATE_LIMITED');
    });

    it('returns full message for unknown format', () => {
      expect(getErrorType(new Error('unknown error'))).toBe('unknown error');
    });
  });

  describe('withRetry', () => {
    it('succeeds on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await withRetry(fn);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error then succeeds', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('RATE_LIMITED: slow down'))
        .mockResolvedValueOnce('ok');
      const result = await withRetry(fn, 2);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('RATE_LIMITED: always'));
      await expect(withRetry(fn, 2)).rejects.toThrow('RATE_LIMITED');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('AUTH_FAILED: bad key'));
      await expect(withRetry(fn, 3)).rejects.toThrow('AUTH_FAILED');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
