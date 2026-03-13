# RAG Knowledge Manager

## Summary

Three new admin pages for managing, visualizing, and analyzing the RAG knowledge base. Extends the existing `/admin` section.

## Pages

### 1. Knowledge Manager (`/admin/knowledge`)

Browse, search, and add knowledge to RAG.

**Stats bar**: total chunks, unique sources, agents covered, content type breakdown.

**Source browser** (left sidebar): filterable/searchable list of all ingested sources grouped by agent. Each shows title, chunk count, word count, content type badge. Click to expand and see chunks.

**Main area** (right):
- Default: semantic search across all chunks using existing `match_chunks`. Results show chunk text snippet, source, similarity score, topic tags.
- Quick-add form with three modes:
  - **Text**: paste raw text, assign agent + content type metadata, submit
  - **URL**: enter URL, system extracts content (reuses Cheerio/Playwright extractors), chunks, embeds, ingests
  - **File upload**: PDF upload, extracts via pdf-parse, chunks, embeds, ingests
- Delete source (removes all chunks for that source_id)

**Quick-add backend**: New API route accepts content, runs chunk + embed + upsert pipeline server-side. For URL/PDF, extraction happens server-side too.

### 2. Knowledge Map (`/admin/knowledge/map`)

Interactive 2D scatter plot visualization of all chunk embeddings.

**Approach**: Add `map_x` and `map_y` float columns to `chunks` table. Pre-compute 2D coordinates using UMAP (via `umap-js` library) during ingest or as a one-time migration. Re-compute when new knowledge is added.

**Visualization**: Canvas-based scatter plot (lightweight custom implementation or `@visx/xychart`). Each dot is a chunk, colored by agent (or toggle to color by content_type/topic). Hover shows chunk preview. Click opens chunk detail.

**Cluster labels**: Group nearby points and label clusters with the most common topic from chunks in that area.

**Controls**: Color-by toggle (agent/content_type/topic), zoom/pan, filter by agent, search to highlight matching chunks.

### 3. Gap Analyzer (`/admin/knowledge/gaps`)

Surfaces topics where users asked questions but RAG had low-confidence or no-match responses.

**Data source**: Join `conversation_messages` (role='user') with `message_evals` to find messages where:
- `grounding_score < 0.5` (RAG couldn't ground the answer)
- The eval has `category = 'knowledge_gap'` in improvement_suggestions

**Display**:
- Aggregate low-confidence queries by topic/theme (use the `topic` field from `message_evals`)
- Show: topic, count of low-confidence queries, average grounding score, sample questions
- "Add Knowledge" button per gap that links to Knowledge Manager with the topic pre-filled
- Timeline view showing gap trends (are gaps improving or growing?)

## Database Changes

New migration:
```sql
ALTER TABLE chunks ADD COLUMN map_x float;
ALTER TABLE chunks ADD COLUMN map_y float;
```

No new tables needed. Gap analysis queries existing tables.

## API Routes

- `GET /api/admin/knowledge/sources` - list sources with chunk counts
- `GET /api/admin/knowledge/chunks` - list/search chunks with filters
- `POST /api/admin/knowledge/ingest` - quick-add content (text/URL/PDF)
- `DELETE /api/admin/knowledge/sources/[id]` - delete source and its chunks
- `GET /api/admin/knowledge/map` - get all chunks with 2D coordinates
- `POST /api/admin/knowledge/map/recompute` - trigger UMAP recomputation
- `GET /api/admin/knowledge/gaps` - aggregated gap analysis

## Nav Update

Add "Knowledge" tab to admin layout nav, between "Quality" and "Personas".

## Dependencies

- `umap-js` - UMAP dimensionality reduction in JS (no Python needed)
- No other new dependencies; visualization with Canvas 2D API
