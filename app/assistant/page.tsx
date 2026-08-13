"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardAssistant } from "@/components/ai-assistant/DashboardAssistant";
import { DASHBOARD_REGISTRY, type DashboardKey } from "@/lib/ai/dashboard-registry";

function isDashboardKey(value: string | null): value is DashboardKey {
  return value !== null && DASHBOARD_REGISTRY.some((d) => d.key === value);
}

function AssistantPageContent() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("dashboard");
  // "Open in New Tab" (AssistantHeader/DashboardAssistant) always sends a
  // valid key from whichever dashboard the user was on; this fallback only
  // matters for someone navigating here by hand with no (or a stale) param.
  const dashboardKey = isDashboardKey(requested) ? requested : DASHBOARD_REGISTRY[0].key;

  return <DashboardAssistant standalone standaloneDashboardKey={dashboardKey} />;
}

/**
 * Standalone, full-page AI Assistant (see AssistantHeader's "Open in New Tab"
 * control) — no dashboard sidebar/header behind it (see AppShellGate), and a
 * fresh chat session every time: DashboardAssistant is a brand-new component
 * instance here, and the conversationId it seeds from is sessionStorage-keyed
 * per tab (lib/ai/conversation-id.ts), so a tab opened with `noopener` never
 * inherits the opener's conversation.
 */
export default function AssistantPage() {
  return (
    <Suspense fallback={null}>
      <AssistantPageContent />
    </Suspense>
  );
}
