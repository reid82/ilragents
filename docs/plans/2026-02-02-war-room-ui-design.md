# War Room UI Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the grid-of-cards agent selection with a single-page "war room" interface where a top-down strategy table acts as persistent navigation and chat happens inline - no page transitions between agents.

**Architecture:** New `/war-room` route. Existing home page and `/chat/[agent]` pages stay untouched. The war room page composes a `WarRoomTable` component (SVG + CSS) alongside an inline chat panel. All state comes from existing Zustand stores (chat, session, financial). No new dependencies - pure CSS keyframes + inline SVG + Tailwind.

**Tech Stack:** React 19, Next.js 16, Tailwind v4, Zustand, inline SVG, CSS keyframes

---

### Task 1: Create WarRoomTable component

**Files:**
- New: `packages/web/src/components/WarRoomTable.tsx`
- New: `packages/web/src/components/war-room-table.css`

**Step 1: Create the CSS file with keyframes and effects**

`war-room-table.css` contains styles that Tailwind cannot express (pseudo-element gradients, complex keyframes):

```css
/* Radar sweep - conic gradient wedge rotating continuously */
.radar-sweep {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    var(--sweep-color, rgba(59, 130, 246, 0.3)) 30deg,
    transparent 60deg
  );
  animation: sweep 6s linear infinite;
  pointer-events: none;
}

@keyframes sweep {
  to { transform: rotate(1turn); }
}

/* Pulse ring on active agent seat */
.seat-pulse {
  box-shadow: 0 0 0 0 var(--seat-color, rgba(59, 130, 246, 0.7));
  animation: seatPulse 2s ease-out infinite;
}

@keyframes seatPulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 var(--seat-color, rgba(59, 130, 246, 0.7));
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 10px rgba(0, 0, 0, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
  }
}

/* Scanline overlay - subtle horizontal bars */
.scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent 3px,
    rgba(0, 0, 0, 0.08) 3px,
    rgba(0, 0, 0, 0.08) 6px
  );
  pointer-events: none;
  z-index: 20;
}
```

**Step 2: Create the WarRoomTable React component**

`WarRoomTable.tsx` renders:

1. **Outer container** - relative positioning, dark background with grid overlay
2. **Grid overlay** - inline SVG `<pattern>` for faint green grid lines across the full panel
3. **Table circle** - centred `rounded-full` div with:
   - Radial gradient background (dark centre, slightly lighter rim)
   - 1px border in low-opacity green
   - Concentric range rings via `repeating-radial-gradient` (3-4 rings)
4. **Radar sweep** - child div inside the circle using `.radar-sweep` class, `--sweep-color` set to active agent's colour via inline style
5. **Agent seats** - 5 absolutely positioned elements around the circle circumference:
   - Position calculated in JS: `angle = (2 * Math.PI / 5) * i - Math.PI / 2` (starts from top)
   - `left` and `top` computed with `Math.cos`/`Math.sin` * radius
   - Each seat shows agent initials in a coloured circle
   - Active seat gets `.seat-pulse` class + `--seat-color` CSS variable + scale(1.15)
   - Inactive seats at 60% opacity
   - Hover brightens to full opacity
   - Locked seats (not onboarded) get `grayscale` + `cursor-not-allowed`
6. **HUD corners** - small SVG corner brackets in the panel corners (4 L-shaped lines)
7. **"ACTIVE" label** - tiny text positioned near the active agent seat
8. **Scanlines overlay** - div with `.scanlines` class over the whole panel

Props:
```typescript
interface WarRoomTableProps {
  agents: AgentDef[];
  activeAgentId: string;
  lockedAgentIds: string[];    // agents behind onboarding gate
  onSelectAgent: (agentId: string) => void;
}
```

