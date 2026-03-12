# Admin Dashboard & Eval Pipeline Design

## Context

The ILR Advisor is entering beta testing with a small group of users. The team (2-5 people) needs visibility into how the system is being used, the quality of AI responses, and a mechanism for continuous improvement. Currently, feedback is collected via `FeedbackButton` on each assistant message and stored in `tester_feedback`, but there is no admin interface to review it, no usage analytics, no automated quality checking, and no self-improvement loop.

This spec covers a complete admin dashboard with four modules, an automated LLM-based eval pipeline, and an auto-suggest system that identifies issues and drafts improvement recommendations.

---

## Architecture

### Four Admin Modules

| Route | Purpose |
|---|---|
| `/admin` | Overview dashboard - key metrics, engagement charts, topic coverage, recent feedback, flagged items |
| `/admin/feedback` | Feedback review - browse, filter, and manage all tester feedback with full conversation context |
| `/admin/conversations` | Conversation explorer - read through user conversations with per-message eval scores |
| `/admin/quality` | Quality & eval engine - eval score summaries, flagged responses, auto-generated improvement suggestions |

### Access Control

Add `role TEXT DEFAULT 'user'` column to `user_profiles`. Values: `'user'`, `'admin'`.

**Admin pages** (`/admin/*`): The existing Next.js middleware handles auth (redirects unauthenticated users to `/login`). Add a role check inside the admin layout component (`/admin/layout.tsx`) - query `user_profiles.role` for the authenticated user and render a 403 if not admin. This is simpler than modifying the middleware matcher.

**Admin API routes** (`/api/admin/*`): The middleware matcher explicitly excludes `api/` routes (line 68 of `middleware.ts`). Each admin API route handler checks the role itself: call `getAuthenticatedUserId()` from `supabase-server.ts`, then query `user_profiles.role` using the service-level client from `supabase.ts` (`getSupabaseClient()`). Return 403 if not admin. Extract this into a shared `requireAdmin()` helper in `packages/web/src/lib/admin-auth.ts`.

Admin users are set directly in Supabase (no self-service admin promotion needed for 2-5 people).

---

## Database Schema

### New Tables

#### `message_evals`
Stores automated eval scores per assistant message.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated |
| `message_id` | UUID FK -> conversation_messages | |
| `conversation_id` | UUID FK -> conversations | For efficient querying |
| `eval_run_id` | UUID | Groups evals from the same trigger |
| `accuracy_score` | FLOAT | 0-1, factual accuracy |
| `accuracy_reasoning` | TEXT | Judge's explanation |
| `relevance_score` | FLOAT | 0-1, relevance to client profile |
| `relevance_reasoning` | TEXT | |
| `grounding_score` | FLOAT | 0-1, source grounding quality |
| `grounding_reasoning` | TEXT | |
| `overall_score` | FLOAT | Weighted composite: accuracy 0.4, relevance 0.3, grounding 0.3 |
| `topic` | TEXT | Detected topic category for this message |
| `flagged` | BOOLEAN | Auto-set if any score < threshold |
| `created_at` | TIMESTAMPTZ | |

Indexes: `message_id`, `conversation_id`, `flagged`, `created_at DESC`, `overall_score`, `topic`.

#### `improvement_suggestions`
Auto-generated fix recommendations from eval failures.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated |
| `eval_id` | UUID FK -> message_evals | The triggering eval |
| `category` | TEXT | `'knowledge_gap'`, `'prompt_weakness'`, `'hallucination'`, `'personalization_miss'` |
| `description` | TEXT | What the issue is |
| `suggested_fix` | TEXT | The proposed improvement |
| `status` | TEXT | `'pending'`, `'applied'`, `'dismissed'` |
| `applied_by` | UUID FK -> user_profiles | Nullable |
| `created_at` | TIMESTAMPTZ | |

Index: `status`, `category`, `created_at DESC`.

