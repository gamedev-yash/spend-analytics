"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * `template.tsx` re-mounts on every navigation (unlike layout.tsx), so this
 * gives Summary <-> Compliance an entrance transition without needing
 * AnimatePresence/exit animations across separate server-rendered routes.
 */
export default function SpendOverviewTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
