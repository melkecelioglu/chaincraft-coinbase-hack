# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo with NestJS backend API and Next.js frontend for blockchain/smart contract management with OpenAI integration. Uses OpenAI Responses API (gpt-5.2) for AI-driven contract generation and analysis, ethers.js + solc-js for contract compilation (Base Sepolia), backed by MongoDB 8.2 with mongot for vector search. Includes a contract marketplace with AI-enriched templates and semantic search.

**Auth:** RainbowKit wallet connect + SIWE (EIP-4361) sign-in. No email/password. Backend issues JWT after wallet signature verification. Frontend uses wagmi + viem for wallet interactions.

**Deploy flow:** Frontend-side. Backend compiles contracts (returns ABI + bytecode), user's wallet signs deploy tx via wagmi, then frontend registers deployment with backend.

## Repository Structure

```
openai-func/
├── backend/                    # NestJS backend API
│   ├── src/
│   ├── test/
│   ├── scripts/
│   ├── docker/                 # MongoDB configs (mongod.conf, mongot.conf, etc.)
│   ├── docs/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env                    # Backend environment variables
├── frontend/                   # Next.js frontend
│   ├── src/
│   ├── package.json
│   ├── Dockerfile
│   └── ...
├── docker-compose.yml          # Full stack: MongoDB + backend + frontend
├── docker-compose.test.yml     # E2E test stack
├── .gitignore
├── CLAUDE.md
└── README.md
```

## Commands

All backend commands run from `backend/`:
```bash
cd backend
npm run build              # Compile TypeScript (nest build)
npm start                  # Development mode
npm run start:dev          # Watch mode (hot reload)
npm run start:debug        # Debug with inspector
npm run start:prod         # Production (runs dist/)
npm run lint               # ESLint with auto-fix
npm run format             # Prettier formatting
npm test                   # Jest unit tests
npm run test:watch         # Jest watch mode
npm run test:cov           # Jest with coverage
npm run test:e2e           # End-to-end tests (supertest)
```

Run a single test file: `cd backend && npx jest --testPathPattern=<pattern>`

Docker (from root):
```bash
docker compose up -d --build     # Start full stack
docker compose -f docker-compose.test.yml up -d --build  # Start test stack
```

## Architecture

NestJS modular architecture — no app-level service/controller. Each domain module owns its own controller, service, and DTOs. Global JWT auth guard applied via `APP_GUARD`.

```
AppModule (root — only wiring, no controllers/services)
├── AuthModule         — /auth/*   — SIWE wallet auth (nonce, verify), JWT issuance
├── ProjectsModule     — /projects/* — Project CRUD per user
├── TokensModule       — /tokens/* — Token/contract records, DB persistence for deploys
├── OpenAiModule       — /assistants/* — AI chat with auto tool dispatch
│   ├── OpenAiService         — OpenAI Responses API wrapper (gpt-5.2), embeddings, AI enrichment
│   └── ToolDispatchService   — Routes tool calls to BlockchainService, returns compile results for frontend deploy
├── BlockchainModule   — ethers.js + solc-js contract compilation (ERC20, custom), exports SolcService
├── ContractsModule    — /contracts/* — Solidity analysis, compile, register frontend deploys
│   ├── ContractAnalysisService — Syntax validation via @solidity-parser/parser
│   └── ContractsController     — analyze, compile, register deployment, get contract by ID
├── MarketplaceModule  — /marketplace/* — Contract template marketplace with vector search
│   ├── MarketplaceService      — Template CRUD, compile for redeploy, semantic search via $vectorSearch
│   └── MarketplaceController   — list, search, detail, redeploy endpoints
└── MongooseModule     — MongoDB connection via ConfigService
```

**Request flow:** HTTP → JwtAuthGuard (global, skipped for `@Public()` routes) → Module Controller → Module Service → Mongoose Model / External API → Response

### API routes

| Route prefix | Module | Controller | Endpoints |
|---|---|---|---|
| `/auth` | AuthModule | AuthController | GET /nonce, POST /verify, GET /user, GET /balance |
| `/projects` | ProjectsModule | ProjectsController | CRUD |
| `/tokens` | TokensModule | TokensController | CRUD, type filter, project filter |
| `/assistants` | OpenAiModule | AssistantController | POST /chat |
| `/contracts` | ContractsModule | ContractsController | POST /analyze, POST /compile, POST /deploy, POST /register, GET /:id |
| `/marketplace` | MarketplaceModule | MarketplaceController | GET / (list), GET /search, GET /:id, POST /:id/deploy |

### Cross-module dependencies

- **OpenAiModule** imports BlockchainModule + MarketplaceModule (ToolDispatchService compiles contracts, returns results for frontend deploy)
- **ContractsModule** imports OpenAiModule + BlockchainModule + TokensModule (analysis uses OpenAI, compile uses solc-js, register saves to DB)
- **MarketplaceModule** imports OpenAiModule + BlockchainModule + TokensModule (AI enrichment + embedding, compile for redeploy)
- OpenAiModule ↔ MarketplaceModule use `forwardRef` to resolve circular dependency
- All other modules are self-contained

### Database schemas (MongoDB/Mongoose)