#### `eval_runs`
Tracks eval executions for audit/debugging. In real-time mode, each message eval creates its own run record (1:1 with message_evals). This table exists primarily for observability - tracking eval latency, failures, and providing an audit trail. It also supports future batch re-evaluation if needed.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated |
| `started_at` | TIMESTAMPTZ | |
| `completed_at` | TIMESTAMPTZ | Nullable |
| `messages_evaluated` | INT | 1 for real-time, N for batch |
| `avg_accuracy` | FLOAT | |
| `avg_relevance` | FLOAT | |
| `avg_grounding` | FLOAT | |
| `status` | TEXT | `'running'`, `'completed'`, `'failed'` |

#### `usage_analytics`
Pre-computed daily engagement metrics per user.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated |
| `user_id` | UUID FK -> auth.users | |
| `date` | DATE | The day these metrics cover |
| `conversations_started` | INT | |
| `messages_sent` | INT | User messages only |
| `messages_received` | INT | Assistant messages |
| `avg_messages_per_conversation` | FLOAT | |
| `topics` | JSONB | Array of detected topics from the day's conversations |
| `first_activity` | TIMESTAMPTZ | |
| `last_activity` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

Constraint: UNIQUE(user_id, date).

### Modified Tables

- **`user_profiles`**: Add `role TEXT DEFAULT 'user'`
- **`tester_feedback`**: Add `reviewed BOOLEAN DEFAULT false`, `reviewed_by UUID` (nullable FK to user_profiles). Note: `tester_feedback` currently has no RLS policies. Since it uses the service-level client for both reads and writes (via `/api/feedback`), no RLS changes are needed - admin API routes also use the service-level client.

### Migration Location

The project has two migration directories:
- `packages/pipeline/supabase/migrations/` - original tables (personas, financial_positions, user_profiles, tester_feedback)
- `supabase/migrations/` - newer tables (conversations, conversation_messages, roadmaps)

Place the new migration in `supabase/migrations/` to follow the newer convention. File: `supabase/migrations/20260313_admin_dashboard.sql`.

---

## Eval Pipeline

### Trigger
Real-time: fires immediately after an assistant message is saved to `conversation_messages` at the end of the chat stream response. The eval runs asynchronously - the user never waits for it.

**Precondition:** Eval only fires when messages are actually persisted - i.e., when `conversationId` is provided and the Supabase client is available (line 249 of `stream/route.ts`). Non-persisted conversations are not evaluated.

**Implementation:** At the end of the stream route (`/api/chat/stream/route.ts`), after persisting the assistant message:

1. Modify the assistant message insert to use `.select('id').single()` to capture the returned message UUID
2. Look up `user_id` from the `conversations` table using the `conversationId` (the stream route does not receive userId directly)
3. Call the eval logic directly as an imported async function (`triggerEval()` from `eval-pipeline.ts`) rather than via HTTP fetch. This avoids auth complications with internal server-to-server calls. Use fire-and-forget: `triggerEval({...}).catch(console.error)` - no `await`
4. Pass to `triggerEval()`: message ID, conversation ID, user ID, query, assistant text, sources payload

The `/api/admin/eval/run` POST route still exists for manual re-evaluation from the admin UI. That route uses the `requireAdmin()` guard since it's called from the browser.

### LLM Judge
A separate API call to Claude (or configurable model) that receives:

1. The user's question
2. The assistant's full response
3. The user's financial profile (from `financial_positions` for that user)
4. The RAG sources that were cited (from `sources` JSONB on the message)
5. A scoring rubric for each criterion

The judge returns structured JSON:
```json
{
  "accuracy": { "score": 0.8, "reasoning": "..." },
  "relevance": { "score": 0.6, "reasoning": "..." },
  "grounding": { "score": 0.9, "reasoning": "..." }
}
```

The scoring rubric is stored as a configurable prompt template in `packages/web/src/lib/eval-pipeline.ts` alongside the topic list. No need for database-level configurability at this stage - the rubric changes infrequently and is eval-specific config.

