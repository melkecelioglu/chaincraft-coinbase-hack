# Contract Marketplace Design

Date: 2026-02-25

## Problem

- Deployed contracts are stored as flat JSON strings — not reusable
- No way to redeploy a previously deployed contract with new parameters
- No discoverability — no descriptions, tags, or search
- No marketplace for sharing contract templates

## Decision

Add a **ContractTemplate** collection as a public marketplace of reusable contract blueprints. Every deploy automatically creates a marketplace entry with AI-generated description, tags, and a vector embedding for semantic search. MongoDB upgraded to 8.2 with mongot for native `$vectorSearch`.

## Schema: ContractTemplate

New collection alongside existing Token (which remains as deploy log).

```
ContractTemplate
├── name: string              — contract name (e.g. "BurnableERC20")
├── description: string       — AI-generated summary
├── tags: string[]            — AI-generated (e.g. ["erc20", "burnable", "defi"])
├── type: 'erc20' | 'custom-contract'
├── template?: string         — "erc20" for template deploys
├── sources: object           — { "Contract.sol": { content: "..." } }
├── contractName: string      — main contract name for compilation
├── constructorArgs: object   — schema of required args with types/descriptions
├── originalDeployment: {
│     contractAddress: string
│     chain: string
│     deployedAt: string
│   }
├── embedding: number[]       — 1536-dim vector (text-embedding-3-small)
├── creator: ObjectId (User)  — who first deployed
├── deployCount: number       — incremented on each redeploy
├── timestamps                — createdAt, updatedAt
```

Token schema stays unchanged — tracks individual deployments.

## AI Enrichment

After every deploy, a single gpt-5.2 call generates:
- `description`: 1-2 sentence summary
- `tags`: 3-8 relevant tags
- `constructorArgs`: schema with type and description for each arg

Uses structured JSON output (`text: { format: { type: 'json_object' } }`).

## Vector Search

- MongoDB 8.2 + mongot sidecar for native `$vectorSearch`
- Embedding: `name + description + tags.join(' ')` → `text-embedding-3-small` (1536 dims)
- `$vectorSearch` index on `ContractTemplate.embedding`
- Search endpoint returns top-N similar templates by cosine similarity

### Docker Compose

```yaml
services:
  mongod:
    image: mongodb/mongodb-community-server:8.2.0-ubi9
    command: mongod --replSet rs0 --bind_ip_all
    ports: ['27017:27017']
    volumes: [mongo-data:/data/db]
  mongot:
    image: mongodb/mongodb-community-search:0.53.1
    ports: ['27028:27028']
    volumes: [mongot-data:/data/mongot]
    depends_on: [mongod]
volumes:
  mongo-data:
  mongot-data:
```

Requires replica set init: `rs.initiate()` after first start.

## Endpoints

### New (MarketplaceModule)

| Endpoint | Description |
|---|---|
| `GET /marketplace` | List all templates (paginated, filter by tags) |
| `GET /marketplace/search?q=...` | Vector search by natural language description |
| `GET /marketplace/:id` | Template details (sources, args schema, deploy count) |
| `POST /marketplace/:id/deploy` | Redeploy with new constructor args |

### Unchanged

- `POST /contracts/deploy` — now also creates ContractTemplate entry
- `POST /assistants/chat` — tool dispatch also creates ContractTemplate entry
- All other endpoints unchanged

## Flows

### Deploy → Marketplace Entry

```
Deploy (via /contracts/deploy or AI chat)
  → BlockchainService.deploy()
  → Token record created (deploy log)
  → AI: gpt-5.2 generates { description, tags, constructorArgs schema }
  → OpenAI: text-embedding-3-small generates embedding
  → ContractTemplate record created (marketplace)
```

### Redeploy from Marketplace

```
POST /marketplace/:id/deploy { constructorArgs: { name: "New", symbol: "NW" } }
  → Fetch ContractTemplate (get sources, type)
  → Validate provided args match schema
  → BlockchainService.deploy() with user's wallet
  → New Token record (deploy log)
  → Increment ContractTemplate.deployCount
  → Return { contractAddress, tokenId }
```

### Semantic Search

```
GET /marketplace/search?q=staking contract with rewards
  → OpenAI: embed query text
  → $vectorSearch on ContractTemplate.embedding
  → Return top-N templates with similarity scores
```

## Module Structure

```
MarketplaceModule (new)
├── MarketplaceController  — endpoints above
├── MarketplaceService     — template CRUD, search, redeploy
├── ContractTemplate schema
└── imports: OpenAiModule, BlockchainModule, AuthModule, TokensModule

OpenAiService (updated)
└── + generateEmbedding(text) method
└── + enrichContract(sources, contractName) method
```
