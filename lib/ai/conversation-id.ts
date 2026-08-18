// One conversationId per browser tab session — session-scoped (sessionStorage,
// same lifecycle as lib/ai/assistant-handoff.ts's pending-prompt handoff),
// not persisted across a browser restart. See lib/ai/conversation-context.ts
// for why: this repo has no chat/session persistence layer, and introducing
// one for a demo-scale in-memory follow-up feature would be the
// over-engineering the rest of this app's AI work has deliberately avoided.
//
// Deliberately NOT reset when the user navigates between dashboards — that
// would defeat the point of cross-dashboard entity continuation (§12 of the
// follow-up feature: "its payment delays?" after a redirect needs the SAME
// conversationId so the server's entity memory follows). DashboardAssistant
// still resets the VISIBLE message list on navigation (unchanged, deliberate
// UX) — only the underlying id persists.

const STORAGE_KEY = "assistant_conversation_id";

/** Reads the current tab's conversationId, creating and persisting one if none exists yet. */
export function getOrCreateConversationId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage unavailable (private mode, quota) — a fresh id every
    // render is a degraded but harmless fallback: follow-ups just won't
    // carry memory, the same as they didn't before this feature existed.
    return crypto.randomUUID();
  }
}

/** "New chat" / "Start over" — the next message gets a fresh id, so the server's stored memory for the old one is simply never looked up again (and ages out on its own TTL). */
export function resetConversationId(): string {
  const fresh = crypto.randomUUID();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, fresh);
    } catch {
      // Best-effort — see getOrCreateConversationId's catch for why this is safe to ignore.
    }
  }
  return fresh;
}

/** Adopts a server-corrected id (e.g. the client sent none, or an invalid one) so subsequent requests stay consistent with what the server actually stored memory under. */
export function adoptConversationId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Best-effort — see getOrCreateConversationId's catch for why this is safe to ignore.
  }
}
