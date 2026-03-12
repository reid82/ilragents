# Mobile UX Redesign - Design Spec

**Date:** 2026-03-12
**Status:** Draft
**Goal:** Transform the ILR Advisor web app into a polished, native-feeling mobile experience for clients on iPhones and iPads.

---

## Context

ILR Advisor is a client-facing AI property investment advisor. The chat experience is the primary interface. Clients are predominantly on modern iPhones (390px+) and iPads. The app is about to ship to clients and needs to feel like a polished native app, not a responsive website.

The existing codebase uses Next.js 16, React 19, Tailwind CSS 4, and custom components (no UI library). The dark theme with emerald accent is established. The current mobile experience has basic responsiveness but lacks native-feeling interactions, proper touch patterns, and optimised layouts.

---

## Responsive Breakpoints

| Breakpoint | Target | Layout |
|---|---|---|
| < 768px | iPhone | Hybrid header, action chips, bottom sheet history |
| 768px - 1023px | iPad portrait | Same as iPhone but wider message bubbles (70% max-width) |
| 1024px+ | iPad landscape / desktop | Persistent 300px sidebar, no chips or bottom sheet |

---

## 1. Navigation Pattern: Hybrid Header + Contextual Action Chips

### Migration from Current Architecture

The current mobile navigation uses a hamburger menu in `layout.tsx` that triggers a left-drawer overlay in `ConversationSidebar.tsx`. This redesign replaces that pattern entirely on mobile:

- **Remove:** `sidebarOpen` state and hamburger `Menu` button from `layout.tsx` on mobile (< 1024px)
- **Remove:** The mobile drawer overlay in `ConversationSidebar.tsx` (the `md:hidden` fixed overlay with backdrop)
- **Replace with:** `BottomSheet.tsx` component with its own `isOpen` state, triggered by the "History" action chip
- **Keep:** The persistent sidebar rendering in `ConversationSidebar.tsx` for 1024px+ (but change breakpoint from `md` to `lg`)
- **Breaking change:** Sidebar width changes from 260px to 300px on desktop/tablet. Sidebar breakpoint changes from `md` (768px) to `lg` (1024px). This means iPad portrait users who previously saw a persistent sidebar will now get the iPhone-style layout with bottom sheet. This is intentional -- the 768px sidebar was cramped on iPad portrait and the bottom sheet is a better experience at that width.

### iPhone (< 1024px)

