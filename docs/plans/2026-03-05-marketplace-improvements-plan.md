# Marketplace Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix marketplace semantic search, replace broken Load More with numbered pagination, replace hardcoded tag badges with dynamic tag dropdown fed from DB.

**Architecture:** Unified `GET /marketplace` endpoint merges list + semantic search. New `GET /marketplace/tags` returns all DB tags with counts. Frontend uses URL search params as single source of truth, DropdownMenu with CheckboxItems for multi-select tag filter.

**Tech Stack:** NestJS + Mongoose (backend), Next.js + shadcn/ui + Radix DropdownMenu (frontend), MongoDB $vectorSearch + aggregation pipelines, OpenAI text-embedding-3-small.

---

### Task 1: Backend — Add `getDistinctTags()` to MarketplaceService

**Files:**
- Modify: `backend/src/marketplace/marketplace.service.ts`
- Test: `backend/src/marketplace/marketplace.service.spec.ts`

**Step 1: Write the failing test**

Add to `marketplace.service.spec.ts` after the existing `semanticSearch` describe block:

```typescript
describe('getDistinctTags', () => {
  it('should return unique tags with counts sorted by count desc', async () => {
    mockContractTemplateModel.aggregate.mockResolvedValue([
      { tag: 'erc20', count: 15 },
      { tag: 'defi', count: 8 },
      { tag: 'staking', count: 3 },
    ]);

    const result = await service.getDistinctTags();

    expect(mockContractTemplateModel.aggregate).toHaveBeenCalledWith([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, tag: '$_id', count: 1 } },
    ]);
    expect(result).toEqual([
      { tag: 'erc20', count: 15 },
      { tag: 'defi', count: 8 },
      { tag: 'staking', count: 3 },
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern=marketplace.service.spec -v`
Expected: FAIL — `service.getDistinctTags is not a function`

**Step 3: Write minimal implementation**

In `marketplace.service.ts`, add after the `semanticSearch` method:

```typescript
async getDistinctTags(): Promise<Array<{ tag: string; count: number }>> {
  return this.templateModel.aggregate([
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $project: { _id: 0, tag: '$_id', count: 1 } },
  ]);
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPattern=marketplace.service.spec -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/marketplace/marketplace.service.ts backend/src/marketplace/marketplace.service.spec.ts
git commit -m "feat(marketplace): add getDistinctTags aggregation method"
```

---

### Task 2: Backend — Add `GET /marketplace/tags` endpoint to controller

**Files:**
- Modify: `backend/src/marketplace/marketplace.controller.ts`
- Test: `backend/src/marketplace/marketplace.controller.spec.ts`

**Step 1: Write the failing test**

Add to `marketplace.controller.spec.ts` — first add `getDistinctTags` to the mock:

```typescript
// Update mockMarketplaceService (line 5-10) to include:
const mockMarketplaceService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  redeploy: jest.fn(),
  semanticSearch: jest.fn(),
  getDistinctTags: jest.fn(),
};
```

Then add new describe block after the existing `redeploy` describe:

```typescript
describe('getTags', () => {
  it('should return distinct tags with counts', async () => {
    mockMarketplaceService.getDistinctTags.mockResolvedValue([
      { tag: 'erc20', count: 10 },
      { tag: 'defi', count: 5 },
    ]);

    const result = await controller.getTags();
    expect(result).toEqual([
      { tag: 'erc20', count: 10 },
      { tag: 'defi', count: 5 },
    ]);
    expect(mockMarketplaceService.getDistinctTags).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern=marketplace.controller.spec -v`
Expected: FAIL — `controller.getTags is not a function`

**Step 3: Write minimal implementation**

In `marketplace.controller.ts`, add the `tags` endpoint **BEFORE** the `:id` route (order matters in NestJS — `:id` is a catch-all):

```typescript
@Public()
@Get('tags')
@ApiOperation({ summary: 'Get all unique tags with counts' })
@ApiResponse({ status: 200, description: 'Array of tags with usage counts' })
async getTags() {
  return this.marketplaceService.getDistinctTags();
}
```

