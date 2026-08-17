"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import type { GenerationStage } from "@/lib/generated-dashboard/generate";
import { cn } from "@/lib/utils";

// Staged progress panel for "Generate Custom Dashboard".
//
// The stages are the pipeline's real ones (see
// lib/generated-dashboard/generate.ts and app/api/generate-dashboard/route.ts),
// but only some of them are observable: profiling and validation happen in the
// browser and report exactly when they finish, while the two Claude calls
// happen inside one opaque POST that returns nothing until both are done. So
// "planning" -> "designing widgets" advances on an estimate rather than a
// signal.
//
// Because of that, this deliberately avoids a percentage or a determinate
// bar: it would be inventing precision the request can't provide. The active
// stage spins until something real moves it on, and says so if it outlasts
// the estimate.
//
// Reading the CSV (or fetching the spend table) isn't listed: both happen
// before field selection, on the step that owns them, and by the time this
// panel appears there are already rows on hand.

interface StageDescriptor {
  id: GenerationStage;
  label: string;
  detail: string;
}

const STAGES: StageDescriptor[] = [
  {
    id: "profile",
    label: "Profiling the fields you picked",
    detail: "Column types, ranges and cardinality — computed here, so raw rows never leave your device.",
  },
  {
    id: "plan",
    label: "Planning the dashboard",
    detail: "Our AI assistant works out what story this data can tell, and which sections it needs.",
  },
  {
    id: "widgets",
    label: "Designing the widgets",
    detail: "Turning that plan into concrete charts, KPIs and tables.",
  },
  {
    id: "finalize",
    label: "Checking it against your columns",
    detail: "Resolving every column reference and picking the opening screen.",
  },
];

/** Past this, the request isn't failing — it's just slow. Say so instead of spinning silently. */
const SLOW_AFTER_SECONDS = 100;

function StageRow({ stage, status }: { stage: StageDescriptor; status: "done" | "active" | "pending" }) {
  return (
    <li className="flex gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          status === "done" && "border-emerald-500 bg-emerald-500 text-white",
          status === "active" && "border-slate-400 text-slate-600 dark:border-slate-500 dark:text-slate-300",
          status === "pending" && "border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600"
        )}
      >
        {status === "done" && <Check className="h-3 w-3" />}
        {status === "active" && <Loader2 className="h-3 w-3 animate-spin" />}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm transition-colors",
            status === "pending"
              ? "text-slate-400 dark:text-slate-600"
              : "font-medium text-slate-800 dark:text-slate-100"
          )}
        >
          {stage.label}
        </p>
        {status === "active" && (
          <motion.p
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-0.5 text-xs text-slate-500 dark:text-slate-400"
          >
            {stage.detail}
          </motion.p>
        )}
      </div>
    </li>
  );
}

/**
 * Renders the pipeline's stages with the current one spinning. Owns nothing
 * but its own elapsed-time counter — the parent drives `stage`, since only it
 * knows when the real work actually finishes.
 */
export function GenerationProgress({ stage }: { stage: GenerationStage }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentIndex = STAGES.findIndex((s) => s.id === stage);

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      {/* Indeterminate, not a progress percentage — see this file's header. */}
      <div className="relative h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <motion.div
          className="h-full w-1/3 rounded-full bg-slate-800 dark:bg-slate-200"
          animate={{ x: ["-110%", "330%"] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <ul className="mt-4 space-y-2.5">
        {STAGES.map((s, index) => (
          <StageRow
            key={s.id}
            stage={s}
            status={index < currentIndex ? "done" : index === currentIndex ? "active" : "pending"}
          />
        ))}
      </ul>

      <p className="mt-3 border-t border-slate-200 pt-2.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {elapsed}s elapsed
        {elapsed >= SLOW_AFTER_SECONDS
          ? " — larger datasets take longer to plan. Still working."
          : " — this usually takes a minute or two."}
      </p>
    </div>
  );
}
