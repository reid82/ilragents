"use client";

import { useEffect, useRef, useCallback } from "react";
import { Copy, Share2 } from "lucide-react";

interface MessageContextMenuProps {
  text: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export default function MessageContextMenu({ text, position, onClose }: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && menuRef.current) {
        const items = menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]');
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(text); } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text; document.body.appendChild(textarea);
      textarea.select(); document.execCommand("copy"); document.body.removeChild(textarea);
    }
    onClose();
  }, [text, onClose]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { await navigator.clipboard.writeText(text); }
    } else { await navigator.clipboard.writeText(text); }
    onClose();
  }, [text, onClose]);

  const MENU_WIDTH = 160;
  const MENU_HEIGHT = 100;

  const style: React.CSSProperties = {
    position: "fixed", zIndex: 60,
    left: Math.max(8, Math.min(position.x, typeof window !== "undefined" ? window.innerWidth - MENU_WIDTH - 8 : position.x)),
    top: Math.max(8, Math.min(position.y, typeof window !== "undefined" ? window.innerHeight - MENU_HEIGHT - 8 : position.y)),
  };

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} aria-hidden="true" />
      <div
        ref={menuRef} role="menu" className="animate-menu-in"
        style={{
          ...style, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)",
          borderRadius: "12px", border: "1px solid var(--border-subtle)", overflow: "hidden", minWidth: "140px",
        }}
      >
        <button role="menuitem" onClick={handleCopy}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCopy(); } }}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors"
          style={{ color: "var(--text-primary)" }}
        >
          <Copy className="w-4 h-4" style={{ color: "var(--text-secondary)" }} /> Copy text
        </button>
        <div style={{ height: "1px", background: "var(--border-subtle)" }} />
        <button role="menuitem" onClick={handleShare}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleShare(); } }}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors"
          style={{ color: "var(--text-primary)" }}
        >
          <Share2 className="w-4 h-4" style={{ color: "var(--text-secondary)" }} /> Share
        </button>
      </div>
    </>
  );
}
