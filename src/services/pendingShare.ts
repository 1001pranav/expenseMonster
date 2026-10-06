import { create } from 'zustand';

export interface PendingShare {
  kind: 'image' | 'backup';
  uri: string;
  /** More than one screenshot was shared; only the first is scanned. */
  extra: number;
  /** Times opening it has failed (it is retried, then given up). */
  attempts?: number;
}

/**
 * A screenshot shared to the app, held until it can be opened. Shares often arrive while the app is
 * locked (coming back from GPay / PhonePe / BHIM), so this must not depend on the screens being up.
 */
export const usePendingShare = create<{ pending: PendingShare | null; set: (p: PendingShare) => void; clear: () => void }>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
