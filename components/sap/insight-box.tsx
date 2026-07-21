import { Lightbulb } from "lucide-react";

export function InsightBox({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#2a78d6]/25 bg-[#2a78d6]/[0.06] px-4 py-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#2a78d6]" />
      <p className="text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}
