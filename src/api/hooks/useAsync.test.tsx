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

function LoadingHarness(props: { fn: () => Promise<string>; id: string }) {
  const state = useAsync(props.fn, [props.id]);
  return (
    <div>
      <span data-testid="loading">{String(state.loading)}</span>
      <span data-testid="refreshing">{String(state.refreshing)}</span>
      <span data-testid="data">{state.data ?? ''}</span>
      <button data-testid="refresh" onClick={() => state.refresh()} />
    </div>
  );
}

describe('useAsync loading vs background refresh', () => {
  let container: HTMLDivElement;
  let root: Root;
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent;

  beforeEach(() => {
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
  });

  it('keeps loading false during a refresh of data already on screen', async () => {
    let resolveNext: (v: string) => void = () => undefined;
    const fn = vi.fn().mockResolvedValueOnce('first').mockImplementation(
      () => new Promise<string>((resolve) => { resolveNext = resolve; })
    );

    await act(async () => {
      root.render(<LoadingHarness fn={fn} id="a" />);
      await flushAsyncWork();
    });
    expect(text('data')).toBe('first');
    expect(text('loading')).toBe('false');

    await act(async () => {
      (container.querySelector('[data-testid="refresh"]') as HTMLButtonElement).click();
      await flushAsyncWork();
    });
    expect(text('loading')).toBe('false');
    expect(text('refreshing')).toBe('true');
    expect(text('data')).toBe('first');

    await act(async () => {
      resolveNext('second');
      await flushAsyncWork();
    });
    expect(text('data')).toBe('second');
    expect(text('refreshing')).toBe('false');
  });

  it('reports loading when the deps change', async () => {
    const fn = vi.fn().mockResolvedValueOnce('first').mockImplementation(() => new Promise<string>(() => undefined));

    await act(async () => {
      root.render(<LoadingHarness fn={fn} id="a" />);
      await flushAsyncWork();
    });
    expect(text('loading')).toBe('false');

    await act(async () => {
      root.render(<LoadingHarness fn={fn} id="b" />);
      await flushAsyncWork();
    });
    expect(text('loading')).toBe('true');
  });
});
