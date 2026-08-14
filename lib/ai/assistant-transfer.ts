// Seamless "Open in New Tab" continuation: without this, the standalone
// /assistant page always started a brand-new conversation (see its own doc
// comment) even when the user was mid-conversation on the dashboard popover.
//
// Deliberately localStorage, not sessionStorage. The "Open in New Tab" click
// still passes `noopener,noreferrer` to window.open (see DashboardAssistant's
// openInNewTab and conversation-id.ts for why that isolation is kept) —
// noopener means the new tab does NOT inherit a clone of this tab's
// sessionStorage, so a sessionStorage key written here would never be visible
// there. localStorage has no such per-tab/opener scoping — it's shared
// origin-wide regardless — making it the only reliable one-shot relay
// between the two tabs.

import type { ChatEntry } from "@/components/ai-assistant/DashboardAssistant";
import type { DashboardContextId } from "./dashboard-context";

const STORAGE_KEY = "vedata_assistant_transfer_state";

export interface AssistantTransferState {
  /**
   * Which dashboard the conversation was captured on — a DashboardContextId
   * ("builtin:tail-spend" / "custom:abc123") rather than a DashboardKey, so the
   * handoff works from a generated dashboard as well as a built-in one. Same
   * one-shot, mismatch-discarding contract either way; it is only the naming of
   * "which dashboard" that had to widen (see lib/ai/dashboard-context.ts).
   */
  contextId: DashboardContextId;
  messages: ChatEntry[];
  conversationId: string;
  reportMode: boolean;
  input: string;
}

export function stashTransferState(state: AssistantTransferState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota/unavailable — the new tab just starts a fresh conversation, same as before this feature existed.
  }
}

/** Reads and clears the transferred state, if any — meant to be consumed exactly once, and only by the dashboard it was captured from (a mismatched dashboard is discarded rather than bleeding into the wrong dashboard's transcript). */
export function takeTransferState(contextId: DashboardContextId): AssistantTransferState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as AssistantTransferState;
    return parsed.contextId === contextId ? parsed : null;
  } catch {
    return null;
  }
}
