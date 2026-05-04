/* @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAsync } from './useAsync';

function Harness(props: { fn: () => Promise<string> }) {
  useAsync(props.fn, []);
  return <div>async</div>;
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useAsync', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('emits auth failure and suppresses automatic focus retries after 401', async () => {
    const authFailureListener = vi.fn();
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));
    window.addEventListener('sca:auth-failure', authFailureListener);

    await act(async () => {
      root.render(<Harness fn={fn} />);
      await flushAsyncWork();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(authFailureListener).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(2000);
      window.dispatchEvent(new Event('focus'));
      await flushAsyncWork();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    window.removeEventListener('sca:auth-failure', authFailureListener);
  });
});
