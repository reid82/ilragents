# Mobile UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the ILR Advisor web app into a polished, native-feeling mobile experience for iPhones and iPads.

**Architecture:** Modify existing components (layout, chat panel, sidebar, login, onboarding) for mobile-first UX. Create five new components (BottomSheet, ScrollToBottomFAB, MessageContextMenu, WelcomeScreen, QuickReplyChips). All changes are CSS/React -- no backend modifications, no new dependencies.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-12-mobile-ux-redesign-design.md`

---

## File Map

### New Files
| File | Responsibility |
|---|---|
| `packages/web/src/components/BottomSheet.tsx` | Reusable bottom sheet with drag, snap points, backdrop |
| `packages/web/src/components/ScrollToBottomFAB.tsx` | Floating button to scroll to latest message |
| `packages/web/src/components/MessageContextMenu.tsx` | Long-press context menu (Copy, Share) |
| `packages/web/src/components/QuickReplyChips.tsx` | Tappable pill buttons for onboarding structured input |
| `packages/web/src/app/onboarding/welcome/page.tsx` | Post-signup welcome screen with video + checklist |
| `packages/web/src/lib/date-utils.ts` | Date formatting helpers (date dividers, grouping) |

### Modified Files
| File | Changes |
|---|---|
| `packages/web/src/app/globals.css` | New design tokens, animations, safe area utilities, reduced-motion support |
| `packages/web/src/app/layout.tsx` | Add viewport export for safe areas |
| `packages/web/src/app/(advisor)/layout.tsx` | Replace hamburger with compact header, action chips, breakpoint migration |
| `packages/web/src/app/(advisor)/page.tsx` | Update placeholder text, app name |
| `packages/web/src/components/AdvisorChatPanel.tsx` | Textarea conversion, bubble styling, responsive tokens, date dividers |
| `packages/web/src/components/ConversationSidebar.tsx` | Remove mobile drawer, update breakpoints/width, app name |
| `packages/web/src/app/login/page.tsx` | Centered layout, logo glow, form polish |
| `packages/web/src/app/onboarding/page.tsx` | Progress bar, quick-reply chips integration, textarea |

### Test Files
| File | Tests |
|---|---|
| `packages/web/src/lib/date-utils.test.ts` | Date divider logic, date formatting |
| `packages/web/src/components/__tests__/BottomSheet.test.tsx` | Snap point calculation, open/close states |
| `packages/web/src/components/__tests__/QuickReplyChips.test.tsx` | Chip rendering, selection, message sending |

---

## Chunk 1: Foundation -- Design Tokens, Viewport, CSS Utilities

### Task 1: Add design tokens and animations to globals.css

**Files:**
- Modify: `packages/web/src/app/globals.css`

- [ ] **Step 1: Add new design tokens to :root block**

In `globals.css`, add after the `--border-default` line (line 26):

```css
  /* Message surfaces */
  --surface-message: rgba(255, 255, 255, 0.05);
  --border-message: rgba(255, 255, 255, 0.04);
  --surface-data-card: rgba(255, 255, 255, 0.04);
