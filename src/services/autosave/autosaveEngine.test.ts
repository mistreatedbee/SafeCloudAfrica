import { describe, it, expect, vi } from 'vitest';
import { stableStringify } from './stableStringify';
import { AutosaveEngine } from './AutosaveEngine';

describe('stableStringify', () => {
  it('sorts object keys to prevent spurious diffs', () => {
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toEqual(b);
  });

  it('serializes Date values deterministically', () => {
    const d = new Date('2020-01-01T00:00:00.000Z');
    expect(stableStringify({ d })).toContain(d.toISOString());
  });

  it('serializes File-like objects by metadata', () => {
    const fileLike = { name: 'x.xlsx', size: 123, type: 'application/vnd.ms-excel', lastModified: 7 };
    const out = stableStringify({ fileLike });
    expect(out).toContain('"__type":"File"');
    expect(out).toContain('"name":"x.xlsx"');
    expect(out).toContain('"size":123');
    expect(out).toContain('"type":"application/vnd.ms-excel"');
  });
});

describe('AutosaveEngine', () => {
  it('debounces and calls save once after user stops changing', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const engine = new AutosaveEngine({ debounceMs: 500, skipFirstSave: false, save });

    engine.schedule('k1', 's1');
    vi.advanceTimersByTime(400);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('s1');
    vi.useRealTimers();
  });

  it('dedupes based on last successfully saved key', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const engine = new AutosaveEngine({ debounceMs: 100, skipFirstSave: false, save });

    engine.schedule('k1', 's1');
    vi.advanceTimersByTime(120);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    engine.schedule('k1', 's1_again');
    vi.advanceTimersByTime(200);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('saves the latest snapshot if the key changes again before debounce fires', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const engine = new AutosaveEngine({ debounceMs: 300, skipFirstSave: false, save });

    engine.schedule('k1', 's1');
    vi.advanceTimersByTime(150);
    engine.schedule('k2', 's2');
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('s2');
    vi.useRealTimers();
  });

  it('skipFirstSave treats the first observed key as baseline', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const engine = new AutosaveEngine({ debounceMs: 100, skipFirstSave: true, save });

    engine.schedule('k1', 's1');
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();

    engine.schedule('k2', 's2');
    vi.advanceTimersByTime(120);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('s2');
    vi.useRealTimers();
  });

  it('queues a newer snapshot while a save is in-flight (latest wins)', async () => {
    vi.useFakeTimers();

    let resolve1!: () => void;
    let resolve2!: () => void;

    const save = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((res) => (resolve1 = res)))
      .mockImplementationOnce(() => new Promise<void>((res) => (resolve2 = res)));

    const engine = new AutosaveEngine({ debounceMs: 300, skipFirstSave: false, save });

    engine.schedule('k1', 's1');
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('s1');

    engine.schedule('k2', 's2');
    vi.advanceTimersByTime(100);

    // Finish first save; engine should schedule second save based on debounce remainder.
    resolve1();
    await Promise.resolve();

    vi.advanceTimersByTime(200);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('s2');

    resolve2();
    vi.useRealTimers();
  });
});

