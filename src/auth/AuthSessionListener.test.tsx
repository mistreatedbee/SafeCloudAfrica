/* @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startProactiveSessionRefreshMock = vi.fn();
const stopProactiveSessionRefreshMock = vi.fn();

vi.mock('../api/insforge/ensureSession', () => ({
  startProactiveSessionRefresh: () => startProactiveSessionRefreshMock(),
  stopProactiveSessionRefresh: () => stopProactiveSessionRefreshMock()
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
    startProactiveSessionRefreshMock.mockReset();
    stopProactiveSessionRefreshMock.mockReset();

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

  it('starts proactive session refresh on mount', () => {
    expect(startProactiveSessionRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('does not render a reconnect banner', () => {
    expect(container.textContent).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });

  it('stops proactive session refresh on unmount', async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });

    expect(stopProactiveSessionRefreshMock).toHaveBeenCalledTimes(1);
  });
});
