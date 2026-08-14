import { CHART_KIND_LABELS, type WidgetSpec } from "@/types/generated-dashboard";

// Free-text matching for the Add Widget catalog. Plain token containment over
// a flattened haystack — no fuzzy-match dependency, because the thing users
// actually search for is a phrase out of the widget's own title ("payment
// term"), and the columns/measures/section behind it are the useful
// secondary hits.

/**
 * Everything about a widget worth searching, lowercased into one string: its
 * title, the chart kind's human label ("Donut Chart", so "donut" and "chart"
 * both hit), the grouping column, every measure's label and source column,
 * the pivot column and its values, and the heading of the section it belongs
 * to.
 */
export function widgetSearchText(widget: WidgetSpec, sectionHeading?: string): string {
  const parts: string[] = [widget.title, CHART_KIND_LABELS[widget.kind] ?? widget.kind];

  if (widget.dimension) parts.push(widget.dimension);
  if (sectionHeading) parts.push(sectionHeading);

  if (widget.series?.type === "pivot") {
    parts.push(widget.series.dimension, widget.series.measure.label, widget.series.measure.column);
    parts.push(...widget.series.values);
  } else if (widget.series?.type === "measures") {
    for (const item of widget.series.items ?? []) parts.push(item.label, item.column);
  }

  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * True when every whitespace-separated token of `query` appears somewhere in
 * `haystack`. AND rather than OR so that adding a word narrows the list the
 * way users expect ("payment term" shouldn't surface every widget mentioning
 * "payment"); order-independent so "term payment" works too.
 */
export function matchesWidgetQuery(haystack: string, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => haystack.includes(token));
}
