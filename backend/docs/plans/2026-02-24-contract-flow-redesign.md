# Contract Flow Redesign

Date: 2026-02-24

## Problem

- Assistants API sunsets August 2026 — must migrate
- Models outdated: o1, o3-mini, gpt-4o all retired
- Deploy results not persisted to DB
- Deploy endpoint hardcoded to ERC20 only
- Assistant creation endpoints create new assistants every call (no caching)
- Polling mechanism is fragile and slow

## Decision

Migrate entirely to OpenAI Responses API with gpt-5.2. Single model for all AI tasks. General-purpose deploy supporting both templates and custom Solidity contracts. All deploys recorded in DB.

## AI Layer: Responses API + GPT-5.2

### What changes

- Replace Assistants API (threads, runs, polling) with Responses API `openai.responses.create()`
- Replace Chat Completions (o1, o3-mini) with Responses API (gpt-5.2)
- Single model `gpt-5.2` for all tasks: analyze, generate, chat
- Structured Outputs with `strict: true` for guaranteed JSON responses
- Conversation chaining via `previous_response_id` (no thread management)
- Built-in agentic loop handles multi-tool calls in single request

### What gets deleted

- `AssistantRunService` — polling mechanism
- `createGeneralAssistant()`, `createAnalyzerAssistant()` methods
- `POST /assistants/general`, `POST /assistants/analyzer` endpoints
- `GET /assistants/run` endpoint

### What replaces it

- `OpenAiService` rewritten — wraps `openai.responses.create()`
- `ToolDispatchService` — routes tool calls to BlockchainService/OpenAiService
- `POST /assistants/chat` — single endpoint, sends message, Responses API dispatches tools automatically

### Function tools defined

1. `deployERC20` — name, symbol, totalSupply
2. `deployCustomContract` — sources, contractName, constructorArgs
3. `generateContract` — contractDescription → returns Solidity code

## Deploy: General-Purpose + DB Persistence

### Two deploy modes via single endpoint

**Template deploy** (ERC20 etc):
```json
{
  "template": "erc20",
  "params": { "name": "MyCoin", "symbol": "MC", "totalSupply": 1000000 },
  "projectId": "optional"
}
```

**Custom deploy** (any Solidity contract):
```json
{
  "sources": { "MyContract.sol": { "content": "pragma solidity..." } },
  "contractName": "MyContract",
  "constructorArgs": { "_owner": "0x...", "_fee": "100" },
  "projectId": "optional"
}
```

Validation: `template` XOR `sources` must be present.

### DB persistence

Every deploy creates a Token record:
```json
{
  "type": "erc20 | custom-contract",
  "data": {
    "contractAddress": "0x...",
    "contractName": "MyContract",
    "template": "erc20",
    "params": {},
    "constructorArgs": {},
    "sources": {},
    "deployedAt": "2026-02-24T..."
  },
  "user": "userId",
  "project": "projectId"
}
```

Tool call dispatches from chat endpoint also create Token records.

## Endpoint Changes

### Removed

| Endpoint | Reason |
|----------|--------|
| `POST /assistants/general` | No more assistant creation |
| `POST /assistants/analyzer` | No more assistant creation |
| `GET /assistants/run` | No more polling |

### New/Updated

| Endpoint | Description |
|----------|-------------|
| `POST /assistants/chat` | Chat with AI, auto tool dispatch + DB persist |
| `POST /contracts/deploy` | Programmatic deploy (template or custom) + DB persist |
| `GET /contracts/:id` | Get deployed contract details from Token record |

### Unchanged

- `/auth/*` — register, login, user profile
- `/projects/*` — CRUD
- `/tokens/*` — CRUD, type filter, project filter

## Module Structure

```
OpenAiModule (rewritten)
├── OpenAiService        — Responses API wrapper
├── ToolDispatchService  — Tool call routing
└── AssistantController  — POST /chat

ContractsModule (updated)
├── ContractsController  — POST /deploy, GET /:id
├── ContractAnalysisService — Syntax validation (kept)
└── (TokensService injected for DB persist)
```

## Flow

```
User: "Create a BurnToken ERC20 and deploy it"
  → POST /assistants/chat { message: "..." }
  → OpenAiService → gpt-5.2 Responses API
  → tool call: generateContract → Solidity code
  → tool call: deployCustomContract → 0xabc...
  → TokensService.create() → DB record
  → Response: { contractAddress, tokenId, message }
```