**Important:** This must be placed before the `@Get(':id')` route in the file, otherwise NestJS will try to match "tags" as an `:id` param.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPattern=marketplace.controller.spec -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/marketplace/marketplace.controller.ts backend/src/marketplace/marketplace.controller.spec.ts
git commit -m "feat(marketplace): add GET /marketplace/tags endpoint"
```

---

### Task 3: Backend — Unified `findAll()` with optional semantic search

Merge the `semanticSearch()` logic into `findAll()` so one method handles both modes.

**Files:**
- Modify: `backend/src/marketplace/marketplace.service.ts`
- Test: `backend/src/marketplace/marketplace.service.spec.ts`

**Step 1: Write the failing tests**

Replace the existing `findAll` and `semanticSearch` describe blocks in `marketplace.service.spec.ts` with expanded versions:

```typescript
describe('findAll', () => {
  it('should return paginated templates (list mode)', async () => {
    const mockQuery = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ name: 'Token1' }]),
    };
    mockContractTemplateModel.find.mockReturnValue(mockQuery);
    mockContractTemplateModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });

    const result = await service.findAll({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('should filter by tags in list mode', async () => {
    const mockQuery = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    mockContractTemplateModel.find.mockReturnValue(mockQuery);
    mockContractTemplateModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });

    await service.findAll({ tags: ['erc20', 'defi'] });
    expect(mockContractTemplateModel.find).toHaveBeenCalledWith({
      tags: { $in: ['erc20', 'defi'] },
    });
  });

  it('should use semantic search when q is provided', async () => {
    mockOpenAiService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
    mockContractTemplateModel.aggregate.mockResolvedValue([
      { items: [{ name: 'StakingPool', score: 0.95 }], totalCount: [{ count: 1 }] },
    ]);

    const result = await service.findAll({ q: 'staking contract', page: 1, limit: 10 });

    expect(mockOpenAiService.generateEmbedding).toHaveBeenCalledWith('staking contract');
    expect(mockContractTemplateModel.aggregate).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should combine semantic search with tag filter', async () => {
    mockOpenAiService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
    mockContractTemplateModel.aggregate.mockResolvedValue([
      { items: [{ name: 'StakingPool', score: 0.9 }], totalCount: [{ count: 1 }] },
    ]);

    await service.findAll({ q: 'staking', tags: ['defi'], page: 1, limit: 10 });

    const pipeline = mockContractTemplateModel.aggregate.mock.calls[0][0];
    // Should have $vectorSearch then $match with tags filter
    expect(pipeline[0].$vectorSearch).toBeDefined();
    expect(pipeline.some((stage: any) => stage.$match?.tags)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern=marketplace.service.spec -v`
Expected: FAIL — `findAll` doesn't accept `q` param, old semantic search tests may conflict

**Step 3: Write implementation**

Update the `findAll` method signature and implementation in `marketplace.service.ts`:

```typescript
async findAll(query: {
  q?: string;
  page?: number;
  limit?: number;
  tags?: string[];
}): Promise<PaginatedResult<ContractTemplate>> {
  const page = query.page || 1;
  const limit = query.limit || 12;
  const skip = (page - 1) * limit;

  // Semantic search mode
  if (query.q) {
    const queryEmbedding = await this.openAiService.generateEmbedding(query.q);
    const numCandidates = Math.max(limit * 20, 200);

    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates,
          limit: numCandidates,
        },
      },
      { $addFields: { score: { $meta: 'vectorSearchScore' } } },
    ];

    if (query.tags?.length) {
      pipeline.push({ $match: { tags: { $in: query.tags } } });
    }

    pipeline.push({
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          { $project: { embedding: 0 } },
        ],
        totalCount: [{ $count: 'count' }],
      },
    });

    const [result] = await this.templateModel.aggregate(pipeline);
    const items = result.items || [];
    const total = result.totalCount?.[0]?.count || 0;

    return { items, total, page, limit };
  }

  // List mode (no search query)
  const filter: Record<string, any> = {};
  if (query.tags?.length) {
    filter.tags = { $in: query.tags };
  }

  const [items, total] = await Promise.all([
    this.templateModel
      .find(filter)
      .sort({ deployCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-embedding')
      .exec(),
    this.templateModel.countDocuments(filter).exec(),
  ]);

  return { items, total, page, limit };
}
```

Also remove or deprecate the standalone `semanticSearch()` method. If other code calls it, keep it as a thin wrapper:

```typescript
async semanticSearch(
  query: string,
  limit = 10,
): Promise<Array<ContractTemplate & { score: number }>> {
  const result = await this.findAll({ q: query, limit, page: 1 });
  return result.items as Array<ContractTemplate & { score: number }>;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern=marketplace.service.spec -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/marketplace/marketplace.service.ts backend/src/marketplace/marketplace.service.spec.ts
git commit -m "feat(marketplace): unify findAll with semantic search support"
```

---

### Task 4: Backend — Update controller to pass `q` param to unified `findAll`

**Files:**
- Modify: `backend/src/marketplace/marketplace.controller.ts`
- Test: `backend/src/marketplace/marketplace.controller.spec.ts`

**Step 1: Update the controller**

Merge the `search` endpoint into `findAll`. In `marketplace.controller.ts`:

1. Add `q` query param to the existing `findAll` method:

```typescript
@Public()
@Get()
@ApiOperation({ summary: 'List or search contract templates' })
@ApiQuery({ name: 'q', required: false, type: String, description: 'Semantic search query' })
@ApiQuery({ name: 'page', required: false, type: Number })
@ApiQuery({ name: 'limit', required: false, type: Number })
@ApiQuery({
  name: 'tags',
  required: false,
  type: String,
  description: 'Comma-separated tags',
})
@ApiResponse({ status: 200, description: 'Paginated list of templates' })
async findAll(
  @Query('q') q?: string,
  @Query('page') page?: number,
  @Query('limit') limit?: number,
  @Query('tags') tags?: string,
) {
  return this.marketplaceService.findAll({
    q: q || undefined,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
  });
}
```

2. Remove the separate `search` endpoint (the `@Get('search')` method). Or keep it for backward compat — but removing is cleaner.

**Step 2: Update controller tests**

Update `marketplace.controller.spec.ts`:

```typescript
describe('findAll', () => {
  it('should return paginated templates', async () => {
    mockMarketplaceService.findAll.mockResolvedValue({
      items: [{ name: 'Token' }],
      total: 1,
      page: 1,
      limit: 12,
    });

    const result = await controller.findAll(undefined, 1, 12, undefined);
    expect(result.items).toHaveLength(1);
    expect(mockMarketplaceService.findAll).toHaveBeenCalledWith({
      q: undefined,
      page: 1,
      limit: 12,
      tags: undefined,
    });
  });

  it('should pass search query to service', async () => {
    mockMarketplaceService.findAll.mockResolvedValue({
      items: [{ name: 'Staking', score: 0.9 }],
      total: 1,
      page: 1,
      limit: 12,
    });

    const result = await controller.findAll('staking', 1, 12, undefined);
    expect(mockMarketplaceService.findAll).toHaveBeenCalledWith({
      q: 'staking',
      page: 1,
      limit: 12,
      tags: undefined,
    });
    expect(result.items).toHaveLength(1);
  });

  it('should pass tags as array to service', async () => {
    mockMarketplaceService.findAll.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 12,
    });

    await controller.findAll(undefined, undefined, undefined, 'erc20, defi');
    expect(mockMarketplaceService.findAll).toHaveBeenCalledWith({
      q: undefined,
      page: undefined,
      limit: undefined,
      tags: ['erc20', 'defi'],
    });
  });
});
```

Remove the `search` describe block if removing the endpoint.

**Step 3: Run tests**

Run: `cd backend && npx jest --testPathPattern=marketplace.controller.spec -v`
Expected: ALL PASS

**Step 4: Run all backend tests to check nothing breaks**

Run: `cd backend && npm test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/marketplace/marketplace.controller.ts backend/src/marketplace/marketplace.controller.spec.ts
git commit -m "feat(marketplace): unify findAll controller with q param, remove search endpoint"
```

---

### Task 5: Backend — Enrich embedding text with source code summary

**Files:**
- Modify: `backend/src/marketplace/marketplace.service.ts`
- Test: `backend/src/marketplace/marketplace.service.spec.ts`

**Step 1: Write the failing test**

Update the existing `createTemplate` test in `marketplace.service.spec.ts`:

```typescript
describe('createTemplate', () => {
  it('should include source code summary in embedding text', async () => {
    const sources = {
      'Token.sol': { content: 'pragma solidity ^0.8.20;\n\ncontract Token {\n    function transfer() {}\n}' },
    };
    mockOpenAiService.enrichContract.mockResolvedValue({
      description: 'An ERC20 token',
      tags: ['erc20'],
      constructorArgs: {},
    });
    mockOpenAiService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
    mockContractTemplateModel.create.mockResolvedValue({
      _id: 'tmpl-1',
      name: 'TestToken',
    });

    await service.createTemplate({
      type: 'erc20',
      template: 'erc20',
      sources,
      contractName: 'TestToken',
      contractAddress: '0xabc',
      creatorId: 'user-1',
    });

    const embeddingCall = mockOpenAiService.generateEmbedding.mock.calls[0][0];
    expect(embeddingCall).toContain('TestToken');
    expect(embeddingCall).toContain('An ERC20 token');
    expect(embeddingCall).toContain('erc20');
    // Source code summary should be included
    expect(embeddingCall).toContain('pragma solidity');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern=marketplace.service.spec -v`
Expected: FAIL — embedding text doesn't contain source code

**Step 3: Write implementation**

Create a helper method and update `createTemplate` in `marketplace.service.ts`:

```typescript
private buildEmbeddingText(
  contractName: string,
  description: string,
  tags: string[],
  sources: Record<string, { content: string }>,
): string {
  const sourceText = Object.values(sources)
    .map((s) => s.content)
    .join('\n');
  const sourceSummary = sourceText.slice(0, 500);
  return `${contractName} ${description} ${tags.join(' ')} ${sourceSummary}`;
}
```

Update `createTemplate` to use it:

```typescript
const embeddingText = this.buildEmbeddingText(
  input.contractName,
  enrichment.description,
  enrichment.tags,
  input.sources,
);
const embedding = await this.openAiService.generateEmbedding(embeddingText);
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPattern=marketplace.service.spec -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/marketplace/marketplace.service.ts backend/src/marketplace/marketplace.service.spec.ts
git commit -m "feat(marketplace): include source code summary in embedding text"
```

---

### Task 6: Backend — Create embedding regeneration script

**Files:**
- Create: `backend/scripts/regenerate-embeddings.ts`

**Step 1: Write the script**

```typescript
/**
 * Regenerates embeddings for all ContractTemplate documents.
 * New embedding text includes source code summary for better search quality.
 *
 * Usage: npx ts-node scripts/regenerate-embeddings.ts
 * Requires: DB_CONNECTION_STRING and OPENAI_API_KEY in .env
 */
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const DB_URI =
  process.env.DB_CONNECTION_STRING ||
  'mongodb://localhost:27017/openai-func?directConnection=true';

const TemplateSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    tags: [String],
    type: String,
    template: String,
    sources: mongoose.Schema.Types.Mixed,
    contractName: String,
    constructorArgs: mongoose.Schema.Types.Mixed,
    originalDeployment: mongoose.Schema.Types.Mixed,
    embedding: [Number],
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'SmartUser' },
    deployCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'contracttemplates' },
);

const Template = mongoose.model('ContractTemplate', TemplateSchema);

function buildEmbeddingText(doc: any): string {
  const sourceText = Object.values(doc.sources || {})
    .map((s: any) => s.content)
    .join('\n');
  const sourceSummary = sourceText.slice(0, 500);
  const tags = (doc.tags || []).join(' ');
  return `${doc.contractName || doc.name} ${doc.description || ''} ${tags} ${sourceSummary}`;
}

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(DB_URI);
  console.log('Connected.');

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const templates = await Template.find({}).exec();
  console.log(`Found ${templates.length} templates to regenerate.`);

  for (let i = 0; i < templates.length; i++) {
    const doc = templates[i];
    const embeddingText = buildEmbeddingText(doc);
    console.log(`[${i + 1}/${templates.length}] Regenerating: ${doc.name}...`);

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: embeddingText,
        dimensions: 1536,
      });

      await Template.findByIdAndUpdate(doc._id, {
        embedding: response.data[0].embedding,
      });

      console.log(`  Done.`);
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
      // Rate limit: wait 1 second and retry
      if (err.status === 429) {
        console.log('  Rate limited, waiting 1s...');
        await new Promise((r) => setTimeout(r, 1000));
        i--; // Retry same template
      }
    }
  }

  console.log('\nAll embeddings regenerated.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
```

**Step 2: Commit (no test needed — one-time migration script)**

```bash
git add backend/scripts/regenerate-embeddings.ts
git commit -m "feat(marketplace): add embedding regeneration script with source code"
```

---

### Task 7: Frontend — Update types for unified endpoint

**Files:**
- Modify: `frontend/src/lib/types.ts`

**Step 1: Update types**

Add a `TagCount` type and update `MarketplaceSearchResult` to be part of the list response:

```typescript
// After MarketplaceSearchResult (line 117), add:
export interface TagCount {
  tag: string;
  count: number;
}
```

No other type changes needed — `MarketplaceListResponse` already covers the unified response shape. Items may optionally have `score` when searching.

**Step 2: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(marketplace): add TagCount type for tags endpoint"
```

---

### Task 8: Frontend — Rewrite TagFilter as multi-select dropdown

**Files:**
- Modify: `frontend/src/components/marketplace/tag-filter.tsx`

**Step 1: Rewrite the component**

Replace the entire file. Uses existing `DropdownMenu` + `DropdownMenuCheckboxItem` components (already installed):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDownIcon, XIcon } from 'lucide-react';
import api from '@/lib/api';
import type { TagCount } from '@/lib/types';

