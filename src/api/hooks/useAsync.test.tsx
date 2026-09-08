/* @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAsync } from './useAsync';

function Harness(props: { fn: () => Promise<string> }) {
  const state = useAsync(props.fn, []);
  return (
    <div>
      <span data-testid="auth-failure">{String(state.isAuthFailure)}</span>
    </div>
  );
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

  it('marks auth failures and suppresses automatic focus retries after 401', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

    await act(async () => {
      root.render(<Harness fn={fn} />);
      await flushAsyncWork();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="auth-failure"]')?.textContent).toBe('true');

    await act(async () => {
      vi.advanceTimersByTime(2000);
      window.dispatchEvent(new Event('focus'));
      await flushAsyncWork();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
