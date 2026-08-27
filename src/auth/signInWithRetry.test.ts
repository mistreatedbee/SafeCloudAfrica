import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isTransientAuthError, signInWithPasswordRetry } from './signInWithRetry';

const signInWithPasswordMock = vi.fn();

vi.mock('../api/insforge/client', () => ({
  insforge: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args)
    }
  }
}));

describe('signInWithPasswordRetry', () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
  });

  it('returns immediately on successful sign-in', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { accessToken: 'token-1', user: { id: 'user-1' } },
      error: null
    });

    const result = await signInWithPasswordRetry({ email: 'user@example.com', password: 'secret' });
    expect(result.error).toBeNull();
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient 502 errors before giving up', async () => {
    vi.useFakeTimers();
    signInWithPasswordMock
      .mockResolvedValueOnce({ data: null, error: { statusCode: 502, message: 'bad gateway' } })
      .mockResolvedValueOnce({ data: null, error: { statusCode: 502, message: 'bad gateway' } })
      .mockResolvedValueOnce({
        data: { accessToken: 'token-1', user: { id: 'user-1' } },
        error: null
      });

    const pending = signInWithPasswordRetry({ email: 'user@example.com', password: 'secret' });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.error).toBeNull();
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('does not retry invalid credential errors', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: null,
      error: { statusCode: 401, message: 'Invalid credentials' }
    });

    const result = await signInWithPasswordRetry({ email: 'user@example.com', password: 'secret' });
    expect(result.error).toMatchObject({ statusCode: 401 });
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);
  });
});

describe('isTransientAuthError', () => {
  it('detects gateway timeout style failures', () => {
    expect(isTransientAuthError({ statusCode: 503 })).toBe(true);
    expect(isTransientAuthError({ message: 'Failed to fetch' })).toBe(true);
    expect(isTransientAuthError({ statusCode: 401 })).toBe(false);
  });
});