interface TagFilterProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagFilter({ selectedTags, onTagsChange }: TagFilterProps) {
  const [availableTags, setAvailableTags] = useState<TagCount[]>([]);

  useEffect(() => {
    api
      .get<TagCount[]>('/marketplace/tags')
      .then((res) => setAvailableTags(res.data))
      .catch(() => setAvailableTags([]));
  }, []);

  const handleToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const handleClearAll = () => {
    onTagsChange([]);
  };

  const handleRemoveTag = (tag: string) => {
    onTagsChange(selectedTags.filter((t) => t !== tag));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            Filter by tag
            <ChevronDownIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Tags</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableTags.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No tags available
            </div>
          ) : (
            availableTags.map(({ tag, count }) => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={selectedTags.includes(tag)}
                onCheckedChange={() => handleToggle(tag)}
                onSelect={(e) => e.preventDefault()}
              >
                {tag}
                <span className="ml-auto text-xs text-muted-foreground">
                  {count}
                </span>
              </DropdownMenuCheckboxItem>
            ))
          )}
          {selectedTags.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={false}
                onCheckedChange={handleClearAll}
                onSelect={(e) => e.preventDefault()}
                className="text-muted-foreground"
              >
                Clear all
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedTags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="cursor-pointer gap-1"
          onClick={() => handleRemoveTag(tag)}
        >
          {tag}
          <XIcon className="size-3" />
        </Badge>
      ))}
    </div>
  );
}
```

**Key changes from old component:**
- Props change: `onTagToggle(tag)` → `onTagsChange(tags[])` (batch update)
- Tags loaded from API instead of hardcoded
- DropdownMenu with CheckboxItems for multi-select
- Selected tags shown as removable badges
- `onSelect={(e) => e.preventDefault()}` keeps dropdown open after selection

**Step 2: Commit**

```bash
git add frontend/src/components/marketplace/tag-filter.tsx
git commit -m "feat(marketplace): rewrite tag filter as multi-select dropdown from DB"
```

---

### Task 9: Frontend — Rewrite TemplateGrid with pagination and URL state

This is the largest task. Replaces the broken Load More with numbered pagination, uses URL search params as single source of truth, and uses the unified backend endpoint.

**Files:**
- Modify: `frontend/src/components/marketplace/template-grid.tsx`
- Modify: `frontend/src/components/marketplace/search-bar.tsx`

**Step 1: Update SearchBar to support controlled value**

Update `search-bar.tsx` to accept a controlled `value` prop (for URL state sync):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  value?: string;
}

export function SearchBar({ onSearch, value: controlledValue }: SearchBarProps) {
  const [value, setValue] = useState(controlledValue ?? '');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  // Sync controlled value
  useEffect(() => {
    if (controlledValue !== undefined) {
      setValue(controlledValue);
    }
  }, [controlledValue]);

  useEffect(() => {
    // Skip debounce on first render to avoid redundant fetch
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onSearch(value), 300);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, onSearch]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search smart contracts..."
        className="pl-10"
      />
    </div>
  );
}
```

