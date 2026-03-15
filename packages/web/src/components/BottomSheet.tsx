"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const SNAP_PARTIAL = 55;
const SNAP_FULL = 95;
const CLOSE_THRESHOLD = 30;
const FULL_THRESHOLD = 75;

export default function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const dragStartY = useRef(0);
  const startHeight = useRef(0);
  const isDragging = useRef(false);
  const [sheetHeight, setSheetHeight] = useState(SNAP_PARTIAL);

  useEffect(() => {
    if (isOpen) {
      setSheetHeight(SNAP_PARTIAL);
      const timer = setTimeout(() => firstFocusableRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const sheetRect = sheet.getBoundingClientRect();
    if (e.touches[0].clientY - sheetRect.top > 90) return;
    isDragging.current = true;
    dragStartY.current = e.touches[0].clientY;
    startHeight.current = sheetHeight;
    sheet.style.transition = "none";
  }, [sheetHeight]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    const deltaY = dragStartY.current - e.touches[0].clientY;
    const deltaPercent = (deltaY / window.innerHeight) * 100;
    const newHeight = Math.max(10, Math.min(SNAP_FULL, startHeight.current + deltaPercent));
    sheetRef.current.style.height = `${newHeight}vh`;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;
    const currentHeightPx = sheetRef.current.getBoundingClientRect().height;
    const currentPercent = (currentHeightPx / window.innerHeight) * 100;
    sheetRef.current.style.transition = "height 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    if (currentPercent < CLOSE_THRESHOLD) {
      onClose();
    } else if (currentPercent > FULL_THRESHOLD) {
      setSheetHeight(SNAP_FULL);
      sheetRef.current.style.height = `${SNAP_FULL}vh`;
    } else {
      setSheetHeight(SNAP_PARTIAL);
      sheetRef.current.style.height = `${SNAP_PARTIAL}vh`;
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef} role="dialog" aria-label={title} aria-modal="true"
        className="absolute bottom-0 left-0 right-0 animate-sheet-up pb-safe"
        style={{
          height: `${sheetHeight}vh`, background: "var(--surface-1)",
          borderTopLeftRadius: "16px", borderTopRightRadius: "16px",
          border: "1px solid var(--border-subtle)", borderBottom: "none",
          zIndex: 50, transition: "height 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        }}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      >
        <div className="flex justify-center pt-2 pb-1" style={{ minHeight: "44px" }}>
          <div className="rounded-full" style={{ width: "36px", height: "4px", background: "rgba(255,255,255,0.2)" }} />
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
          <button ref={firstFocusableRef} onClick={onClose} className="p-2 -mr-2 transition-colors" style={{ color: "var(--text-secondary)" }} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-4" style={{ height: "calc(100% - 80px)" }}>{children}</div>
      </div>
    </div>
  );
}
