// Shared by both the server's follow-up generator (lib/ai/conversation-context.ts)
// and the client (DashboardAssistant.tsx, lib/ai/conversation-store.ts) so a
// suggestion and a previously-asked question compare equal regardless of
// case/whitespace, without either side needing to import the other's module.
// No "server-only" — this has to run in the browser too.

/**
 * Trim, lowercase, collapse repeated whitespace. Deliberately nothing more
 * aggressive than that (no punctuation stripping, no stemming) — the goal is
 * catching "Show spend by supplier" vs "show   spend by supplier" vs trailing
 * whitespace, not conflating genuinely different questions.
 */
export function normalizeQuestion(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
