// Hands a pending chat prompt across an assistant-triggered redirect: when a
// question actually belongs to a different dashboard, the assistant there
// shouldn't require retyping it. sessionStorage (not a module-level store)
// because this is a one-shot handoff across a full page navigation, not
// state either widget needs to react to live.

const STORAGE_KEY = "assistant_pending_prompt";

export function stashPendingPrompt(text: string): void {
  if (typeof window === "undefined" || !text.trim()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, text);
  } catch {
    // sessionStorage unavailable (private mode, quota) — the handoff is best-effort.
  }
}

/** Reads and clears the pending prompt, if any — meant to be consumed exactly once. */
export function takePendingPrompt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    if (value) window.sessionStorage.removeItem(STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}
