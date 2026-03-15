"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";

interface ScrollToBottomFABProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  newMessageCount?: number;
}

export default function ScrollToBottomFAB({ scrollContainerRef, newMessageCount = 0 }: ScrollToBottomFABProps) {
  const [visible, setVisible] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setVisible(distanceFromBottom > el.clientHeight * 2);
  }, [scrollContainerRef]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el.removeEventListener("scroll", checkScroll);
  }, [scrollContainerRef, checkScroll]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [scrollContainerRef]);

  if (!visible) return null;

  return (
    <button
      onClick={scrollToBottom}
      className="absolute right-4 animate-fab-in flex items-center justify-center transition-colors"
      style={{
        bottom: "80px", width: "40px", height: "40px", borderRadius: "50%",
        background: "var(--primary)", boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)", zIndex: 10,
      }}
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="w-5 h-5 text-white" />
      {newMessageCount > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 flex items-center justify-center text-[10px] font-bold text-white"
          style={{
            minWidth: "18px", height: "18px", borderRadius: "9px",
            background: "var(--primary)", border: "2px solid var(--surface-0)", padding: "0 4px",
          }}
        >
          {newMessageCount > 99 ? "99+" : newMessageCount}
        </span>
      )}
    </button>
  );
}
