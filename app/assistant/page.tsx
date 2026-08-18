"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardAssistant } from "@/components/ai-assistant/DashboardAssistant";
import { parseDashboardContextId, type DashboardContext } from "@/lib/ai/dashboard-context";
import { DASHBOARD_REGISTRY } from "@/lib/ai/dashboard-registry";

function AssistantPageContent() {
  const searchParams = useSearchParams();
  // "Open in New Tab" (AssistantHeader/DashboardAssistant) always sends a valid
  // context id from whichever dashboard the user was on — either kind, since
  // parseDashboardContextId understands "builtin:<key>", "custom:<id>", and a
  // bare dashboard key for links minted before generated dashboards had an
  // assistant. The fallback only matters for someone navigating here by hand
  // with no (or a stale) param.
  const requested = searchParams.get("dashboard");
  // Memoized on the raw param so the assistant receives a stable object — see
  // the identity note beside DashboardAssistant's own useMemo.
  const dashboardContext = useMemo<DashboardContext>(
    () => parseDashboardContextId(requested) ?? { type: "builtin", dashboardKey: DASHBOARD_REGISTRY[0].key },
    [requested]
  );

  return <DashboardAssistant standalone standaloneContext={dashboardContext} />;
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
