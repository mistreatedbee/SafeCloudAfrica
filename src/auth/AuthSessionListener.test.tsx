/* @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
};

const authState: AuthState = {
  isLoaded: true,
  isSignedIn: true
};

const flushAllDraftsMock = vi.fn().mockResolvedValue(undefined);
const httpClientState = {
  authorization: ''
};

vi.mock('@insforge/react', () => ({
  useAuth: () => authState
}));

vi.mock('../session/DraftManagerProvider', () => ({
  useDraftManager: () => ({
    flushAllDrafts: flushAllDraftsMock
  })
}));

vi.mock('../api/insforge/client', () => ({
  insforge: {
    getHttpClient: () => ({
      getHeaders: () =>
        httpClientState.authorization
          ? { Authorization: httpClientState.authorization }
          : {}
    })
  }
}));

import { AuthSessionListener } from './AuthSessionListener';

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AuthSessionListener', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    authState.isLoaded = true;
    authState.isSignedIn = true;
    flushAllDraftsMock.mockReset();
    flushAllDraftsMock.mockResolvedValue(undefined);
    httpClientState.authorization = '';
    sessionStorage.clear();

    await act(async () => {
      root.render(<AuthSessionListener />);
      await flushAsyncWork();
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
  });

  it('sets the expired-session banner after a real signed-in to signed-out transition', async () => {
    authState.isSignedIn = false;

    await act(async () => {
      root.render(<AuthSessionListener />);
      await flushAsyncWork();
    });

    expect(flushAllDraftsMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('sca_session_expired')).toBe('1');
    expect(sessionStorage.getItem('sca_session_expired_message')).toBe('Your session expired. Please log in again.');
  });

  it('does not set the expired-session banner when a client token is still present', async () => {
    httpClientState.authorization = 'Bearer transient-token';
    authState.isSignedIn = false;

    await act(async () => {
      root.render(<AuthSessionListener />);
      await flushAsyncWork();
    });

    expect(flushAllDraftsMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('sca_session_expired')).toBeNull();
    expect(sessionStorage.getItem('sca_session_expired_message')).toBeNull();
  });
});