### Flag Threshold
Any criterion scoring below 0.6 triggers the `flagged` boolean on the eval record.

### Cost Controls
Every assistant message triggers one LLM eval call (judge + topic detection in a single call). Flagged messages trigger a second call for auto-suggest. Add an `EVAL_ENABLED` environment variable (default `true`) to disable evals entirely if needed. Log eval cost per call for monitoring. At beta scale (2-5 users) cost should be minimal, but the toggle provides a kill switch.

### Auto-Suggest Logic
When a message is flagged, a second LLM call classifies the failure and generates a suggestion:

1. **Knowledge gap**: No source material covers the topic. Suggestion: "Add [topic] to the knowledge base."
2. **Hallucination**: Response contains claims not supported by any source. Suggestion: "Review response for unsupported claims about [topic]."
3. **Prompt weakness**: The system prompt doesn't instruct the advisor to handle this scenario well. Suggestion: "Strengthen prompt section on [area] to [specific improvement]."
4. **Personalization miss**: Response is generic despite available profile data. Suggestion: "Always reference [specific profile fields] when discussing [topic]."

### One-Click Apply

**Prompt suggestions:** Clicking "Apply" navigates to `/admin/personas?suggestion={suggestionId}`. The personas page changes:

1. On mount, detect `suggestion` query param
2. Fetch the suggestion from `/api/admin/suggestions/{id}` (includes `suggested_fix` text and the linked eval with context)
3. Auto-select the ILR Advisor persona (there's only one advisor in the current system)
4. Show a yellow banner above the system prompt textarea: "Suggestion: {description}" with the `suggested_fix` text
5. The admin edits the system prompt as they see fit (the suggestion is guidance, not an auto-merge)
6. On save (existing PUT to `/api/admin/personas/[id]`), also call PUT `/api/admin/suggestions/{id}` with `status: 'applied'`

This reuses the existing persona editor UI with minimal additions (banner + suggestion fetch).

**Knowledge gap suggestions:** Clicking "View Details" opens a modal showing the missing topic, the question that triggered it, and the eval reasoning. Knowledge gaps require manual action outside the app (adding content to the RAG pipeline), so the modal provides context but no automated apply. The admin can mark it as `'applied'` or `'dismissed'` after taking action.

---

## Overview Dashboard (`/admin`)

### Layout
- **Top row**: 4 metric cards (active users 7d, conversations today, avg messages/session, avg quality score) with trend indicators vs previous period
- **Middle**: 2-column layout
  - Left (2/3): Engagement over time chart (daily conversations + messages, toggleable 7d/30d)
  - Right (1/3): Recent feedback list + flagged responses count with links
- **Bottom**: Topic coverage - pill/tag cloud showing detected topics sized by frequency over last 7 days

### Data Sources
- Metric cards: aggregate queries on `usage_analytics` and `message_evals`
- Engagement chart: `usage_analytics` grouped by date
- Recent feedback: `tester_feedback` ORDER BY created_at DESC LIMIT 5
- Flagged count: `message_evals` WHERE flagged = true AND not yet reviewed
- Topic coverage: aggregate `topics` JSONB from `usage_analytics`

---

## Feedback Review (`/admin/feedback`)

### Layout
- Filterable table/list of all `tester_feedback` entries
- Filters: date range, agent, reviewed/unreviewed
- Each row shows: user question (truncated), feedback comment, agent, timestamp, reviewed status
- Expandable: clicking a row shows the full user question + assistant response side by side with the feedback comment
- Bulk actions: mark as reviewed, export

### Data Source
- `tester_feedback` table joined with `user_profiles` for display name

---

## Conversation Explorer (`/admin/conversations`)

### Layout
- Left sidebar: list of conversations (user name, title, date, message count, avg eval score badge)
- Filters: user, date range, eval score range, has-flagged-messages
- Main panel: full chat transcript for selected conversation
- Each assistant message shows inline eval score badges (colored: green > 0.8, yellow 0.6-0.8, red < 0.6)
- Clicking an eval badge expands the full eval reasoning
- Source citations expandable per message

### Data Source
- `conversations` joined with `user_profiles`
- `conversation_messages` for transcript
- `message_evals` for per-message scores
- RLS bypass needed: admin queries need service-level access since conversations are RLS-protected to their owners

---

## Quality Dashboard (`/admin/quality`)

### Layout
- **Top row**: 3 score summary cards (accuracy, relevance, grounding) showing overall averages with message count
- **Middle**: 2-column layout
  - Left: Flagged responses list, sorted by severity (lowest score first), showing question snippet, criterion that failed, judge reasoning, and action buttons (View Full, Dismiss)
  - Right: Improvement suggestions list, categorised by type (knowledge gap, prompt weakness, hallucination, personalization miss), with description and action buttons (View Details/Apply, Dismiss)
- Apply button for prompt suggestions navigates to persona editor with pre-filled changes

### Data Sources
- Score cards: aggregate `message_evals`
- Flagged responses: `message_evals` WHERE flagged = true, ordered by overall_score ASC
- Suggestions: `improvement_suggestions` WHERE status = 'pending'

---

## Analytics Aggregation

A background job computes `usage_analytics` rows. Options:

1. **Cron-style**: Runs daily (e.g., midnight AEST) via an API route called by an external cron (Vercel cron, Railway cron, or a simple scheduled fetch)
2. **Incremental**: Updates the current day's row each time a message is saved (upsert on user_id + date)

Recommendation: Use incremental updates - upsert the current day's `usage_analytics` row at the end of each chat stream, alongside the eval trigger. This keeps stats current without needing a separate cron job.

### Topic Detection
Lightweight: use the LLM eval call to also classify the user's question into one of a predefined set of topics. Return the topic alongside the eval scores. Store in both `usage_analytics.topics` and as a `topic TEXT` field on `message_evals`.

The topic list is stored as a configurable array in `packages/web/src/lib/eval-pipeline.ts` (not hardcoded in the prompt). Initial set:
- Property Strategy
- Tax & Structure
- Borrowing Capacity
- Equity & LVR
- Market Analysis
- Cash Flow
- Insurance
- Depreciation
- Risk Management
- General / Other

---

## API Routes

All admin routes use service-level Supabase client (bypasses RLS) and require admin role.

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/stats` | GET | Overview metrics (aggregated from usage_analytics + message_evals) |
| `/api/admin/stats/engagement` | GET | Engagement time series for charts |
| `/api/admin/stats/topics` | GET | Topic distribution data |
| `/api/admin/feedback` | GET | List feedback with filters (extends existing GET /api/feedback) |
| `/api/admin/feedback/[id]/review` | PUT | Mark feedback as reviewed. Body: `{ reviewed: true }`. Sets `reviewed_by` to the admin's user ID. |
| `/api/admin/conversations` | GET | List all conversations (admin view, bypasses RLS) |
| `/api/admin/conversations/[id]` | GET | Full conversation with messages and evals |
| `/api/admin/evals` | GET | List evals with filters |
| `/api/admin/evals/flagged` | GET | Flagged evals only |
| `/api/admin/suggestions` | GET | List improvement suggestions |
| `/api/admin/suggestions/[id]` | PUT | Update suggestion status (applied/dismissed) |
| `/api/admin/eval/run` | POST | Manual re-evaluation of a specific message from the admin UI |

---

## Key Files to Modify

| File | Change |
|---|---|
| `packages/web/src/app/api/chat/stream/route.ts` | Add `.select('id').single()` to assistant message insert, add eval trigger fetch + analytics upsert after message save |
| `packages/web/src/app/admin/personas/page.tsx` | Add query param detection for suggestion apply flow, show suggested changes UI (see One-Click Apply section) |
| `packages/web/src/app/api/admin/personas/route.ts` | Add `requireAdmin()` guard (currently unprotected) |
| `packages/web/src/app/api/admin/personas/[id]/route.ts` | Add `requireAdmin()` guard (currently unprotected) |
| `packages/web/src/app/api/admin/seed/route.ts` | Add `requireAdmin()` guard (currently unprotected) |

### Reference Files (read-only, for schema context)

| File | Purpose |
|---|---|
| `packages/web/src/lib/supabase.ts` | Service-level Supabase client (`getSupabaseClient()`) - reuse for admin queries |
| `packages/web/src/lib/supabase-server.ts` | Cookie-based auth client + `getAuthenticatedUserId()` - reuse for admin auth |
| `packages/pipeline/supabase/migrations/004_auth_and_feedback.sql` | Existing schema for user_profiles, tester_feedback |
| `supabase/migrations/20260311_create_conversations.sql` | Existing schema for conversations, conversation_messages |

### New Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260313_admin_dashboard.sql` | All new tables + modifications |
| `packages/web/src/lib/admin-auth.ts` | Shared `requireAdmin()` helper - checks auth + role, returns user or throws 403 |
| `packages/web/src/app/admin/page.tsx` | Overview dashboard |
| `packages/web/src/app/admin/layout.tsx` | Admin layout with tab navigation |
| `packages/web/src/app/admin/feedback/page.tsx` | Feedback review page |
| `packages/web/src/app/admin/conversations/page.tsx` | Conversation explorer |
| `packages/web/src/app/admin/quality/page.tsx` | Quality dashboard |
| `packages/web/src/lib/eval-pipeline.ts` | LLM judge + auto-suggest logic |
| `packages/web/src/lib/analytics.ts` | Usage analytics aggregation |
| `packages/web/src/app/api/admin/stats/route.ts` | Stats API |
| `packages/web/src/app/api/admin/stats/engagement/route.ts` | Engagement API |
| `packages/web/src/app/api/admin/stats/topics/route.ts` | Topics API |
| `packages/web/src/app/api/admin/feedback/route.ts` | Admin feedback API |
| `packages/web/src/app/api/admin/conversations/route.ts` | Admin conversations API |
| `packages/web/src/app/api/admin/conversations/[id]/route.ts` | Single conversation API |
| `packages/web/src/app/api/admin/evals/route.ts` | Evals API |
| `packages/web/src/app/api/admin/evals/flagged/route.ts` | Flagged evals API |
| `packages/web/src/app/api/admin/suggestions/route.ts` | Suggestions API |
| `packages/web/src/app/api/admin/suggestions/[id]/route.ts` | Suggestion update API |
| `packages/web/src/app/api/admin/eval/run/route.ts` | Eval trigger API |

---

## Verification

1. **Database**: Run migration, verify all tables created with correct columns and indexes
2. **Access control**: Log in as non-admin user, confirm `/admin/*` routes return 403. Set user role to admin, confirm access works.
3. **Eval pipeline**: Send a chat message, verify `message_evals` row is created within seconds. Check that flagged messages generate `improvement_suggestions` rows.
4. **Overview dashboard**: Verify metric cards show correct numbers matching raw data. Check engagement chart renders with real data.
5. **Feedback review**: Submit feedback via FeedbackButton, verify it appears in admin feedback list. Mark as reviewed, verify status updates.
6. **Conversation explorer**: Browse conversations as admin, verify full transcripts load with eval score badges. Verify RLS bypass works (admin sees all users' conversations).
7. **Quality dashboard**: Verify flagged responses appear sorted by severity. Verify suggestions appear with correct categorisation. Test "Apply" button navigates to persona editor with pre-filled changes.
8. **Analytics**: Verify `usage_analytics` rows are created/updated after chat messages. Check topic detection populates the topics field.
