import { stableStringify } from './stableStringify';

export type AutosaveEngineOptions<S> = {
  debounceMs: number;
  skipFirstSave?: boolean;
  /**
   * Persist the provided snapshot.
   * Should throw/reject on failure.
   */
  save: (snapshot: S) => Promise<void>;
};

type PendingSave<S> = {
  key: string;
  snapshot: S;
};

/**
 * Client-side autosave scheduler:
 * - Debounces calls to `save()` based on the last `schedule()` call.
 * - Dedupes based on the last successfully saved key.
 * - Prevents overlapping save calls (latest wins).
 *
 * The engine itself is framework-agnostic; React should live in `useAutosave`.
 */
export class AutosaveEngine<S> {
  private readonly debounceMs: number;
  private readonly skipFirstSave: boolean;
  private readonly saveFn: (snapshot: S) => Promise<void>;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private isSaving = false;

  private lastSavedKey: string | undefined;
  private skipFirstSaveConsumed = false;

  private pending: PendingSave<S> | null = null;
  private lastChangeAt = 0;
  private lastError: unknown = null;

  constructor(options: AutosaveEngineOptions<S>) {
    this.debounceMs = options.debounceMs;
    this.skipFirstSave = Boolean(options.skipFirstSave);
    this.saveFn = options.save;
  }

  reset(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.isSaving = false;
    this.lastSavedKey = undefined;
    this.skipFirstSaveConsumed = false;
    this.pending = null;
    this.lastChangeAt = 0;
    this.lastError = null;
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }

  /**
   * Schedule a save for the latest snapshot.
   * - `key` should change whenever the snapshot changes.
   */
  schedule(key: string, snapshot: S): void {
    if (!key || key === this.lastSavedKey) return;

    // Treat the first snapshot as "already saved" to avoid immediate dirty autosave loops.
    if (this.skipFirstSave && !this.skipFirstSaveConsumed && this.lastSavedKey === undefined) {
      this.lastSavedKey = key;
      this.skipFirstSaveConsumed = true;
      return;
    }

    this.pending = { key, snapshot };
    this.lastChangeAt = Date.now();

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      // If we're currently saving, defer; a new save will be scheduled in `onSaveDone`.
      if (this.isSaving) return;
      void this.savePendingIfNeeded();
    }, this.debounceMs);
  }

  /**
   * Save immediately (ignores debounce). Useful for "Save Draft" buttons.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // If a save is already running, wait for it to finish, then retry with the latest pending snapshot.
    if (this.isSaving) {
      await this.waitForInFlightSaveToFinish();
    }

    await this.savePendingIfNeeded();
  }

  private async waitForInFlightSaveToFinish(): Promise<void> {
    // We don't keep the promise around (avoid memory leaks). Instead, poll on completion.
    // This is only used by `flush()` and is testable with fake timers.
    while (this.isSaving) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  private getPending(): PendingSave<S> | null {
    return this.pending;
  }

  private async savePendingIfNeeded(): Promise<void> {
    if (!this.pending) return;
    if (this.pending.key === this.lastSavedKey) return;

    const captured = this.pending;
    this.pending = null; // clear current pending; new schedule calls will repopulate it
    this.isSaving = true;

    try {
      await this.saveFn(captured.snapshot);
      this.lastSavedKey = captured.key;
    } catch (err) {
      // Intentionally swallow to avoid unhandled rejections from the timer callback.
      this.lastError = err;
    } finally {
      this.isSaving = false;
    }

    // If a newer schedule happened while saving, persist it (debounced from the last change).
    // Read via a method (rather than `this.pending` directly) so TS doesn't carry over the
    // `this.pending = null` narrowing from above the `await` — a schedule() call during the
    // save could have repopulated it.
    const pendingAfterSave = this.getPending();
    if (pendingAfterSave && pendingAfterSave.key !== this.lastSavedKey) {
      const elapsed = Date.now() - this.lastChangeAt;
      const remaining = this.debounceMs - elapsed;
      if (remaining <= 0) {
        void this.savePendingIfNeeded();
      } else {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.savePendingIfNeeded();
        }, remaining);
      }
    }
  }
}

/**
 * Helper to compute a snapshot key with the same logic as `stableStringify`.
 * Exported primarily for debugging and hook usage.
 */
export function computeAutosaveKey(snapshot: unknown): string {
  return stableStringify(snapshot);
}
