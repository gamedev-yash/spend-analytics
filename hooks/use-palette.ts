"use client";

import { useTheme } from "next-themes";
import { getPalette, type ChartPalette } from "@/lib/chart-colors";
import { useHasMounted } from "@/hooks/use-has-mounted";

/**
 * Resolves the active chart palette for the current theme. `resolvedTheme`
 * is undefined until after hydration, so this always renders the light
 * palette on the server/first paint and swaps post-mount — matches the
 * `suppressHydrationWarning` + `disableTransitionOnChange` setup on <html>.
 */
export function usePalette(): ChartPalette {
  const { resolvedTheme } = useTheme();
  const mounted = useHasMounted();

  return getPalette(mounted && resolvedTheme === "dark");
}
