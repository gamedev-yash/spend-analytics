"use client";

import { useCallback, useRef, useState } from "react";

export interface DraggablePosition {
  x: number;
  y: number;
}

const DRAG_THRESHOLD_PX = 4;

/**
 * Lets a fixed-position floating element (the AI bubble) be dragged anywhere
 * on screen. `position` is null until the first drag, meaning "use the
 * caller's default CSS corner" — callers keep their own bottom/right classes
 * until then. A small movement threshold distinguishes an actual drag from a
 * plain tap, so the bubble still opens/closes on click via
 * `suppressClickAfterDrag`.
 */
export function useDraggableBubble() {
  const [position, setPosition] = useState<DraggablePosition | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    draggingRef.current = true;
    movedRef.current = false;
    startRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    const { pointerX, pointerY, offsetX, offsetY } = startRef.current;
    const dx = e.clientX - pointerX;
    const dy = e.clientY - pointerY;
    if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    movedRef.current = true;

    const el = e.currentTarget;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Math.min(Math.max(8, e.clientX - offsetX), window.innerWidth - w - 8);
    const y = Math.min(Math.max(8, e.clientY - offsetY), window.innerHeight - h - 8);
    setPosition({ x, y });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  /** Wrap a click handler so a drag-release doesn't also fire it as a click. */
  const suppressClickAfterDrag = useCallback(
    (handler: () => void) => () => {
      if (movedRef.current) {
        movedRef.current = false;
        return;
      }
      handler();
    },
    []
  );

  return { position, onPointerDown, onPointerMove, onPointerUp, suppressClickAfterDrag };
}