Baseline Ben is placed at index 0 (12 o'clock position).

**Step 3: Verify the component renders in isolation**

Temporarily import into the existing home page or create a test route. Confirm:
- Circle renders centred in its container
- 5 seats positioned correctly around the circumference
- Radar sweep animates
- Active seat pulses
- Grid + rings visible but subtle

---

### Task 2: Create the War Room page

**Files:**
- New: `packages/web/src/app/war-room/page.tsx`

**Step 1: Create the page with two-panel layout**

Desktop layout (>= 768px):
- Left panel: fixed 320px width, full viewport height, contains `WarRoomTable`
- Right panel: flex-1, contains the chat interface

Mobile layout (< 768px):
- Top strip: horizontal row of agent avatar circles (compact version of the table)
- Below: full-width chat interface

**Step 2: Wire up agent state**

```typescript
const [activeAgentId, setActiveAgentId] = useState("baseline-ben");
const agent = getAgentById(activeAgentId);
```

Switching agents = `setActiveAgentId(newId)`. No routing.

**Step 3: Embed the chat interface**

Port the chat logic from `packages/web/src/app/chat/[agent]/page.tsx` into the right panel. This is the same code - messages display, input form, streaming, voice button, clear button, format selector. It reads from `useChatStore` using `activeAgentId` as the key.

Key differences from the standalone chat page:
- No "Back" link (you're already on the main page)
- Agent header shows smaller - just name + domain + colour dot (the table already shows the full visual)
- `agentSlug` comes from local state, not URL params

**Step 4: Wire onboarding gate**

```typescript
const isOnboarded = useSessionStore((s) => s.isOnboarded);
const facilitatorId = getFacilitator().id;
const lockedAgentIds = isOnboarded
  ? []
  : getAdvisors().map((a) => a.id);
```

Pass `lockedAgentIds` to `WarRoomTable`. When a locked seat is clicked, do nothing (or navigate to `/onboarding`).

If not onboarded, the chat panel defaults to Baseline Ben and shows his "Start Here" messaging.

**Step 5: Wire dev tools**

Add a gear icon button in the bottom-left of the war room panel. Clicking it opens the same test profile selector from the current home page. Reset calls `clearAllChats()` + `financialClear()` + `setOnboarded(false)`.

---

### Task 3: Mobile agent strip

**Files:**
- New: `packages/web/src/components/AgentStrip.tsx`

**Step 1: Create the mobile-only agent strip**

A horizontal scrollable row of agent avatars:
- Each avatar: 40px circle with agent colour + initials
- Active agent: ring border in their colour, full opacity
- Inactive: no ring, 60% opacity
- Locked: grayscale + reduced opacity
- Tap to switch

**Step 2: Integrate into war room page**

```tsx
{/* Desktop */}
<div className="hidden md:block w-80 ...">
  <WarRoomTable ... />
</div>

{/* Mobile */}
<div className="md:hidden ...">
  <AgentStrip ... />
</div>
```

Same props as `WarRoomTable` - just a different visual representation.

---

### Task 4: Extract shared chat panel

**Files:**
- New: `packages/web/src/components/ChatPanel.tsx`
- Modify: `packages/web/src/app/war-room/page.tsx` (use ChatPanel)
- Modify: `packages/web/src/app/chat/[agent]/page.tsx` (use ChatPanel)

**Step 1: Extract chat UI into ChatPanel component**

Pull the messages display, input form, streaming logic, voice modal, format selector, and clear button out of the chat page into a reusable component.

Props:
```typescript
interface ChatPanelProps {
  agentSlug: string;
  agent: AgentDef;
  showBackLink?: boolean;  // true for standalone /chat/[agent], false for war room
}
```

The component handles:
- Reading messages from `useChatStore`
- `streamingText` local state for SSE streaming
- `handleSend()` with history, financial context, format
- Message rendering with markdown + sources
- Voice modal
- Clear button

**Step 2: Refactor the existing chat page to use ChatPanel**

`/chat/[agent]/page.tsx` becomes a thin wrapper:
```tsx
export default function ChatPage({ params }) {
  const { agent: agentSlug } = use(params);
  const agent = getAgentById(agentSlug);
  // ... hydration guard, not-found check ...
  return <ChatPanel agentSlug={agentSlug} agent={agent} showBackLink />;
}
```

This keeps the old route working identically.

**Step 3: Use ChatPanel in the war room page**

The right panel simply renders:
```tsx
<ChatPanel agentSlug={activeAgentId} agent={agent} />
```

---

### Task 5: Build verification and polish

**Files:**
- All files from tasks 1-4

**Step 1: Build check**

```bash
cd packages/web && npm run build
```

Confirm zero type errors.

**Step 2: Visual verification checklist**

Open `/war-room` in the browser and confirm:

- [ ] Table renders centred in left panel with grid background
- [ ] 5 agent seats positioned correctly (Ben at top)
- [ ] Radar sweep animates in active agent's colour
- [ ] Concentric range rings visible
- [ ] Active seat pulses, inactive seats dimmed
- [ ] Clicking a seat switches the chat panel
- [ ] Chat history persists per agent across switches
- [ ] Streaming works (send a message, see tokens arrive)
- [ ] Clear button resets current agent's chat only
- [ ] Locked agents cannot be selected when not onboarded
- [ ] Mobile: agent strip shows instead of table
- [ ] Mobile: tapping avatar switches agent
- [ ] Old routes (`/`, `/chat/[agent]`) still work unchanged

**Step 3: Corner bracket HUD frames**

If not already done in Task 1, add the 4 corner brackets to the war room panel. These are simple SVG L-shapes:

```svg
<!-- Top-left corner -->
<svg class="absolute top-2 left-2 w-4 h-4" viewBox="0 0 16 16">
  <path d="M0 12 V0 H12" fill="none" stroke="rgba(0,255,100,0.3)" stroke-width="1"/>
</svg>
```

Repeat for all 4 corners with appropriate rotation/mirroring.

---

## Files Summary

| File | Change |
|------|--------|
| `packages/web/src/components/WarRoomTable.tsx` | New - SVG/CSS strategy table component |
| `packages/web/src/components/war-room-table.css` | New - keyframes for radar, pulse, scanlines |
| `packages/web/src/app/war-room/page.tsx` | New - single-page war room with table + chat |
| `packages/web/src/components/AgentStrip.tsx` | New - mobile horizontal agent selector |
| `packages/web/src/components/ChatPanel.tsx` | New - extracted reusable chat interface |
| `packages/web/src/app/chat/[agent]/page.tsx` | Modify - refactor to use ChatPanel (keeps working) |
| `packages/web/src/app/page.tsx` | Unchanged |