```

- [ ] **Step 2: Remove deprecated `-webkit-overflow-scrolling: touch`**

In `globals.css` line 53, change:
```css
.prose table {
  display: block;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```
to:
```css
.prose table {
  display: block;
  overflow-x: auto;
}
```

- [ ] **Step 3: Add new animations and utilities**

Append to end of `globals.css`:

```css
/* Bottom sheet spring animation */
@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.animate-sheet-up {
  animation: sheet-up 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

/* FAB appear */
@keyframes fab-in {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-fab-in {
  animation: fab-in 0.15s ease-out;
}

/* Context menu scale-up */
@keyframes menu-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-menu-in {
  animation: menu-in 0.15s ease-out;
}

/* Chip select feedback */
@keyframes chip-select {
  0% { transform: scale(1); }
  50% { transform: scale(0.95); }
  100% { transform: scale(1); }
}

.animate-chip-select {
  animation: chip-select 0.15s ease-out;
}

/* Send button press */
@keyframes send-press {
  0% { transform: scale(1); }
  50% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

.animate-send-press {
  animation: send-press 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

/* Input focus glow transition utility */
.input-focus-glow {
  transition: border-color 200ms ease, box-shadow 200ms ease;
}

/* Reduced motion: disable all custom animations and transitions */
@media (prefers-reduced-motion: reduce) {
  .animate-message-in,
  .animate-sheet-up,
  .animate-fab-in,
  .animate-menu-in,
  .animate-chip-select,
  .animate-send-press {
    animation: none !important;
  }
  .input-focus-glow {
    transition: none !important;
  }
  .animate-dot-pulse {
    animation: none !important;
    opacity: 1;
    transform: scale(1);
  }
}

/* Safe area utility */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

- [ ] **Step 4: Verify CSS compiles**

Run: `cd packages/web && npx next build --no-lint 2>&1 | head -20`
Expected: No CSS compilation errors

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/globals.css
git commit -m "feat(mobile): add design tokens, animations, and safe area utilities"
```

---

### Task 2: Add viewport export for safe areas

**Files:**
- Modify: `packages/web/src/app/layout.tsx`

- [ ] **Step 1: Add Viewport import and export**

In `packages/web/src/app/layout.tsx`, change line 1:
```typescript
import type { Metadata } from "next";
```
to:
```typescript
import type { Metadata, Viewport } from "next";
```

Then add after the `metadata` export (after line 20):
```typescript
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/app/layout.tsx
git commit -m "feat(mobile): add viewport config for safe area support"
```

---

### Task 3: Create date utility helpers

**Files:**
- Create: `packages/web/src/lib/date-utils.ts`
- Create: `packages/web/src/lib/date-utils.test.ts`

- [ ] **Step 1: Write failing tests for date utilities**

Create `packages/web/src/lib/date-utils.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDateDividerLabel, shouldShowDateDivider } from './date-utils';

describe('getDateDividerLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today" for today\'s date', () => {
    expect(getDateDividerLabel(new Date('2026-03-12T08:00:00Z'))).toBe('Today');
  });

  it('returns "Yesterday" for yesterday\'s date', () => {
    expect(getDateDividerLabel(new Date('2026-03-11T15:00:00Z'))).toBe('Yesterday');
  });

  it('returns formatted date for older dates', () => {
    expect(getDateDividerLabel(new Date('2026-03-05T12:00:00Z'))).toBe('5 March 2026');
  });

  it('returns formatted date for different year', () => {
    expect(getDateDividerLabel(new Date('2025-12-25T12:00:00Z'))).toBe('25 December 2025');
  });
});

describe('shouldShowDateDivider', () => {
  it('returns true when timestamps are on different calendar days', () => {
    const prev = new Date('2026-03-11T23:00:00Z');
    const curr = new Date('2026-03-12T01:00:00Z');
    expect(shouldShowDateDivider(prev, curr)).toBe(true);
  });

  it('returns false when timestamps are on the same calendar day', () => {
    const prev = new Date('2026-03-12T08:00:00Z');
    const curr = new Date('2026-03-12T14:00:00Z');
    expect(shouldShowDateDivider(prev, curr)).toBe(false);
  });

  it('returns true when prev is null (first message)', () => {
    expect(shouldShowDateDivider(null, new Date('2026-03-12T08:00:00Z'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/web && npx vitest run src/lib/date-utils.test.ts`
Expected: FAIL -- module not found

- [ ] **Step 3: Implement date utilities**

Create `packages/web/src/lib/date-utils.ts`:

```typescript
export function getDateDividerLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function shouldShowDateDivider(
  prevTimestamp: Date | null,
  currTimestamp: Date,
): boolean {
  if (!prevTimestamp) return true;
  const prev = new Date(prevTimestamp.getFullYear(), prevTimestamp.getMonth(), prevTimestamp.getDate());
  const curr = new Date(currTimestamp.getFullYear(), currTimestamp.getMonth(), currTimestamp.getDate());
  return prev.getTime() !== curr.getTime();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web && npx vitest run src/lib/date-utils.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/date-utils.ts packages/web/src/lib/date-utils.test.ts
git commit -m "feat(mobile): add date divider utility helpers with tests"
```

---

## Chunk 2: New Standalone Components

### Task 4: Create BottomSheet component

**Files:**
- Create: `packages/web/src/components/BottomSheet.tsx`

- [ ] **Step 1: Create BottomSheet component**

Create `packages/web/src/components/BottomSheet.tsx`:

```tsx
"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

// Snap points as percentage of viewport height
const SNAP_PARTIAL = 55;
const SNAP_FULL = 95;
const CLOSE_THRESHOLD = 30; // below this % = dismiss
const FULL_THRESHOLD = 75; // above this % = full-screen

export default function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const dragStartY = useRef(0);
  const startHeight = useRef(0);
  const isDragging = useRef(false);
  const [sheetHeight, setSheetHeight] = useState(SNAP_PARTIAL);

  // Focus trap: focus the close button when sheet opens
  useEffect(() => {
    if (isOpen) {
      setSheetHeight(SNAP_PARTIAL);
      // Focus the close button after animation
      const timer = setTimeout(() => firstFocusableRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape and trap Tab focus
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap: cycle Tab within the sheet
      if (e.key === "Tab" && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow drag from the handle area (top 44px of sheet)
    const sheet = sheetRef.current;
    if (!sheet) return;
    const sheetRect = sheet.getBoundingClientRect();
    const touchY = e.touches[0].clientY;
    if (touchY - sheetRect.top > 44) return;

    isDragging.current = true;
    dragStartY.current = e.touches[0].clientY;
    startHeight.current = sheetHeight;
    sheet.style.transition = "none";
  }, [sheetHeight]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    const deltaY = dragStartY.current - e.touches[0].clientY; // positive = dragging up
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
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        className="absolute bottom-0 left-0 right-0 animate-sheet-up pb-safe"
        style={{
          height: `${sheetHeight}vh`,
          background: "var(--surface-1)",
          borderTopLeftRadius: "16px",
          borderTopRightRadius: "16px",
          border: "1px solid var(--border-subtle)",
          borderBottom: "none",
          zIndex: 50,
          transition: "height 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1" style={{ minHeight: "44px" }}>
          <div
            className="rounded-full"
            style={{
              width: "36px",
              height: "4px",
              background: "rgba(255,255,255,0.2)",
            }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h2>
          <button
            ref={firstFocusableRef}
            onClick={onClose}
            className="p-2 -mr-2 transition-colors"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-4" style={{ height: "calc(100% - 80px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -i "BottomSheet" | head -5`
Expected: No errors related to BottomSheet

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/BottomSheet.tsx
git commit -m "feat(mobile): add BottomSheet component with drag-to-dismiss"
```

---

### Task 5: Create ScrollToBottomFAB component

**Files:**
- Create: `packages/web/src/components/ScrollToBottomFAB.tsx`

- [ ] **Step 1: Create ScrollToBottomFAB component**

Create `packages/web/src/components/ScrollToBottomFAB.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";

interface ScrollToBottomFABProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  newMessageCount?: number;
}

export default function ScrollToBottomFAB({
  scrollContainerRef,
  newMessageCount = 0,
}: ScrollToBottomFABProps) {
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
        bottom: "80px",
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        background: "var(--primary)",
        boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
        zIndex: 10,
      }}
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="w-5 h-5 text-white" />
      {newMessageCount > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 flex items-center justify-center text-[10px] font-bold text-white"
          style={{
            minWidth: "18px",
            height: "18px",
            borderRadius: "9px",
            background: "var(--primary)",
            border: "2px solid var(--surface-0)",
            padding: "0 4px",
          }}
        >
          {newMessageCount}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/ScrollToBottomFAB.tsx
git commit -m "feat(mobile): add ScrollToBottomFAB component"
```

---

### Task 6: Create MessageContextMenu component

**Files:**
- Create: `packages/web/src/components/MessageContextMenu.tsx`

- [ ] **Step 1: Create MessageContextMenu component**

Create `packages/web/src/components/MessageContextMenu.tsx`:

```tsx
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

  // Focus the first menu item on mount
  useEffect(() => {
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, []);

  // Close on outside click, Escape, and trap Tab focus
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // Focus trap within menu
      if (e.key === "Tab" && menuRef.current) {
        const items = menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]');
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    onClose();
  }, [text, onClose]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // User cancelled or share failed -- fall back to copy
        await navigator.clipboard.writeText(text);
      }
    } else {
      // No native share API -- copy instead
      await navigator.clipboard.writeText(text);
    }
    onClose();
  }, [text, onClose]);

  // Position the menu, clamping to viewport
  const style: React.CSSProperties = {
    position: "fixed",
    zIndex: 60,
    left: Math.min(position.x, window.innerWidth - 160),
    top: Math.min(position.y, window.innerHeight - 100),
  };

  return (
    <>
      {/* Invisible backdrop for touch dismissal */}
      <div className="fixed inset-0 z-50" onClick={onClose} aria-hidden="true" />
      <div
        ref={menuRef}
        role="menu"
        className="animate-menu-in"
        style={{
          ...style,
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
          borderRadius: "12px",
          border: "1px solid var(--border-subtle)",
          overflow: "hidden",
          minWidth: "140px",
        }}
      >
        <button
          role="menuitem"
          onClick={handleCopy}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors"
          style={{ color: "var(--text-primary)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Copy className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
          Copy text
        </button>
        <div style={{ height: "1px", background: "var(--border-subtle)" }} />
        <button
          role="menuitem"
          onClick={handleShare}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors"
          style={{ color: "var(--text-primary)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Share2 className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
          Share
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/MessageContextMenu.tsx
git commit -m "feat(mobile): add MessageContextMenu with copy and share"
```

---

### Task 7: Create QuickReplyChips component

**Files:**
- Create: `packages/web/src/components/QuickReplyChips.tsx`

- [ ] **Step 1: Create QuickReplyChips component**

Create `packages/web/src/components/QuickReplyChips.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";

interface QuickReplyChipsProps {
  options: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export default function QuickReplyChips({ options, onSelect, disabled }: QuickReplyChipsProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = useCallback(
    (option: string) => {
      if (disabled || selected) return;
      setSelected(option);
      // Brief animation delay before sending
      setTimeout(() => {
        onSelect(option);
      }, 200);
    },
    [disabled, selected, onSelect],
  );

  return (
    <div className="flex flex-wrap gap-2 pl-[38px] mt-2">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => handleSelect(option)}
          disabled={disabled || !!selected}
          className={`text-sm transition-all ${selected === option ? "animate-chip-select" : ""}`}
          style={{
            borderRadius: "20px",
            padding: "10px 16px",
            background:
              selected === option
                ? "var(--primary-subtle)"
                : "var(--surface-2)",
            border: `1px solid ${
              selected === option ? "var(--primary)" : "var(--border-default)"
            }`,
            color:
              selected === option
                ? "var(--primary-light)"
                : "var(--text-secondary)",
            opacity: selected && selected !== option ? 0.4 : 1,
            cursor: disabled || selected ? "default" : "pointer",
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/QuickReplyChips.tsx
git commit -m "feat(mobile): add QuickReplyChips for onboarding"
```

---

## Chunk 3: Layout and Navigation Overhaul

### Task 8: Update advisor layout -- compact header, action chips, breakpoint migration

**Files:**
- Modify: `packages/web/src/app/(advisor)/layout.tsx`

This is the most impactful change. The current layout (90 lines) has a hamburger menu that opens a sidebar drawer. We replace that with:
- A compact header with logo, Roadmap button, and profile avatar (on mobile < 1024px)
- Action chips ("+ New chat" and "History") positioned above the input area (rendered by children, not layout)
- The sidebar only renders on 1024px+ (change from `md` to `lg` breakpoint)

- [ ] **Step 1: Rewrite the advisor layout**

Replace the entire contents of `packages/web/src/app/(advisor)/layout.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import ConversationSidebar from "@/components/ConversationSidebar";
import ProfileModal from "@/components/ProfileModal";
import { useConversationStore } from "@/lib/stores/conversation-store";
import { useClientProfileStore } from "@/lib/stores/financial-store";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const createConversation = useConversationStore((s) => s.createConversation);
  const clearMessages = useConversationStore((s) => s.clearMessages);
  const profile = useClientProfileStore((s) => s.profile);
  const setProfile = useClientProfileStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);

  // Derive initials for avatar
  const initials = (() => {
    if (profile?.personal?.firstName) {
      const first = profile.personal.firstName[0] || "";
      const last = profile.personal.lastName?.[0] || "";
      return (first + last).toUpperCase();
    }
    if (user?.email) return user.email[0].toUpperCase();
    return "?";
  })();

  async function handleNewChat() {
    try {
      clearMessages();
      const newId = await createConversation("New conversation");
      router.push(`/chat/${newId}`);
    } catch {
      router.push("/login");
    }
  }

  async function handleSaveProfile(updated: typeof profile) {
    if (!updated) return;
    setProfile(updated);
    try {
      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: updated }),
      });
    } catch (err) {
      console.error("Failed to save profile to DB:", err);
    }
  }

  return (
    <div
      className="flex h-screen text-white overflow-hidden"
      style={{ background: "var(--surface-0)" }}
    >
      {/* Desktop sidebar -- hidden below 1024px */}
      <div className="hidden lg:flex">
        <ConversationSidebar
          isOpen={false}
          onClose={() => {}}
          onNewChat={handleNewChat}
          onOpenProfile={() => setShowProfile(true)}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile compact header -- visible below 1024px */}
        <div
          className="flex items-center justify-between px-4 flex-shrink-0 lg:hidden"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            height: "48px",
            zIndex: 20,
          }}
        >
          {/* Left: logo + app name */}
          <Link href="/" className="flex items-center gap-2">
            <div
              className="flex items-center justify-center"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, var(--primary), var(--primary-hover))",
              }}
            >
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              ILR Advisor
            </span>
          </Link>

          {/* Right: Roadmap + Profile avatar */}
          <div className="flex items-center gap-2">
            <Link
              href="/roadmap"
              className="px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              Roadmap
            </Link>
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center justify-center rounded-full text-xs font-semibold"
              style={{
                width: "32px",
                height: "32px",
                background: "var(--surface-3)",
                color: "var(--text-primary)",
              }}
              aria-label="Open profile"
            >
              {initials}
            </button>
          </div>
        </div>

        {/* Desktop header -- visible at 1024px+ */}
        <div
          className="hidden lg:flex items-center justify-between px-6 flex-shrink-0"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            height: "48px",
          }}
        >
          <div>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Conversation
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled
              className="px-3 py-1.5 text-xs font-medium rounded-md opacity-40 cursor-not-allowed"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              Export
            </button>
          </div>
        </div>

        {children}
      </div>

      {/* Profile modal */}
      {showProfile && profile && (
        <ProfileModal
          profile={profile}
          onSave={handleSaveProfile}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -i "layout" | head -10`
Expected: No type errors in layout.tsx

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/\(advisor\)/layout.tsx
git commit -m "feat(mobile): replace hamburger nav with compact header and profile avatar"
```

---

### Task 9: Update ConversationSidebar -- remove mobile drawer, update breakpoints

**Files:**
- Modify: `packages/web/src/components/ConversationSidebar.tsx`

The sidebar currently has two rendering modes: a fixed drawer overlay on mobile (`md:hidden`) and a persistent sidebar on desktop (`hidden md:flex`). We need to:
1. Remove the mobile drawer overlay entirely (bottom sheet replaces it)
2. Change `md:` breakpoints to `lg:` (1024px)
3. Update width from 260px to 300px
4. Update app name to "ILR Advisor"
5. Update footer avatar to 32px

- [ ] **Step 1: Read the full ConversationSidebar to understand current structure**

Read `packages/web/src/components/ConversationSidebar.tsx` in its entirety.

- [ ] **Step 2: Remove the mobile drawer overlay**

The mobile drawer overlay is the `isOpen && (...)` block that renders a `fixed inset-0` overlay. Remove this entire block. The sidebar should now only render as the persistent desktop sidebar.

Key changes:
- Remove the `{isOpen && (...)}` conditional block (the mobile drawer)
- The persistent sidebar section: change `hidden md:flex` to `hidden lg:flex`
- Change `w-[260px]` to `w-[300px]`
- Change `"Property Advisor"` to `"ILR Advisor"` (in the sidebar header)
- Change footer avatar from `w-[30px] h-[30px]` to `w-[32px] h-[32px]`
- Remove `isOpen` and `onClose` from the component's props interface (they're now dead code since the mobile drawer is gone). Update the type to only accept `onNewChat` and `onOpenProfile`.
- Update the call site in `(advisor)/layout.tsx` to stop passing `isOpen` and `onClose`

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -i "sidebar\|Sidebar" | head -10`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/ConversationSidebar.tsx
git commit -m "feat(mobile): remove sidebar mobile drawer, update to lg breakpoint and 300px width"
```

---

## Chunk 4: Chat Experience Polish

### Task 10: Update AdvisorChatPanel -- bubbles, textarea, date dividers, FAB, context menu

**Files:**
- Modify: `packages/web/src/components/AdvisorChatPanel.tsx`

This is the largest modification. Changes:
1. Update `ADVISOR_NAME` to `"ILR Advisor"`
2. Remove the existing chat header (lines ~298-339 with format selector, Voice button, Clear button) on mobile. On desktop (1024px+), keep the format selector inline but remove the duplicate header since the layout now provides one.
3. Change `<input>` to `<textarea>` with auto-resize
4. Update `inputRef` type from `HTMLInputElement` to `HTMLTextAreaElement`
5. Update bubble styling to use new design tokens
6. Update border-radius from `2px` to `4px`
7. Update avatar from `34px` to `32px`
8. Update max-width to include tablet breakpoint
9. Update placeholder text
10. Add date dividers between messages
11. Integrate ScrollToBottomFAB
12. Add long-press handler for MessageContextMenu
13. Add input focus glow with box-shadow
14. Update send button styling
15. Add action chips ("+ New chat" and "History") between messages and input on mobile (same as page.tsx pattern). This requires importing `BottomSheet` and adding the `historyOpen` state + conversation list.

**Important: The existing header in AdvisorChatPanel.tsx** contains the format selector (Concise/Standard/Detailed). On mobile, this header should be hidden (the layout provides the header). On desktop, the format selector should be rendered inline near the input or kept in a simplified toolbar - the layout's desktop header already has a placeholder for it. Wrap the existing chat panel header in `hidden lg:flex` and remove redundant elements (the header title/subtitle since the layout handles that). Keep just the format selector buttons in a compact inline bar on desktop.

- [ ] **Step 1: Update imports and constants**

At the top of `AdvisorChatPanel.tsx`:

Add imports:
```typescript
import ScrollToBottomFAB from "@/components/ScrollToBottomFAB";
import MessageContextMenu from "@/components/MessageContextMenu";
import { getDateDividerLabel, shouldShowDateDivider } from "@/lib/date-utils";
```

Change line 24:
```typescript
const ADVISOR_NAME = "ILR Advisor";
```

- [ ] **Step 2: Update inputRef type and add context menu state**

Find `const inputRef = useRef<HTMLInputElement>(null);` and change to:
```typescript
const inputRef = useRef<HTMLTextAreaElement>(null);
```

Add new state for the context menu and scroll container ref:
```typescript
const scrollContainerRef = useRef<HTMLDivElement>(null);
const [contextMenu, setContextMenu] = useState<{ text: string; position: { x: number; y: number } } | null>(null);
const longPressTimer = useRef<NodeJS.Timeout | null>(null);
```

- [ ] **Step 3: Add long-press handlers**

Add these handler functions in the component body:

```typescript
const handleMessageTouchStart = useCallback((e: React.TouchEvent, messageText: string) => {
  const touch = e.touches[0];
  longPressTimer.current = setTimeout(() => {
    setContextMenu({
      text: messageText,
      position: { x: touch.clientX, y: touch.clientY },
    });
  }, 500);
}, []);

const handleMessageTouchEnd = useCallback(() => {
  if (longPressTimer.current) {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }
}, []);

const handleMessageTouchMove = useCallback(() => {
  if (longPressTimer.current) {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }
}, []);
```

- [ ] **Step 4: Add textarea auto-resize handler**

Add this function:
```typescript
const handleTextareaResize = useCallback(() => {
  const textarea = inputRef.current;
  if (!textarea) return;
  textarea.style.height = "auto";
  const maxHeight = 100; // ~5 lines at 14px * 1.5 line-height
  textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + "px";
}, []);
```

- [ ] **Step 5: Update message rendering with date dividers and long-press**

In the messages map, add date dividers. Find the line that maps over messages (the `.map((msg, i)` block). Before each message bubble, add:

```tsx
{/* Date divider */}
{shouldShowDateDivider(
  i > 0 ? new Date(messages[i - 1].createdAt || Date.now()) : null,
  new Date(msg.created_at || Date.now())
) && (
  <div className="flex justify-center my-4">
    <span
      className="text-[11px] px-3 py-1"
      style={{ color: "var(--text-muted)" }}
    >
      {getDateDividerLabel(new Date(msg.created_at || Date.now()))}
    </span>
  </div>
)}
```

Add touch handlers to each message bubble div:
```tsx
onTouchStart={(e) => handleMessageTouchStart(e, displayContent || "")}
onTouchEnd={handleMessageTouchEnd}
onTouchMove={handleMessageTouchMove}
```

- [ ] **Step 6: Update bubble styling**

Change avatar size from `w-[34px] h-[34px]` to `w-[32px] h-[32px]`.

Change assistant bubble border-radius from `rounded-[2px_18px_18px_18px]` to `rounded-[4px_18px_18px_18px]`.

Change user bubble border-radius from `rounded-[18px_18px_2px_18px]` to `rounded-[18px_4px_18px_18px]`.

Change assistant bubble `background: 'var(--surface-2)'` to `background: 'var(--surface-message)'`.

Change assistant bubble `border: '1px solid var(--border-subtle)'` to `border: '1px solid var(--border-message)'`.

Update max-width from `max-w-[90%] sm:max-w-[75%]` to `max-w-[80%] lg:max-w-[70%]`.

- [ ] **Step 7: Add ref to scroll container and integrate FAB**

Add `ref={scrollContainerRef}` to the scrollable messages container div (the `flex-1 overflow-y-auto` div).

Before the closing `</div>` of the scroll container, add:
```tsx
<ScrollToBottomFAB scrollContainerRef={scrollContainerRef} />
```

- [ ] **Step 8: Replace input with textarea**

Replace the `<input>` element with:
```tsx
<textarea
  ref={inputRef}
  value={input}
  onChange={(e) => {
    setInput(e.target.value);
    handleTextareaResize();
  }}
  onKeyDown={(e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }}
  placeholder="Ask your advisor..."
  rows={1}
  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none resize-none"
  style={{ maxHeight: "100px" }}
  autoFocus
/>
```

- [ ] **Step 9: Add input focus glow**

Update the input container's `onFocus` and `onBlur` handlers to also toggle box-shadow:

```typescript
onFocus={(e) => {
  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.06)';
}}
onBlur={(e) => {
  e.currentTarget.style.borderColor = 'var(--border-default)';
  e.currentTarget.style.boxShadow = 'none';
}}
```

Add `transition-all duration-200` to the input container's className.

- [ ] **Step 10: Add bottom safe area padding and keyboard avoidance**

Add `pb-safe` class to the input form container div (the bottom sticky area).

Add a `useEffect` for keyboard avoidance using the `visualViewport` API:
```typescript
useEffect(() => {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const handleResize = () => {
    // When keyboard opens, visualViewport.height shrinks
    const keyboardHeight = window.innerHeight - viewport.height;
    const container = document.querySelector('[data-input-container]') as HTMLElement;
    if (container) {
      container.style.transform = keyboardHeight > 50
        ? `translateY(-${keyboardHeight}px)`
        : '';
    }
  };
  viewport.addEventListener('resize', handleResize);
  return () => viewport.removeEventListener('resize', handleResize);
}, []);
```

Add `data-input-container` attribute to the input form's parent div so the effect can find it.

- [ ] **Step 11: Render context menu**

Before the email draft modal, add:
```tsx
{contextMenu && (
  <MessageContextMenu
    text={contextMenu.text}
    position={contextMenu.position}
    onClose={() => setContextMenu(null)}
  />
)}
```

- [ ] **Step 12: Verify compilation**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -i "AdvisorChat\|error" | head -10`
Expected: No type errors

- [ ] **Step 13: Commit**

```bash
git add packages/web/src/components/AdvisorChatPanel.tsx
git commit -m "feat(mobile): polish chat bubbles, textarea input, date dividers, FAB, context menu"
```

---

### Task 11: Add action chips and bottom sheet to advisor page

**Files:**
- Modify: `packages/web/src/app/(advisor)/page.tsx`

The landing page needs:
1. Action chips ("+ New chat" and "History") above the input on mobile
2. Bottom sheet for conversation history on mobile
3. Update placeholder text and app name references

- [ ] **Step 1: Read current page.tsx**

Read `packages/web/src/app/(advisor)/page.tsx` to understand the full structure.

- [ ] **Step 2: Add imports for BottomSheet and conversation history**

Add to imports:
```typescript
import BottomSheet from "@/components/BottomSheet";
import { Plus, Clock } from "lucide-react";
```

Add state and store subscriptions:
```typescript
const [historyOpen, setHistoryOpen] = useState(false);
const conversations = useConversationStore((s) => s.conversations);
const activeConversationId = useConversationStore((s) => s.activeConversationId);
const clearMessages = useConversationStore((s) => s.clearMessages);
const fetchConversations = useConversationStore((s) => s.fetchConversations);
```

Add a `handleNewChat` function (similar to the one in layout.tsx):
```typescript
async function handleNewChat() {
  try {
    clearMessages();
    const newId = await createConversation("New conversation");
    router.push(`/chat/${newId}`);
  } catch {
    router.push("/login");
  }
}
```

Add a `useEffect` to fetch conversations on mount (needed because the sidebar is hidden on mobile):
```typescript
useEffect(() => {
  fetchConversations();
}, [fetchConversations]);
```

- [ ] **Step 3: Add action chips above the input form (mobile only)**

Before the input form, add (inside a `lg:hidden` wrapper):

```tsx
{/* Action chips -- mobile only */}
<div className="flex gap-1.5 px-4 py-2 lg:hidden">
  <button
    onClick={handleNewChat}
    className="flex items-center gap-1.5 text-xs font-medium px-3 rounded-full"
    style={{
      height: "36px",
      background: "var(--primary-subtle)",
      border: "1px solid var(--primary)",
      color: "var(--primary-light)",
    }}
  >
    <Plus className="w-3.5 h-3.5" />
    New chat
  </button>
  <button
    onClick={() => setHistoryOpen(true)}
    className="flex items-center gap-1.5 text-xs font-medium px-3 rounded-full"
    style={{
      height: "36px",
      background: "var(--surface-2)",
      border: "1px solid var(--border-default)",
      color: "var(--text-secondary)",
    }}
  >
    <Clock className="w-3.5 h-3.5" />
    History
  </button>
</div>
```

- [ ] **Step 4: Add BottomSheet with conversation list**

After the action chips and before the closing tag, add:

```tsx
<BottomSheet
  isOpen={historyOpen}
  onClose={() => setHistoryOpen(false)}
  title="Conversations"
>
  {/* Conversation list -- reuse store data */}
  <div className="space-y-1">
    {conversations.map((conv) => (
      <button
        key={conv.id}
        onClick={() => {
          router.push(`/chat/${conv.id}`);
          setHistoryOpen(false);
        }}
        className="w-full text-left px-3 py-3 rounded-lg transition-colors"
        style={{
          background: conv.id === activeConversationId
            ? "rgba(16, 185, 129, 0.06)"
            : "transparent",
          borderLeft: conv.id === activeConversationId
            ? "3px solid var(--primary)"
            : "3px solid transparent",
        }}
      >
        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {conv.title}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
          {new Date(conv.updated_at).toLocaleDateString()}
        </p>
      </button>
    ))}
  </div>
</BottomSheet>
```

(Store subscriptions and `handleNewChat` already added in Step 2.)

- [ ] **Step 5: Update placeholder text**

Change any remaining `"Ask about property investment..."` to `"Ask your advisor..."`.

- [ ] **Step 6: Verify compilation**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -i "page\|error" | head -10`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/app/\(advisor\)/page.tsx
git commit -m "feat(mobile): add action chips and bottom sheet history to landing page"
```

---

## Chunk 5: Welcome Screen and Onboarding

### Task 12: Create welcome screen

**Files:**
- Create: `packages/web/src/app/onboarding/welcome/page.tsx`

- [ ] **Step 1: Create the welcome page**

Create `packages/web/src/app/onboarding/welcome/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { MessageSquare, Clock } from "lucide-react";

const CHECKLIST = [
  "Your current financial position",
  "Investment goals and timeline",
  "Risk tolerance and preferences",
  "Existing property portfolio (if any)",
];

const VIDEO_URL = process.env.NEXT_PUBLIC_WELCOME_VIDEO_URL || "";

function isEmbedUrl(url: string): boolean {
  return /youtube\.com|youtu\.be|vimeo\.com|player\.vimeo/.test(url);
}

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--surface-0)" }}
    >
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pt-12 pb-40">
        <div className="max-w-md mx-auto space-y-8">
          {/* Logo */}
          <div className="text-center">
            <div
              className="inline-flex items-center justify-center mx-auto"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, var(--primary), var(--primary-hover))",
                boxShadow: "0 8px 32px rgba(16, 185, 129, 0.2)",
              }}
            >
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <h1
              className="text-[22px] font-bold mt-4"
              style={{ color: "var(--text-primary)" }}
            >
              Welcome to ILR Advisor
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Let&apos;s get you set up
            </p>
          </div>

          {/* Video */}
          {VIDEO_URL && (
            <div
              className="relative overflow-hidden"
              style={{
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.06)",
                paddingBottom: "56.25%",
              }}
            >
              {isEmbedUrl(VIDEO_URL) ? (
                <iframe
                  src={VIDEO_URL}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  style={{ border: "none" }}
                />
              ) : (
                <video
                  src={VIDEO_URL}
                  controls
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </div>
          )}

          {/* Explanation */}
          <div>
            <h2
              className="text-[17px] font-semibold mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              Your personalised advisor starts here
            </h2>
            <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
              To give you the best property investment advice, we need to understand your
              financial situation. Think of this as a one-on-one interview with your advisor.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              The more detail you provide, the more tailored and accurate your advice will be.
              Take your time -- this is the foundation everything else builds on.
            </p>
          </div>

          {/* Checklist */}
          <div
            className="p-4"
            style={{
              background: "rgba(255,255,255,0.03)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wider mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              What you&apos;ll cover
            </p>
            <div className="space-y-3">
              {CHECKLIST.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      background: "var(--primary-subtle)",
                      color: "var(--primary-light)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-sm pt-0.5" style={{ color: "var(--text-primary)" }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 pb-safe"
        style={{ zIndex: 20 }}
      >
        <div
          className="pt-6 pb-6"
          style={{
            background: "linear-gradient(to top, var(--surface-0) 60%, transparent)",
          }}
        >
          <div className="max-w-md mx-auto">
            <button
              onClick={() => router.push("/onboarding")}
              className="w-full text-base font-semibold text-white transition-all active:scale-[0.98]"
              style={{
                padding: "16px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, var(--primary), var(--primary-hover))",
                boxShadow: "0 4px 16px rgba(16, 185, 129, 0.2)",
              }}
            >
              Start your profile interview
            </button>
            <p
              className="flex items-center justify-center gap-1.5 text-xs mt-3"
              style={{ color: "var(--text-muted)" }}
            >
              <Clock className="w-3.5 h-3.5" />
              Takes 15-20 minutes if done properly
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -i "welcome\|error" | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/onboarding/welcome/page.tsx
git commit -m "feat(mobile): add welcome screen with video embed and checklist"
```

---

### Task 13: Update onboarding page -- progress bar, quick-reply chips, textarea

**Files:**
- Modify: `packages/web/src/app/onboarding/page.tsx`

Changes:
1. Add progress bar below header
2. Integrate QuickReplyChips component
3. Change `<input>` to `<textarea>` with auto-resize
4. Update inputRef type
5. Add step detection logic

- [ ] **Step 1: Read current onboarding page**

Read `packages/web/src/app/onboarding/page.tsx` to understand the full structure.

- [ ] **Step 2: Add imports and step detection**

Add imports:
```typescript
import QuickReplyChips from "@/components/QuickReplyChips";
```

Add step detection constants and state:
```typescript
const STEP_KEYWORDS = [
  { keywords: ["financial position", "income", "employment", "savings"], step: 1 },
  { keywords: ["goal", "timeline", "objective", "target"], step: 2 },
  { keywords: ["risk", "tolerance", "comfortable", "appetite"], step: 3 },
  { keywords: ["portfolio", "property", "properties", "own"], step: 4 },
];

const CHIP_OPTIONS: Record<string, string[]> = {
  "investment goal": ["Build long-term wealth", "Generate passive income", "Retirement planning", "Portfolio diversification"],
  "risk": ["Conservative", "Moderate", "Aggressive"],
  "experience": ["Complete beginner", "Some knowledge", "Experienced investor"],
  "timeline": ["1-3 years", "3-5 years", "5-10 years", "10+ years"],
};
```

Add state for current step:
```typescript
const [currentStep, setCurrentStep] = useState(1);
```

Add step detection in the message processing (after a new assistant message is fully received):
```typescript
// Detect current onboarding step from latest assistant message
const lastAssistantMsg = messages.filter(m => m.role === "assistant").pop();
if (lastAssistantMsg) {
  const content = lastAssistantMsg.content.toLowerCase();
  for (const { keywords, step } of STEP_KEYWORDS) {
    if (keywords.some(kw => content.includes(kw))) {
      setCurrentStep(step);
      break;
    }
  }
}
```

- [ ] **Step 3: Add progress bar below header**

After the header section, add:
```tsx
{/* Progress bar */}
<div className="relative" style={{ height: "3px", background: "var(--surface-3)" }}>
  <div
    className="absolute left-0 top-0 h-full transition-all duration-300 ease-out"
    style={{
      width: `${(currentStep / 4) * 100}%`,
      background: "linear-gradient(90deg, var(--primary), var(--primary-light))",
    }}
  />
</div>
```

Update the header subtitle to show step:
```tsx
<span className="text-xs" style={{ color: "var(--text-muted)" }}>
  Step {currentStep} of 4
</span>
```

- [ ] **Step 4: Add quick-reply chips after assistant messages**

After rendering an assistant message bubble, check for matching chip options:
```tsx
{msg.role === "assistant" && (() => {
  const content = msg.content.toLowerCase();
  const matchingKey = Object.keys(CHIP_OPTIONS).find(key => content.includes(key));
  if (matchingKey && i === messages.length - 1 && !isLoading) {
    return (
      <QuickReplyChips
        options={CHIP_OPTIONS[matchingKey]}
        onSelect={(value) => {
          setInput(value);
          // Auto-submit after a brief delay
          setTimeout(() => handleSend(value), 100);
        }}
      />
    );
  }
  return null;
})()}
```

**Important:** The existing `handleSend()` reads from the `input` state variable. To support chip auto-submit, modify `handleSend` to accept an optional `overrideMessage` parameter:

```typescript
// Change the existing handleSend signature from:
async function handleSend() {
  const trimmed = input.trim();
// To:
async function handleSend(overrideMessage?: string) {
  const trimmed = (overrideMessage || input).trim();
```

Also update the placeholder text to "Or type your answer..." when chips are visible by using a conditional:
```tsx
placeholder={lastMessageHasChips ? "Or type your answer..." : "Type your answer..."}
```
Where `lastMessageHasChips` is a derived boolean from the chip matching logic.

- [ ] **Step 5: Convert input to textarea**

Same pattern as Task 10 Step 8. Change `<input>` to `<textarea>`, update the ref type, add auto-resize handler, add Enter key handling.

- [ ] **Step 6: Verify compilation**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -i "onboarding\|error" | head -10`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/app/onboarding/page.tsx
git commit -m "feat(mobile): add progress bar and quick-reply chips to onboarding"
```

---

## Chunk 6: Login Polish and Final Integration

### Task 14: Polish login screen for mobile

**Files:**
- Modify: `packages/web/src/app/login/page.tsx`

- [ ] **Step 1: Read current login page**

Read `packages/web/src/app/login/page.tsx`.

- [ ] **Step 2: Update layout and styling**

Key changes (match spec section 8 exactly):
1. Center the form vertically: `flex items-center justify-center min-h-screen`, padding `px-8` (32px horizontal)
2. Add the logo badge with glow: 48px emerald gradient badge (same as welcome screen), use the existing `/ilre-logo.png` if available, otherwise the MessageSquare icon
3. Add `<h1>` title: "ILR Advisor", 24px, bold, `color: var(--text-primary)`
4. Add subtitle: "Your AI property investment advisor", 14px, `color: var(--text-muted)`
5. Labels: `text-[13px] font-medium`, `color: var(--text-muted)`, `mb-1.5` (6px)
6. Inputs: `py-3.5 px-4` (14px vertical, 16px horizontal), `rounded-xl` (12px), `bg-[var(--surface-2)]`, `border border-[var(--border-default)]`
7. Gap between fields: `space-y-3.5` (14px)
8. CTA button: full-width, emerald gradient, `py-4` (16px), `text-[15px] font-semibold`, `rounded-xl` (12px)
9. Sign-up link: centered, `color: var(--text-secondary)` with "Sign up" in `color: var(--primary)`
10. Add `pb-safe` to the container for safe area

- [ ] **Step 3: Verify compilation**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -i "login\|error" | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/app/login/page.tsx
git commit -m "feat(mobile): polish login screen with centered layout and branded logo"
```

---

### Task 15: Update sign-up redirect to welcome screen

**Files:**
- Modify: `packages/web/src/app/login/page.tsx` (or wherever sign-up redirect is handled)

- [ ] **Step 1: Find the sign-up success redirect**

In the login page, find where successful sign-up redirects the user. Change the redirect from `/onboarding` to `/onboarding/welcome`.

- [ ] **Step 2: Verify the route works**

Run: `cd packages/web && ls src/app/onboarding/welcome/`
Expected: `page.tsx` exists

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/login/page.tsx
git commit -m "feat(mobile): redirect new sign-ups to welcome screen"
```

---

### Task 16: Update roadmap page for mobile consistency

**Files:**
- Modify: `packages/web/src/app/(advisor)/roadmap/` (check exact path)

- [ ] **Step 1: Read the roadmap page**

Find and read the roadmap page to understand current structure.

- [ ] **Step 2: Update header to match compact pattern**

Ensure the roadmap page header matches the same compact pattern used in the advisor layout. The roadmap page may already get its header from the layout. If so, just ensure consistent styling and spacing.

- [ ] **Step 3: Remove `-webkit-overflow-scrolling: touch` if used inline**

Check for any inline `-webkit-overflow-scrolling` and remove.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/app/\(advisor\)/roadmap/
git commit -m "feat(mobile): update roadmap page for mobile consistency"
```

---

### Task 17: Verify full build and run tests

- [ ] **Step 1: Run all unit tests**

Run: `cd packages/web && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run development build**

Run: `cd packages/web && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit any fixes**

If any issues were found, fix them and commit:
```bash
git commit -m "fix(mobile): resolve build and test issues"
```

---

### Task 18: Final integration commit

- [ ] **Step 1: Review all changes**

Run: `git diff main --stat`
Verify the changeset looks correct -- no unexpected files, no missing files.

- [ ] **Step 2: Create integration commit if needed**

If there were post-build fixes that span multiple files:
```bash
git add -A
git commit -m "feat(mobile): complete mobile UX redesign integration"
```
