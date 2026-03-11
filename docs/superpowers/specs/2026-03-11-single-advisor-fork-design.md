# ILR Single Advisor Fork - Design Spec

## Problem

The current ILR Agents app presents 6 specialist agents in a "Round Table" UI. Users must choose which agent to talk to, and conversations are siloed per agent in browser localStorage. After reviewing the Hormozi AI Business Advisor (Acquisition.com), we identified a simpler, more effective pattern: one unified expert advisor with persistent chat history, content resources, and suggested conversation starters.

## Intended Outcome

A fork of the ILR Agents project on a long-lived git branch (`feature/single-advisor`) that:
- Collapses 6 agents into a single "ILR Property Advisor" with access to all RAG knowledge
- Provides a Hormozi-style UI: sidebar-first layout, chat history, resource links, chat starters
- Preserves all existing features (deal analysis, roadmaps, referrals, onboarding) through the single advisor
- Stores conversation history in Supabase instead of browser localStorage

## Architecture

### Key Insight

The pipeline's `match_chunks` RPC already supports searching multiple RAG source agents. The current "specialists" are a UI concept (RAG source aliases + shared system prompt), not an architectural boundary. Unifying to one advisor requires one new alias entry in the pipeline and frontend changes.

### What Changes

**Pipeline (minimal):**
- One new entry in `AGENT_ALIASES` (`packages/pipeline/src/pipeline/chat.ts`) combining all 13 RAG source agents
- `contextLimit` bumped to 25-30 for the wider search pool

**Database (new):**
- `conversations` table: `id`, `user_id`, `title`, `created_at`, `updated_at`
- `conversation_messages` table: `id`, `conversation_id`, `role`, `content`, `sources` JSONB, `referrals` JSONB, `created_at`
- **RLS enabled on both tables** with policy `user_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE
- `updated_at` set application-side in the API routes (not via Postgres trigger, matching existing codebase patterns)
- New API routes for CRUD operations on conversations

**Frontend (major):**
- New `(advisor)` route group with persistent sidebar layout
- `ConversationSidebar.tsx` - date-grouped chat history from Supabase
- `LandingView.tsx` - hero, resource cards, chat starters, input
- `AdvisorChatPanel.tsx` - adapted from existing `ChatPanel.tsx`
- `conversation-store.ts` replaces `chat-store.ts` (Supabase-backed)

**Stream route:**
- Accepts `conversationId`, persists messages server-side
- Deal analysis triggered by URL detection instead of agent name check

### What Stays the Same

- RAG pipeline (search, embeddings, chunks)
- Property intelligence (HPF, ABS, zoning, scraping)
- Calculators (FISO, cashflow, capacity, sensitivity)
- Onboarding flow (redirects to advisor landing after completion)
- Referral system and specialist teams
- Roadmap generation
- Auth (Supabase SSR)
- All Zustand stores except chat-store

## Frontend Layout

```
+------------------+-------------------------------------+
| Sidebar (280px)  |  Main Content Area                  |
| - New Chat btn   |                                     |
| - Search box     |  Landing: hero + resources +        |
| - Chat history   |          starters + input           |
|   grouped by     |                                     |
|   date           |  Chat: AdvisorChatPanel with        |
|                  |        streaming, referrals,         |
| - Resources link |        email drafts, feedback       |
| - Profile link   |                                     |
+------------------+-------------------------------------+
```

Desktop: sidebar always visible. Mobile: sidebar as toggleable drawer.

### Route Structure

```
(advisor)/layout.tsx              -- Persistent shell
(advisor)/page.tsx                -- Landing view
(advisor)/chat/[id]/page.tsx      -- Conversation view
```

### Chat Starters (Static)

6 curated starting prompts displayed as pill buttons on the landing page. Clicking one creates a new conversation and sends the message immediately.

### Auto-Title Generation

After the first assistant response in a new conversation, generate a title server-side by truncating the first user message to ~60 chars with ellipsis. Update via `PATCH /api/conversations/[id]`. No LLM call needed for this - keeps it simple and fast.

### Resource Cards

Placeholder grid of content links. Managed separately - static data for now.

## Feature Integration

| Feature | Current Trigger | New Trigger |
|---------|----------------|-------------|
| Deal analysis | `agent === "Deal Analyser Dan"` | URL detected in any message, uses `DEAL_ANALYSER_SYSTEM_PROMPT` |
| FISO feasibility | `agent === "FISO Phil"` | User explicitly requests feasibility/FISO analysis (keyword detection: "run the numbers", "feasibility", "FISO"), uses `FISO_PHIL_SYSTEM_PROMPT` |
| Roadmap | `agentSlug === "baseline-ben"` | `ROADMAP_ACCEPTED` in any response |
| Referrals | Generic (already works) | No change |
| Onboarding | Redirects to `/` | No change needed |
| Financial context | Agent-specific briefs | Full `profile.summary` always |

### FISO Phil Handling

The current FISO Phil agent uses a distinct system prompt (`fiso-phil-prompt.ts`) that produces structured feasibility reports with specific output formatting. In the unified advisor, this behaviour is triggered by intent detection in the stream route:

- If the user's message contains a listing URL AND feasibility-related keywords ("run the numbers", "feasibility", "FISO", "cashflow analysis"), inject `FISO_PHIL_SYSTEM_PROMPT` as the system prompt override
- If the user's message contains a listing URL without feasibility keywords, inject `DEAL_ANALYSER_SYSTEM_PROMPT` (general deal analysis)
- The advisor can also suggest running a FISO analysis after a deal analysis, via a chat response that guides the user

### Prompt Identity Updates

The following prompt files reference individual agent names and need updating to use "ILR Property Advisor":
- `packages/web/src/lib/deal-analyser-prompt.ts` - "You are Deal Analyser Dan" becomes unified advisor identity
- `packages/web/src/lib/fiso-phil-prompt.ts` - "You are FISO Phil" becomes unified advisor identity
- `packages/web/src/lib/roadmap-prompt.ts` - References to "Finder Fred", "Deal Analyser Dan" etc. become "the advisor" or are removed

## Risks

1. **RAG quality dilution** - Wider search pool may return less relevant results. Mitigate with higher `contextLimit` (25-30) and `minScore` threshold.
2. **Address-based deal detection** - Currently relies on agent name for address lookups without URLs. Need heuristic or LLM handling.
3. **Branch divergence** - Web package diverges from main. Expected; pipeline is shared.

## Implementation Phases

1. **Foundation:** Branch, migration, unified alias, conversation API routes
2. **Core Chat:** conversation-store, AdvisorChatPanel, stream route updates
3. **Layout:** Sidebar, route group, landing view, chat page
4. **Polish:** Onboarding wiring, roadmap triggers, auto-titles, responsive, cleanup
