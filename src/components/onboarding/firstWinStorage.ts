import type { UUID } from '../../api/models/core';
import type { FirstWinPersona } from './firstWinConfig';

export type FirstWinStorageState = {
  dismissed?: boolean;
  /** Epoch ms; hide banner until this time */
  snoozeUntil?: number;
};

function storageKey(companyId: UUID, persona: FirstWinPersona): string {
  return `sca_firstwin_v1:${companyId}:${persona}`;
}

export function readFirstWinState(companyId: UUID, persona: FirstWinPersona): FirstWinStorageState {
  try {
    const raw = localStorage.getItem(storageKey(companyId, persona));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FirstWinStorageState;
    if (parsed.snoozeUntil && Date.now() >= parsed.snoozeUntil) {
      const next = { ...parsed, snoozeUntil: undefined };
      if (!next.dismissed) {
        try {
          localStorage.setItem(storageKey(companyId, persona), JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

export function writeFirstWinState(companyId: UUID, persona: FirstWinPersona, state: FirstWinStorageState): void {
  try {
    localStorage.setItem(storageKey(companyId, persona), JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function dismissFirstWin(companyId: UUID, persona: FirstWinPersona): void {
  writeFirstWinState(companyId, persona, { dismissed: true, snoozeUntil: undefined });
}

export function snoozeFirstWin(companyId: UUID, persona: FirstWinPersona, days: number): void {
  const snoozeUntil = Date.now() + days * 24 * 60 * 60 * 1000;
  writeFirstWinState(companyId, persona, { dismissed: false, snoozeUntil });
}

export function isFirstWinHiddenByStorage(companyId: UUID | null, persona: FirstWinPersona): boolean {
  if (!companyId) return true;
  const s = readFirstWinState(companyId, persona);
  if (s.dismissed) return true;
  if (s.snoozeUntil && Date.now() < s.snoozeUntil) return true;
  return false;
}
