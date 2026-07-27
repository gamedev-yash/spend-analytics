"use client";

import { Lightbulb } from "lucide-react";
import { usePalette } from "@/hooks/use-palette";

export function InsightBox({ text }: { text: string }) {
  const palette = usePalette();
  const blue = palette.categorical.blue;

  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-1.5"
      style={{ borderColor: `${blue}40`, backgroundColor: `${blue}0f` }}
      title={text}
    >
      <Lightbulb className="h-3.5 w-3.5 shrink-0" style={{ color: blue }} />
      <p className="min-w-0 truncate text-xs text-foreground">{text}</p>
    </div>
  );
}
