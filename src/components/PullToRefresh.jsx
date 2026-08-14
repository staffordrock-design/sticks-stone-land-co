import React, { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

const THRESHOLD = 70;

// Native-style pull-to-refresh attached to window scroll.
// Only activates when the page is scrolled to the top.
export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    const onTouchStart = (e) => {
      if (window.scrollY > 0 || refreshingRef.current) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };
    const onTouchMove = (e) => {
      if (!pulling.current || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        const distance = Math.min(dy * 0.5, 100);
        pullRef.current = distance;
        setPull(distance);
      } else if (dy <= 0 && pullRef.current !== 0) {
        pullRef.current = 0;
        setPull(0);
      }
    };
    const onTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      const distance = pullRef.current;
      if (distance >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        pullRef.current = THRESHOLD;
        try {
          await onRefresh?.();
        } finally {
          setRefreshing(false);
          setPull(0);
          pullRef.current = 0;
        }
      } else {
        setPull(0);
        pullRef.current = 0;
      }
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh]);

  const offset = refreshing ? THRESHOLD : pull;

  return (
    <>
      <div
        className="pointer-events-none fixed left-1/2 top-0 z-50"
        style={{ transform: `translate(-50%, ${offset}px)` }}
      >
        <div
          className={`mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-md transition-opacity duration-150 ${offset > 0 ? "opacity-100" : "opacity-0"}`}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin text-sky-700" />
          ) : (
            <RefreshCw className="h-4 w-4 text-muted-foreground" style={{ transform: `rotate(${pull * 4}deg)` }} />
          )}
        </div>
      </div>
      {children}
    </>
  );
}