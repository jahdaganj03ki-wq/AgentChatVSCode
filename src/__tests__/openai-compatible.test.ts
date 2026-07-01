import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider } from '../providers/openai-compatible';
import { ProviderConfig } from '../providers/base-provider';

const mockConfig: ProviderConfig = {
  id: 'test',
  name: 'Test Provider',
  baseUrl: 'https://api.test.com/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  maxTokens: 4096,
  temperature: 0.7,
  enabled: true,
};

describe('OpenAICompatibleProvider', () => {
  let provider: OpenAICompatibleProvider;

  beforeEach(() => {
    provider = new OpenAICompatibleProvider(mockConfig);
  });

  describe('providerId', () => {
    it('returns the config id', () => {
      expect(provider.providerId).toBe('test');
    });
  });

  describe('buildHeaders', () => {
    it('includes authorization header when apiKey is set', () => {
      const headers = provider['buildHeaders']();
      expect(headers['Authorization']).toBe('Bearer sk-test');
    });

    it('content-type is application/json', () => {
      const headers = provider['buildHeaders']();
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('fetchModels', () => {
    it('throws when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('unauthorized'),
      });
      await expect(provider.fetchModels()).rejects.toThrow('Failed to fetch models: 401');
    });

    it('parses model list', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'gpt-4', object: 'model' },
            { id: 'gpt-3.5-turbo', object: 'model' },
          ],
        }),
      });
      const models = await provider.fetchModels();
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('gpt-4');
      expect(models[0].provider).toBe('test');
    });
  });

  describe('parseError', () => {
    it('maps 401 to AUTH_FAILED', () => {
      const err = provider['parseError'](401, 'unauthorized');
      expect(err.message).toContain('AUTH_FAILED');
    });

    it('maps 429 to RATE_LIMITED', () => {
      const err = provider['parseError'](429, 'too fast');
      expect(err.message).toContain('RATE_LIMITED');
    });

    it('maps unknown status to NETWORK', () => {
      const err = provider['parseError'](500, 'server error');
      expect(err.message).toContain('NETWORK');
    });
  });
});