**Step 2: Rewrite TemplateGrid**

Replace the entire `template-grid.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateCard } from './template-card';
import { SearchBar } from './search-bar';
import { TagFilter } from './tag-filter';
import api from '@/lib/api';
import type { ContractTemplate, MarketplaceListResponse } from '@/lib/types';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

const LIMIT = 12;

export function TemplateGrid() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read state from URL
  const currentPage = Number(searchParams.get('page')) || 1;
  const searchQuery = searchParams.get('q') || '';
  const selectedTags = searchParams.get('tags')
    ? searchParams.get('tags')!.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Update URL params (single source of truth)
  const updateParams = useCallback(
    (updates: { q?: string; tags?: string[]; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (updates.q !== undefined) {
        if (updates.q) params.set('q', updates.q);
        else params.delete('q');
      }
      if (updates.tags !== undefined) {
        if (updates.tags.length > 0) params.set('tags', updates.tags.join(','));
        else params.delete('tags');
      }
      if (updates.page !== undefined) {
        if (updates.page > 1) params.set('page', String(updates.page));
        else params.delete('page');
      }

      // Reset page to 1 when search/tags change (unless page is explicitly set)
      if ((updates.q !== undefined || updates.tags !== undefined) && updates.page === undefined) {
        params.delete('page');
      }

      const qs = params.toString();
      router.push(qs ? `/marketplace?${qs}` : '/marketplace');
    },
    [router, searchParams],
  );

  // Fetch from unified endpoint
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: LIMIT,
      };
      if (searchQuery) params.q = searchQuery;
      if (selectedTags.length > 0) params.tags = selectedTags.join(',');

      const res = await api.get<MarketplaceListResponse>('/marketplace', { params });
      setTemplates(res.data.items);
      setTotal(res.data.total);
    } catch {
      setTemplates([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery, selectedTags.join(',')]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const totalPages = Math.ceil(total / LIMIT);

  const handleSearch = useCallback(
    (query: string) => {
      updateParams({ q: query });
    },
    [updateParams],
  );

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      updateParams({ tags });
    },
    [updateParams],
  );

  const handlePageChange = (newPage: number) => {
    updateParams({ q: searchQuery || undefined, tags: selectedTags, page: newPage });
  };

  // Generate page numbers to display
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="space-y-6">
      <SearchBar onSearch={handleSearch} value={searchQuery} />
      <TagFilter selectedTags={selectedTags} onTagsChange={handleTagsChange} />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No templates found. Try a different search.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <TemplateCard key={template._id} template={template} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeftIcon className="size-4" />
              </Button>

              {getPageNumbers().map((pageNum, idx) =>
                pageNum === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={pageNum}
                    variant={pageNum === currentPage ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    className="min-w-9"
                  >
                    {pageNum}
                  </Button>
                ),
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

**Key changes:**
- URL search params as single source of truth (no local state for q/tags/page)
- Single unified API call to `GET /marketplace` with all params
- Numbered pagination replaces Load More
- `updateParams()` batches param changes to avoid race conditions
- `selectedTags.join(',')` in useCallback deps ensures proper memoization

**Step 3: Verify the app builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/components/marketplace/template-grid.tsx frontend/src/components/marketplace/search-bar.tsx
git commit -m "feat(marketplace): numbered pagination, URL state, unified search endpoint"
```