**Header (compact):**
- Left: 32px logo (IL badge, gradient emerald, 10px border-radius) + "ILR Advisor" label
- Right: "Roadmap" button (pill, subtle border) + Profile avatar (32px circle, initials derived from user's email prefix -- e.g. "reid@..." shows "R"; if `firstName`/`lastName` exist in profile, use those instead)
- Height: ~48px plus status bar
- Border bottom: 1px solid `var(--border-subtle)`

**Action chips (above input):**
- Positioned between messages area and text input
- Two chips: "+ New chat" (emerald tint, emerald border) and "History" (neutral)
- Chip height: 36px visual, 44px touch target via padding
- Horizontal layout with 6px gap

**Format selector (Concise/Standard/Detailed):** Hidden on mobile. Uses the default format. Can be accessed through Profile settings if needed.

**No hamburger menu.** Everything is one tap away without hidden drawers.

### iPad landscape / Desktop (1024px+)

**Persistent sidebar (300px):**
- Header: Logo + app name + "New chat" button
- Search input below header
- Conversation list with time-based grouping (Today, Yesterday, Last 7 Days, Older) -- matches existing grouping logic in `ConversationSidebar.tsx`
- Active conversation: emerald left border + green tint background
- Footer: Profile avatar + name + "View profile" link + "Roadmap" button
- Border right: 1px solid `var(--border-subtle)`

**Chat header (simplified):**
- Shows conversation title + "Started today at [time]" subtitle
- Right: Format selector (Concise/Standard/Detailed) + "Export" button
- No logo/branding (lives in sidebar)

---

## 2. Chat Experience

### Message Bubbles

**Design token updates (globals.css):**
- Add `--surface-message: rgba(255,255,255,0.05)` (assistant bubble background, replacing current `var(--surface-2)` which is 0.03)
- Add `--border-message: rgba(255,255,255,0.04)` (assistant bubble border)
- Add `--surface-data-card: rgba(255,255,255,0.04)` (inline data cards)

**Assistant messages:**
- Left-aligned with 32px avatar (unchanged from current `w-[34px] h-[34px]`, adjusted to 32px for consistency)
- Avatar: IL badge with emerald gradient, `rounded-full` (keeping existing circular shape -- intentionally not changing to rounded squares)
- Bubble: `background: var(--surface-message)`, `border: 1px solid var(--border-message)`
- Border radius: `4px 18px 18px 18px` (flat top-left corner indicates direction, changed from current `2px` to `4px` for slightly softer look)
- Padding: 12px 16px (iPhone), 14px 18px (tablet)
- Max width: 80% (iPhone), 70% (tablet)
- Font: 14px, line-height 1.5, color `var(--text-primary)`

**User messages:**
- Right-aligned, no avatar
- Bubble: `background: linear-gradient(135deg, var(--primary), var(--primary-hover))`
- Border radius: `18px 4px 18px 18px` (flat top-right corner)
- Same padding and max-width rules
- Font: 14px, white text

**Structured data in messages:**
- Stats/metrics render as inline cards within assistant bubbles
- Card: `background: var(--surface-data-card)`, `border-radius: 10px`, `padding: 10px 12px`
- Each row: flex space-between with label (`var(--text-secondary)`) and value (`var(--text-primary)` or `var(--primary)` for growth metrics)
- Keeps financial data scannable without leaving the conversation

**Date dividers:**
- Centered text, color `var(--text-muted)`, font-size 11px
- "Today", "Yesterday", or date format

**Message spacing:** 16px gap between messages (iPhone), 18px (tablet)

### Thinking Indicator
- 3-dot pulse animation in an assistant bubble (existing, keep as-is)
- Input shows "Advisor is thinking..." with spinner in send button area

---

## 3. Bottom Sheet - Conversation History

Triggered by tapping "History" action chip. (Swipe-right gesture removed -- conflicts with iOS Safari's native back-navigation gesture on iPhones.)

### Partial Reveal (default)
- Height: ~55% of viewport
- Dark backdrop: `rgba(0,0,0,0.4)`
- Chat content visible but dimmed behind
- Drag handle: 36px wide, 4px tall, `rgba(255,255,255,0.2)`, centered
- Header: "Conversations" title + close (X) button
- Search input below header
- Shows 3-4 most recent conversations

### Snap Points
- Below 30% viewport height: snaps closed (dismiss)
- Between 30% and 75%: snaps to 55% (partial reveal)
- Above 75%: snaps to full-screen

### Full Expand (drag up)
- Fills viewport below status bar
- Time-based grouping: "Today", "Yesterday", "Last 7 Days", "Older" (matches existing `ConversationSidebar.tsx` grouping logic)
- Section labels: 11px uppercase, letter-spacing 0.5px, `var(--text-muted)`

### Conversation List Items
- Row height: 48px+
- Title: 14px, font-weight 500, `var(--text-primary)`
- Preview: 12px, truncated single line, `var(--text-muted)`
- Timestamp: 11px, right-aligned, `var(--text-muted)`
- Active conversation: emerald left border (3px) + `rgba(16, 185, 129, 0.06)` background

### Interactions
- Swipe down or tap backdrop: dismiss
- Swipe left on conversation item: reveal red delete action
- Spring animation: mass 1, stiffness 300, damping 30 (slight bounce)
- Tap conversation: load it, dismiss sheet

---

## 4. Input Area

**Breaking change:** The current `<input type="text">` in both `AdvisorChatPanel.tsx` and `page.tsx` must be changed to `<textarea>` with auto-resize logic to support multi-line expansion. This requires updating the input element, adding a resize handler that calculates scrollHeight, and capping at 5 lines.

### States

**Empty:**
- Pill shape: border-radius 22px
- Border: 1px solid `var(--border-default)`
- Background: `var(--surface-2)`
- Placeholder: "Ask your advisor...", color `var(--text-muted)`
- Send button: 32px circle, dimmed gray, arrow icon

**Focused + typing:**
- Border: 1px solid `rgba(16, 185, 129, 0.3)`
- Box shadow: `0 0 0 3px rgba(16, 185, 129, 0.06)` (emerald glow)
- Send button: background `var(--primary)`, white arrow icon
- Transition: 200ms ease for border/shadow/button color

**Multi-line:**
- Auto-expands up to 5 lines (~100px based on 14px font, 1.5 line-height)
- Border radius reduces to 18px when expanded
- Send button aligns to bottom-right (flex-end)
- Beyond 5 lines: content scrolls within textarea

**Streaming/disabled:**
- Opacity 0.6
- Placeholder: "Advisor is thinking..."
- Send button: shows spinner (border animation)

### Sizing
- Min height: 48px (matches 44px touch target + padding)
- Padding: 12px horizontal, 12px vertical
- Font: 14px
- Bottom padding: `env(safe-area-inset-bottom)` for iPhone home indicator

---

## 5. Touch Interactions & Gestures

### Long Press on Message
- Triggers after 500ms hold
- Shows context menu with subtle scale-up animation
- Options: Copy text, Share (triggers native `navigator.share()` API on iOS -- shares message text; falls back to clipboard copy on desktop)
- Menu: `background: rgba(255,255,255,0.06)`, rounded corners, items separated by subtle borders
- Tap outside or swipe to dismiss

### Scroll-to-Bottom FAB
- Appears when scrolled up past 2 viewport heights
- Emerald circle with down arrow
- Fade in/out with scale animation
- Shows unread count badge (emerald pill) if new messages arrived while scrolled up
- Position: bottom-right, 16px from edges, above input area

### Touch Targets
All interactive elements meet Apple HIG 44x44px minimum:
- Send button: 44px touch area (32px visual + padding)
- Header buttons: 44px hit area
- Action chips: 36px visual height, 44px touch target via padding
- Conversation list rows: 48px+ height
- Bottom sheet drag handle: 44px vertical hit zone

---

## 6. Welcome Screen (Post-Signup)

New screen in the signup flow. Appears after account creation, before the onboarding interview.

### Routing
- Route: `/onboarding/welcome` (new page within the onboarding flow)
- After sign-up, redirect to `/onboarding/welcome` instead of `/onboarding`
- The "Start your profile interview" CTA navigates to `/onboarding` (the existing onboarding chat)
- This is a simple page component at `packages/web/src/app/onboarding/welcome/page.tsx`

### Layout
- Scrollable content area with sticky bottom CTA
- Content flows: Logo -> Video -> Explanation -> Checklist -> CTA

### Logo Section
- 48px IL badge with emerald gradient, 14px border-radius
- Box shadow: `0 8px 32px rgba(16, 185, 129, 0.2)` (glow)
- Title: "Welcome to ILR Advisor", 22px, bold
- Subtitle: "Let's get you set up", 14px, muted

### Video Embed
- 16:9 aspect ratio container (padding-bottom: 56.25%)
- Border radius: 14px
- Border: 1px solid `rgba(255,255,255,0.06)`
- Play button: 60px emerald circle with white triangle, centered
- Duration badge: bottom-right corner, dark pill
- Plays inline (no redirect to external player)
- **Source:** Video URL will be configured via environment variable (`NEXT_PUBLIC_WELCOME_VIDEO_URL`). Implementation should support both YouTube/Vimeo embeds (iframe) and self-hosted MP4 (`<video>` tag) -- detect by URL pattern. Initially expect a Vimeo embed.

### Explanation Text
- Heading: "Your personalised advisor starts here", 17px, semibold
- Body: Two paragraphs explaining the process
- Frames it as a "one-on-one interview with your advisor"
- Emphasises that more detail = better advice

### What You'll Cover Checklist
- Card: `rgba(255,255,255,0.03)` background, 12px border-radius, subtle border
- 4 numbered items with emerald number badges (24px squares)
  1. Your current financial position
  2. Investment goals and timeline
  3. Risk tolerance and preferences
  4. Existing property portfolio (if any)

### Sticky CTA
- Full-width emerald gradient button: "Start your profile interview"
- Padding: 16px vertical, 16px font-size, 600 weight
- Box shadow: `0 4px 16px rgba(16, 185, 129, 0.2)`
- Border radius: 14px
- Below button: clock icon + "Takes 15-20 minutes if done properly"
- Time text: 12px, `var(--text-muted)`
- Background gradient fade from `#09090b` to transparent above CTA to avoid hard cutoff

---

## 7. Onboarding Interview

The existing onboarding page redesigned for mobile with these additions:

### Progress Bar
- Thin (3px) bar below header
- Background: `var(--surface-3)`
- Fill: emerald gradient, animated width transition (300ms ease)
- Header shows "Step X of 4" subtitle
- **Step detection:** Frontend-driven. The onboarding prompt is structured into 4 known sections. The frontend tracks which section is active based on a simple keyword match in the assistant's messages (e.g., "financial position", "goals", "risk", "portfolio"). This is approximate but good enough for a progress indicator. No backend changes required.

### Quick-Reply Chips
- **Frontend-driven, not backend.** The onboarding flow uses a predefined map of expected questions to chip options. When the assistant's message matches a known question pattern (e.g., contains "investment goal"), the frontend renders the corresponding chips. This avoids needing a new SSE event type. If no match is found, no chips are shown and the user types freely.
- Appear below assistant messages when structured input is expected
- Pill-shaped: 20px border-radius, 10px 16px padding
- Unselected: neutral background, subtle border, muted text
- Selected: emerald tint background, emerald border, emerald text
- Tapping a chip sends it as a user message bubble
- Chips arranged in flex-wrap layout with 8px gap
- Left-padded 38px to align with message content (past avatar)

### Free-Text Fallback
- Input always available below chips
- Placeholder: "Or type your answer..."
- Same input styling as main chat

---

## 8. Login Screen (Mobile Polish)

### Layout
- Vertically centered in viewport (flex column, justify-center)
- Padding: 32px horizontal on iPhone, 24px vertical

### Logo
- Same 48px badge + glow as welcome screen
- Title: "ILR Advisor", 24px, bold
- Subtitle: "Your AI property investment advisor", 14px, muted

### Form
- Labels: 13px, medium weight, muted color, 6px margin-bottom
- Inputs: 14px vertical padding, 16px horizontal, 12px border-radius
- Background: `rgba(255,255,255,0.04)`, border: `rgba(255,255,255,0.08)`
- Gap between fields: 14px
- CTA: Full-width emerald gradient, 16px padding, 15px font, 12px border-radius
- Sign-up link: centered below CTA, emerald text for "Sign up"

### Keyboard Handling
- Form scrolls up when keyboard appears
- Logo remains visible above fold

---

## 9. Animations & Transitions

| Animation | Spec | Notes |
|---|---|---|
| Message appear | Fade up 6px, 250ms ease-out | Existing, keep as-is |
| Thinking dots | 3-dot pulse, 1.4s ease-in-out infinite | Existing, keep as-is |
| Bottom sheet open/close | 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275) | Slight bounce on open |
| Send button press | Scale to 0.9, spring back | Tactile feedback |
| Send button color | 200ms ease background transition | Gray to emerald when text entered |
| Screen transitions | 200ms crossfade | Chat to Roadmap, etc. |
| Scroll-to-bottom FAB | 150ms fade + scale (0.8 to 1) | Appears/disappears |
| Input focus glow | 200ms ease border + shadow | Emerald ring appears |
| Progress bar fill | 300ms ease width | Onboarding step changes |
| Quick-reply chip select | 150ms scale 0.95 + color change | Before converting to message |

---

## 10. Safe Areas & Viewport

### Viewport Configuration
In Next.js 16, set via a `viewport` export in the root layout (`packages/web/src/app/layout.tsx`):
```typescript
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
```

### Safe Area Insets
- Bottom padding on input area: `env(safe-area-inset-bottom)` for iPhone home indicator
- Status bar area: handled by `viewport-fit=cover`
- Applied to: input area, bottom sheet, sticky CTAs, tab areas

### Keyboard Avoidance
- Use `visualViewport` API to detect keyboard height
- Input area animates up smoothly with keyboard
- Messages scroll to keep last message visible
- No janky jumps or layout thrashing

---

## 11. Roadmap Page (Mobile Adjustments)

The existing roadmap page already has mobile support (dropdown nav on mobile, sidebar on desktop). Adjustments for consistency:

- Match the compact header pattern from the chat view
- Add back-arrow to return to chat (or integrate into header Roadmap button as a toggle)
- Ensure horizontal table scroll works smoothly (use `overflow-x: auto` -- `-webkit-overflow-scrolling: touch` is deprecated and unnecessary on modern iOS)
- Match spacing and typography scale to chat view

---

## 12. Technical Approach

### Dependencies
- Bottom sheet: CSS transforms + native touch event handlers (touchstart/touchmove/touchend)
- Spring animations: CSS `cubic-bezier(0.175, 0.885, 0.32, 1.275)` approximation for spring-like bounce. True spring physics are not worth the dependency for this use case. If the feel is not right during implementation, we can add a ~2KB utility like `popmotion` as a targeted dependency.
- Safe areas: CSS `env()` functions
- No new UI libraries

### Component Changes
- `AdvisorChatPanel.tsx` - Message bubble styling, input area states, scroll-to-bottom FAB, long-press context menu
- `ConversationSidebar.tsx` - Replace mobile drawer with bottom sheet on iPhone, keep persistent sidebar for tablet
- Layout `(advisor)/layout.tsx` - Hybrid header, action chips, responsive breakpoint logic, viewport meta tag
- `(advisor)/page.tsx` - Welcome screen state for new users
- `onboarding/page.tsx` - Progress bar, quick-reply chips
- `login/page.tsx` - Centered layout, input sizing, keyboard handling
- `globals.css` - Safe area variables, new animations, touch target utilities

### New Components
- `BottomSheet.tsx` - Reusable bottom sheet with drag handle, snap points, spring animation, backdrop
- `ScrollToBottomFAB.tsx` - Floating action button with unread count badge
- `WelcomeScreen.tsx` - Post-signup welcome screen with video embed
- `QuickReplyChips.tsx` - Tappable pill buttons for onboarding
- `MessageContextMenu.tsx` - Long-press context menu for messages

### Accessibility
- All animations respect `prefers-reduced-motion`: when enabled, replace spring/fade animations with instant transitions (0ms duration)
- Bottom sheet uses `role="dialog"` with `aria-label="Conversation history"`
- Context menu uses `role="menu"` with `role="menuitem"` on options
- Focus trap within bottom sheet and context menu when open

---

## 13. Out of Scope

These items are explicitly deferred and not part of this redesign:
- Sign-up screen UI (handled by Supabase auth, to be styled separately)
- Export functionality (the button exists in the desktop header but the export feature itself is a separate spec)
- Quoted replies / threading within chat
- Offline support / PWA capabilities
- Push notifications

---

## Screen Flow

```
Login -> Sign Up -> Welcome Screen (video + checklist) -> Onboarding Interview (chat with progress bar + quick replies) -> Main Chat
                                                                                                                              |
                                                                                                                    Roadmap (via header button)
                                                                                                                    Profile (via avatar)
                                                                                                                    History (via chip / swipe -> bottom sheet)
                                                                                                                    New Chat (via chip)
```
