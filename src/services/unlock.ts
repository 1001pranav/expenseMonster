/**
 * On some phones the fingerprint dialog sends the app to the background and back. Those app-state
 * changes are ours, not the user leaving, so they must not trigger auto-lock again.
 */
let promptOpen = false;
let settledAt = 0;

export function markBiometricPrompt(open: boolean) {
  promptOpen = open;
  if (!open) settledAt = Date.now();
}

export const isOwnBiometricTransition = () => promptOpen || Date.now() - settledAt < 2000;