---

### Task 10: Backend — Run migration script against production DB

**Prerequisites:** Get the production MongoDB connection string from Dokploy dashboard at `http://92.4.216.135:3000`.

**Step 1: Get production DB_CONNECTION_STRING from Dokploy**

Navigate to Dokploy → backend service → environment variables → copy `DB_CONNECTION_STRING`.

**Step 2: Run migration script**

```bash
cd backend
DB_CONNECTION_STRING="<production-connection-string>" OPENAI_API_KEY="<key>" npx ts-node scripts/regenerate-embeddings.ts
```

Expected output:
```
Connecting to MongoDB...
Connected.
Found N templates to regenerate.
[1/N] Regenerating: SimpleToken...
  Done.
[2/N] Regenerating: StakingPool...
  Done.
...
All embeddings regenerated.
```

**Step 3: Verify search quality**

Test semantic search against production DB to confirm improved results:

```bash
curl "https://api.chaincraft.app/marketplace?q=staking+rewards&limit=5" | jq '.items[].name'
```

Expected: StakingPool should rank high. Results should be more relevant than before.

---

### Task 11: Integration test — Verify full flow locally

**Step 1: Start backend locally pointing to production DB**

```bash
cd backend
DB_CONNECTION_STRING="<production-connection-string>" npm run start:dev
```

