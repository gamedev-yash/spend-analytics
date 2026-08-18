// WHICH DASHBOARD THE ASSISTANT IS ON — identity only, no data.
//
// This file used to be the server-only schema-text builder for the six
// built-in dashboards; that moved to lib/ai/dashboard-data-context.ts, which is
// the layer BELOW this one (identity in, queryable data out). What lives here
// is deliberately the smaller, dumber half: a discriminated union naming a
// dashboard, a resolver from a pathname, and a stable string id. No rows, no
// schema, no `server-only` — the client-side DashboardAssistant and the two API
// routes must agree on exactly one notion of "which dashboard", so it has to be
// importable from both sides.
//
// WHY A UNION AND NOT `DashboardKey | string`: the six built-in dashboards are
// a closed set known at compile time (their routes, labels and business scope
// are checked-in constants — lib/ai/dashboard-registry.ts). A custom dashboard
// is the opposite: its identity is a runtime id minted per generated dashboard,
// and nothing about it can be known statically. Widening DashboardKey to
// `string` would have erased that distinction everywhere at once — every
// registry lookup, every dashboards-you-could-redirect-to list, every
// `Record<DashboardKey, ...>` — in exchange for one fewer type. The union keeps
// the built-in side exhaustively checkable (a seventh built-in dashboard is
// still a compile error until every switch handles it) while giving custom
// dashboards their own, genuinely different identity mechanism.

import { DASHBOARD_REGISTRY, type DashboardKey } from "@/lib/ai/dashboard-registry";

/** Route prefix for the generated-dashboard viewer (app/generated/[id]/page.tsx). */
export const CUSTOM_DASHBOARD_ROUTE_PREFIX = "/generated/";

export type DashboardContext =
  | { type: "builtin"; dashboardKey: DashboardKey }
  | { type: "custom"; dashboardId: string };

/**
 * The one identifier everything downstream keys off: conversation memory
 * (lib/ai/conversation-context.ts), the report cache, and debug logging.
 *
 * A template-literal union rather than a bare `string`, so a plain dashboard
 * key ("tail-spend") or a typo'd prefix will not type-check where a context id
 * is expected — the mistake this replaced (`Record<DashboardKey, ...>` keyed
 * memory) is the one it has to keep out.
 */
export type DashboardContextId = `builtin:${DashboardKey}` | `custom:${string}`;

/**
 * Bounds what can be treated as a custom dashboard id before it is used to
 * look anything up. Generated ids are crypto.randomUUID() or the
 * `gen-<ts>-<rand>` fallback (lib/generated-dashboard/store.ts), so this is
 * deliberately narrow: no dots, no slashes, no colons — a colon would let a
 * hostile id forge a `custom:a:b`-shaped context id, and a slash/dot would let
 * one reach the artifact route's path space.
 */
const CUSTOM_DASHBOARD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidCustomDashboardId(value: unknown): value is string {
  return typeof value === "string" && CUSTOM_DASHBOARD_ID_RE.test(value);
}

function isDashboardKey(value: unknown): value is DashboardKey {
  return typeof value === "string" && DASHBOARD_REGISTRY.some((d) => d.key === value);
}

/**
 * THE resolver — the single place a URL becomes a dashboard identity.
 *
 * Returns null only for a route that is not a dashboard at all (the home page,
 * the standalone assistant page). A custom dashboard route with a malformed id
 * also returns null, since there is nothing safe to load from it; note that
 * this is different from "the id looked fine but no such dashboard exists",
 * which is resolved (and failed gracefully) one layer down — see
 * resolveDashboardDataContext in lib/ai/dashboard-data-context.ts.
 */
export function resolveDashboardContext(pathname: string): DashboardContext | null {
  const builtin = DASHBOARD_REGISTRY.find((d) => pathname.startsWith(d.route));
  if (builtin) return { type: "builtin", dashboardKey: builtin.key };

  if (pathname.startsWith(CUSTOM_DASHBOARD_ROUTE_PREFIX)) {
    // Only the first segment after the prefix — a deeper path under a
    // generated dashboard still resolves to that dashboard, mirroring how the
    // built-in branch above matches sub-pages.
    const id = pathname.slice(CUSTOM_DASHBOARD_ROUTE_PREFIX.length).split("/")[0] ?? "";
    return isValidCustomDashboardId(id) ? { type: "custom", dashboardId: id } : null;
  }

  return null;
}

export function dashboardContextId(context: DashboardContext): DashboardContextId {
  return context.type === "builtin" ? `builtin:${context.dashboardKey}` : `custom:${context.dashboardId}`;
}

/** For a built-in dashboard: its own route. For a custom one: its viewer route. */
export function dashboardContextRoute(context: DashboardContext): string {
  return context.type === "builtin"
    ? (DASHBOARD_REGISTRY.find((d) => d.key === context.dashboardKey)?.route ?? "/")
    : `${CUSTOM_DASHBOARD_ROUTE_PREFIX}${context.dashboardId}`;
}

/**
 * The inverse of dashboardContextId, for the one place a context has to survive
 * as a single URL-safe token: the standalone assistant page's `?dashboard=`
 * param ("Open in New Tab").
 *
 * A bare dashboard key is still accepted, so links minted before custom
 * dashboards existed keep working.
 */
export function parseDashboardContextId(value: string | null): DashboardContext | null {
  if (!value) return null;
  if (isDashboardKey(value)) return { type: "builtin", dashboardKey: value };

  const separator = value.indexOf(":");
  if (separator === -1) return null;
  const kind = value.slice(0, separator);
  const rest = value.slice(separator + 1);
  if (kind === "builtin") return isDashboardKey(rest) ? { type: "builtin", dashboardKey: rest } : null;
  if (kind === "custom") return isValidCustomDashboardId(rest) ? { type: "custom", dashboardId: rest } : null;
  return null;
}

/**
 * Parses the wire form both API routes accept. Never trusts the client: an
 * unknown built-in key or a malformed custom id is null, which the routes turn
 * into a 400 rather than a silent fallback to some other dashboard — the
 * "never answer from a dashboard the user isn't on" rule starts here.
 */
export function parseDashboardContext(raw: unknown): DashboardContext | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { type?: unknown; dashboardKey?: unknown; dashboardId?: unknown };
  if (value.type === "builtin") {
    return isDashboardKey(value.dashboardKey) ? { type: "builtin", dashboardKey: value.dashboardKey } : null;
  }
  if (value.type === "custom") {
    return isValidCustomDashboardId(value.dashboardId) ? { type: "custom", dashboardId: value.dashboardId } : null;
  }
  return null;
}
