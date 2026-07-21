import { Lightbulb } from "lucide-react";

export function InsightBox({ text }: { text: string }) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md border border-[#2a78d6]/25 bg-[#2a78d6]/[0.06] px-3 py-1.5"
      title={text}
    >
      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-[#2a78d6]" />
      <p className="min-w-0 truncate text-xs text-foreground">{text}</p>
    </div>
  );
}
