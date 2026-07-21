"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePalette } from "@/hooks/use-palette";
import type { AccentColor } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  accent?: AccentColor;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Consistent title/description/content shell every chart and table renders inside. */
export function ChartCard({ title, description, icon, accent = "neutral", action, children, className }: ChartCardProps) {
  const palette = usePalette();
  const accentColor = palette.accent(accent);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("h-full", className)}
    >
      <Card className="h-full">
        <CardHeader className="shrink-0 flex-row items-center gap-2.5 space-y-0 border-b py-2.5">
          {icon && (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4"
              style={
                accent !== "neutral"
                  ? { backgroundColor: `${accentColor}1f`, color: accentColor }
                  : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }
              }
            >
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm">{title}</CardTitle>
            {description && <CardDescription className="truncate text-xs">{description}</CardDescription>}
          </div>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden pt-2">{children}</CardContent>
      </Card>
    </motion.div>
  );
}
