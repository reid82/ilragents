# Consolidate 10 Agents into 4

## Overview

Replace 10 specialized chat agents with 4 broader agents. No changes to RAG pipeline, database schema, or content ingestion. Only the query-time agent resolution and UI change.

## Agent Definitions

| Agent | ID | Domains | RAG Sources | Context Limit |
|---|---|---|---|---|
| Baseline Ben | `baseline-ben` | Strategy, Foundations & Roadmapping | Navigator Nate, Foundation Frank, Roadmap Ray | 15 |
| Finder Fred | `finder-fred` | Property Sourcing | Finder Fred | 15 |
| Investor Coach | `investor-coach` | Portfolio Management & Growth | Splitter Steve, Equity Eddie, Yield Yates, Tenant Tony, Strata Sam | 25 |
| Deal Specialist | `deal-specialist` | Asset Protection, Tax & Deal Structuring | Teflon Terry, Depreciation Dave, Venture Vince | 20 |

## Design Decisions

- **Functional names** over character names for merged agents
- **UI**: Ben stays hero, flat 3-card grid below (no category sections)
- **System prompts**: Domain-route internally, present uniformly (no sub-domain references)
- **Context limit**: Configurable per agent via `contextLimit` field on AgentDef

## Data Flow

Query flow for merged agents (unchanged pattern from Baseline Ben):

1. User question -> agent
2. `resolveAgentSources()` returns underlying RAG agent names
3. `searchChunks()` called per RAG agent, pool divided evenly
4. Merge results by similarity score, take top N (per agent contextLimit)
5. `buildSystemPrompt()` with functional persona
6. Claude responds from relevant content

## Files to Modify

### 1. `packages/web/src/lib/agents.ts`
- Replace 10 AgentDef entries with 4
- Add `contextLimit` field to AgentDef interface
- Remove `AgentTable` type and `getAgentsByTable()`
- Keep `getAgentById()` and `getFacilitator()`

### 2. `packages/pipeline/src/pipeline/chat.ts`
- Expand `AGENT_ALIASES` with Investor Coach and Deal Specialist
- Read `contextLimit` from options instead of hardcoding 15

### 3. `packages/web/src/app/page.tsx`
- Replace two AgentTable sections with single flat grid
- 3 cards (Fred, Coach, Specialist) below Ben hero
- Remove category grouping

### 4. `packages/web/src/lib/seed-personas.ts`
- 4 persona seed entries instead of 10
- New descriptions for Coach and Specialist

### 5. `packages/pipeline/src/pipeline/chat.test.ts`
- Update tests for new agent names and alias mappings

### 6. `packages/web/src/app/chat/[agent]/page.tsx`
- No logic changes - resolves agent by ID dynamically
- Old agent IDs stop being routable

## Files Unchanged

- `sources.json` - all 191 sources keep existing agent tags
- `chunks` table - no re-ingestion
- RAG search logic - already supports multi-agent
- Response format presets
- Financial context injection
- Onboarding flow
- Voice/ElevenLabs integration
- Supabase schema/migrations
- API routes

## No Migration Needed

Old `agent_personas` rows become orphaned but harmless. Seed endpoint creates the new 4.
