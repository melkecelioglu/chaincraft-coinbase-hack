# Marketplace Improvements Design

Date: 2026-03-05

## Problem Statement

The marketplace has three major issues:
1. **Semantic search quality is poor** — embedding text only includes name + description + tags, not source code
2. **Load More is broken** — replaces array instead of appending; no real pagination
3. **Tag filters are insufficient** — 6 hardcoded tags as badges, not fed from DB

## Decisions

- **Embedding**: Regenerate all existing + new template embeddings with source code summary included
- **Pagination**: Numbered pagination with URL state (replaces broken Load More)
- **Tags**: Dynamic from DB via new endpoint, rendered as multi-select dropdown with counts
- **Architecture**: Unified search endpoint (Approach A) — single `GET /marketplace` handles both list and semantic search

## Backend Changes

### 1. Unified `GET /marketplace` Endpoint

Merge current `GET /marketplace` (list) and `GET /marketplace/search` (semantic) into one.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Semantic search query. If present, uses $vectorSearch; otherwise normal list |
| `page` | number | 1 | Page number |
| `limit` | number | 12 | Items per page |
| `tags` | string | — | Comma-separated tag filter |

**Search mode pipeline:** `$vectorSearch` → `$match` (tag filter) → `$facet` (count + paginate) → `$project` (score + fields)

**List mode pipeline:** `$match` (tag filter) → `$sort` (deployCount desc, createdAt desc) → `$skip/$limit` → `$project`

**Response format (both modes):**
```typescript
{
  items: Array<ContractTemplate & { score?: number }>;
  total: number;
  page: number;
  limit: number;
}
```

The old `GET /marketplace/search` endpoint is removed or deprecated.

### 2. New `GET /marketplace/tags` Endpoint

Returns all unique tags with counts, sorted by count descending.

```typescript
// Response
Array<{ tag: string; count: number }>
```

Implementation: `$unwind: "$tags"` → `$group: { _id: "$tags", count: { $sum: 1 } }` → `$sort: { count: -1 }` → `$project`

Public endpoint (no auth required).

### 3. Embedding Enrichment

Current embedding text: `"{name} {description} {tags}"`

New embedding text: `"{name} {description} {tags} {sourceCodeSummary}"`

`sourceCodeSummary` = first 500 chars of contract source code (capturing function signatures, state variables, key patterns). This gives semantic search visibility into contract implementation details without hitting token limits.

### 4. Migration Script: `scripts/regenerate-embeddings.ts`

- Fetches all ContractTemplate documents
- For each, constructs new embedding text with source code summary
- Calls OpenAI embedding API to generate new 1536-dim vector
- Updates document in place
- Logs progress, handles rate limiting
- Runs against production DB connection string

## Frontend Changes

### 1. Numbered Pagination (replaces Load More)

- Remove Load More button from `TemplateGrid`
- Add pagination controls: `< Prev | 1 | 2 | 3 | ... | Next >`
- Use shadcn/ui Pagination component if available, otherwise custom
- Page state stored in URL search params (`?page=2`)

### 2. Tag Dropdown Filter (replaces badge row)

- Remove `TagFilter` badge component
- Replace with shadcn `Popover` + `Command` (combobox pattern)
- Multi-select: user can pick multiple tags
- Tags loaded from `GET /marketplace/tags` on mount
- Each tag shows count: `erc20 (15)`
- Selected tags shown as removable badges above/beside dropdown
- "Clear all" button to reset filters

### 3. Unified Search + Filter

- Both search input and tag dropdown call the same `GET /marketplace` endpoint
- Search query + tag filter work together (backend handles combination)
- Pagination works in all modes (list, search, filtered, search+filtered)

### 4. URL State Management

- `searchQuery`, `selectedTags`, `page` all stored in URL search params
- Example: `/marketplace?q=staking&tags=defi,erc20&page=2`
- `useSearchParams` hook for Next.js router integration
- Back/forward navigation preserves state
- Page refresh preserves state

### 5. Race Condition Fix

- Tag toggle + page reset happen in single `router.push` call
- `fetchTemplates` triggered only by URL param changes (single source of truth)
- No double API calls on filter change

## Files to Modify

**Backend:**
- `backend/src/marketplace/marketplace.service.ts` — unified search method, tags aggregation, embedding text update
- `backend/src/marketplace/marketplace.controller.ts` — merge endpoints, add tags endpoint
- `backend/scripts/regenerate-embeddings.ts` — new migration script

**Frontend:**
- `frontend/src/components/marketplace/template-grid.tsx` — pagination, URL state, unified fetch
- `frontend/src/components/marketplace/tag-filter.tsx` — rewrite as dropdown with DB tags
- `frontend/src/components/marketplace/search-bar.tsx` — minor: integrate with URL params
- `frontend/src/lib/types.ts` — update response types if needed

## Testing Plan

1. Connect to production MongoDB and verify semantic search returns relevant results
2. Test embedding regeneration script on a subset first
3. Verify pagination works: page 1 shows first 12, page 2 shows next 12, etc.
4. Verify tag dropdown loads all unique tags from DB with correct counts
5. Verify search + tag filter combination returns correctly filtered semantic results
6. Verify URL state: refresh page, use back/forward, share URL — all preserve state
7. Verify no race conditions: rapid tag toggles don't cause stale data