- **SmartUser** — walletAddress (unique, required), name (optional), username (optional)
- **Project** — name, user (ObjectId ref)
- **Token** — type (enum: erc20/custom-contract), data (JSON string), user (ObjectId ref), project (ObjectId ref, optional)
- **ContractTemplate** — name, description, tags[], type, template?, sources, contractName, constructorArgs schema, originalDeployment, embedding (1536-dim vector), creator (ObjectId ref), deployCount

### Ownership model

All resource ownership uses `user` field (ObjectId reference to SmartUser), not email. Controllers compare `String(resource.user)` against `@GetUser('id')` for authorization.

## Environment Variables

Required in `backend/.env`:
```
OPENAI_API_KEY, JWT_SECRET, DB_CONNECTION_STRING, BASE_SEPOLIA_RPC_URL
```

Optional in `backend/.env`:
```
PORT (default: 3001), CORS_ORIGIN (default: true), BASESCAN_API_KEY
```

Optional in `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL (default: http://localhost:3001)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (for WalletConnect v2)
```

Swagger docs at `/api`.

## Docker / MongoDB Setup

MongoDB 8.2 Community Server + mongot sidecar for native `$vectorSearch`. Full stack via Docker Compose:

```bash
docker compose up -d --build                        # Start full stack (MongoDB + backend + frontend)
node backend/scripts/create-vector-index.js         # Create vector search index (one-time)
```

The replica set is auto-initialized by the setup container. Connection string uses `?directConnection=true` for host access.

## Code Conventions

- Prettier: single quotes, trailing commas
- ESLint: flat config (`backend/eslint.config.mjs`), `@typescript-eslint/recommended` + prettier
- DTOs use `class-validator` decorators; `ValidationPipe({ whitelist: true })` strips unknown props
- Controllers use `@nestjs/swagger` decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)
- NestJS `Logger` for all logging (no `console.log`)
- Unused function params prefixed with `_`
- Each module owns its controller, service, DTOs, and schemas — no shared app-level service

## Figma MCP Integration Rules

This project has a backend API and a Next.js frontend. When implementing UI from Figma designs that consumes this API, follow these rules.

### Required Flow (do not skip)

1. Run `get_design_context` first to fetch the structured representation for the exact node(s)
2. If the response is too large or truncated, run `get_metadata` to get the high-level node map, then re-fetch only the required node(s) with `get_design_context`
3. Run `get_screenshot` for a visual reference of the node variant being implemented
4. Only after you have both `get_design_context` and `get_screenshot`, download any assets needed and start implementation
5. Validate against Figma for 1:1 look and behavior before marking complete

### API-Aware Implementation Rules

- IMPORTANT: All frontend components that call this API must match the DTOs defined in `backend/src/*/dto/` — check DTO shapes before building forms or data displays
- IMPORTANT: Auth uses RainbowKit wallet connect + SIWE. Backend: `GET /auth/nonce` then `POST /auth/verify` with SIWE message+signature to get JWT. Current user: `GET /auth/user`
- API base URL is configured via environment; default port is `3001`
- Swagger docs at `/api` are the source of truth for request/response shapes
- All resource endpoints require `Authorization: Bearer <token>` header except routes decorated with `@Public()`

### API Route → UI Mapping Reference

| API Route | Typical UI Component |
|---|---|
| RainbowKit ConnectButton | Wallet connect + SIWE sign-in (replaces auth forms) |
| `GET /auth/user` | User profile display |
| `/projects/*` | Project list, project detail, CRUD forms |
| `/tokens/*` | Token/contract records table, filter controls |
| `POST /assistants/chat` | Chat interface with streaming AI responses |
| `POST /contracts/analyze` | Solidity code input with analysis results display |
| `POST /contracts/compile` | Compile contract, returns ABI+bytecode for frontend deploy |
| `POST /contracts/register` | Register frontend-deployed contract in DB |
| `GET /marketplace`, `GET /marketplace/search` | Marketplace grid/list with search bar |
| `GET /marketplace/:id`, `POST /marketplace/:id/deploy` | Template detail page with redeploy action |

### Data Model Conventions

- All entities use MongoDB ObjectId as `_id` — display as string, never expose raw ObjectId in UI
- User ownership is by ObjectId reference (`user` field), identified by walletAddress
- Token `data` field is a JSON string — parse before displaying
- ContractTemplate `tags` is a string array — render as chips/badges
- ContractTemplate `constructorArgs` is a schema object describing deploy-time parameters — generate dynamic form fields from it

### Asset Handling

- IMPORTANT: If the Figma MCP server returns a localhost source for an image or SVG, use that source directly
- IMPORTANT: DO NOT import/add new icon packages — all assets should come from the Figma payload
- IMPORTANT: DO NOT use or create placeholders if a localhost source is provided

### Styling Conventions for Frontend

- Treat the Figma MCP output (React + Tailwind) as the design representation, not necessarily the final code style
- If a different framework or styling approach is chosen for the frontend, translate accordingly while maintaining 1:1 visual parity with Figma
- Reuse existing components before creating new ones
- Validate the final UI against the Figma screenshot for both look and behavior