**Step 2: Test endpoints manually**

```bash
# List with pagination
curl "http://localhost:3001/marketplace?page=1&limit=2" | jq

# Tags endpoint
curl "http://localhost:3001/marketplace/tags" | jq

# Search with tags
curl "http://localhost:3001/marketplace?q=token&tags=erc20&page=1&limit=5" | jq
```

**Step 3: Start frontend and verify UI**

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000/marketplace` and verify:
- Templates load with pagination
- Tag dropdown shows tags from DB with counts
- Search + tag filter work together
- Pagination updates URL
- URL state survives page refresh
- Back/forward navigation works

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(marketplace): integration fixes"
```

---

## Summary of all tasks

| # | Task | Type | Files |
|---|------|------|-------|
| 1 | Add `getDistinctTags()` to service | Backend | service + spec |
| 2 | Add `GET /marketplace/tags` endpoint | Backend | controller + spec |
| 3 | Unified `findAll()` with semantic search | Backend | service + spec |
| 4 | Update controller for unified endpoint | Backend | controller + spec |
| 5 | Enrich embedding text with source code | Backend | service + spec |
| 6 | Create embedding regeneration script | Backend | new script |
| 7 | Update frontend types | Frontend | types.ts |
| 8 | Rewrite TagFilter as dropdown | Frontend | tag-filter.tsx |
| 9 | Rewrite TemplateGrid with pagination | Frontend | template-grid.tsx + search-bar.tsx |
| 10 | Run migration script on production | Ops | — |
| 11 | Integration test full flow | Test | — |
