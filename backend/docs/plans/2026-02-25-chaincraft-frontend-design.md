# ChainCraft Frontend Design

**Date:** 2026-02-25
**Status:** Approved

## Overview

Frontend application for the openai-func backend API. A ChatGPT-style AI chat interface for generating and deploying smart contracts, plus a marketplace for discovering and redeploying contract templates.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Next.js 15 (App Router) | Framework, routing, SSR/SSG |
| Tailwind CSS v4 | Styling |
| shadcn/ui | UI component library (Tailwind-native) |
| next-themes | Dark/Light theme toggle |
| zustand | Client-side state management |
| localStorage | Chat history persistence |

## Pages & Routing

```
/                    → Auth check → redirect to /chat or /login
/login               → Login form (Public)
/register            → Register form (Public)
/chat                → Main chat interface (Authenticated)
/marketplace         → Template grid (Public, deploy requires auth)
/marketplace/[id]    → Template detail + deploy form (Public, deploy requires auth)
```

### Layout Hierarchy

```
RootLayout (ThemeProvider, font, metadata)
├── (auth)/layout    → Centered form layout
│   ├── login/
│   └── register/
├── (app)/layout     → Navbar + auth wrapper
│   ├── chat/
│   ├── marketplace/
│   └── marketplace/[id]/
└── middleware.ts     → Route protection
```

## Chat Interface

### Layout: Split View

Left sidebar (~280px, collapsible) + right chat area.

### Sidebar

```
┌─────────────────┐
│ [+ New Chat]    │
│                 │
│ ── Chats ──     │
│ Today           │
│  • ERC20 Token  │  ← localStorage
│  • Staking...   │
│ Yesterday       │
│  • Governance   │
│                 │
│ ── Projects ──  │
│  • MyDeFi       │  ← GET /projects
│  • TestProject  │
│                 │
│ ── Tokens ──    │
│  5 deployed     │  ← GET /tokens (count)
│  [View All →]   │
└─────────────────┘
```

- Chat history from localStorage; title auto-generated from first message
- Projects fetched from API; clicking sets project context for chat
- Tokens count shown; expandable list

### Chat Area

**Empty state (new conversation):**

```
         ChainCraft
    What do you want to build?

  ┌──────────────────────────────────┐
  │ Describe your smart contract...  │
  └──────────────────────────[Send]──┘

  [Deploy ERC20]  [Staking Contract]
  [Governance DAO] [Custom Contract]
```

Suggestion cards send pre-filled prompts to the chat.

**Active chat state:**

Messages rendered as bubbles (user + AI). AI messages support:
- Markdown rendering with syntax highlighting for code blocks
- Deployment cards (special component) when `deployments[]` is non-empty

### Deployment Card

Rendered inline within AI messages when a contract is deployed:

```
┌─── Deployment Card ─────────────┐
│ MyToken (MTK) deployed           │
│ 0x1234...5678                    │
│ View on Explorer  |  Copy        │
│ Type: ERC20 | Chain: Base Sepolia│
└──────────────────────────────────┘
```

Contents: contract name, truncated address (copyable), explorer link, type badge, chain info.

### Chat Flow

1. User sends message → `POST /assistants/chat` with `{ message, projectId?, previousResponseId? }`
2. Loading state shown (thinking animation)
3. Response: `message` rendered as markdown, `deployments[]` rendered as DeploymentCards
4. `responseId` stored for conversation continuity
5. Conversation saved to localStorage after each exchange

## Marketplace

### Grid Page (`/marketplace`)

```
┌──────────────────────────────────────────────────┐
│  Search bar                                      │
│  [All] [erc20] [governance] [staking] [defi]     │
│                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Name       │  │ Name       │  │ Name       │ │
│  │ Description│  │ Description│  │ Description│ │
│  │ [tags]     │  │ [tags]     │  │ [tags]     │ │
│  │ deploys    │  │ deploys    │  │ deploys    │ │
│  │ by @user   │  │ by @user   │  │ by @user   │ │
│  └────────────┘  └────────────┘  └────────────┘ │
│                                                  │
│              [Load More / Pagination]            │
└──────────────────────────────────────────────────┘
```

**Template Card contents:**
- Contract name (heading)
- AI-generated description (2 lines, truncated)
- Tags as badges (shadcn Badge)
- Deploy count
- Creator username
- Clickable → `/marketplace/[id]`

**Search behavior:**
- Debounced input (300ms) → `GET /marketplace/search?q=...` (semantic vector search)
- Empty input → `GET /marketplace?page=1&limit=12` (paginated list, sorted by deployCount)

**Tag filtering:**
- Click tag chips → `GET /marketplace?tags=erc20`
- Multiple tags selectable (comma-separated)

### Template Detail Page (`/marketplace/[id]`)

Sections:
1. **Header:** Name, creator, deploy count, chain
2. **Description:** Full AI-generated description
3. **Tags:** Badge list
4. **Source Code:** Syntax-highlighted Solidity source viewer (read-only)
5. **Deploy Form:** Dynamic fields from `constructorArgs` schema + optional project selector + deploy button
6. **Original Deployment:** Contract address, chain, date

**Dynamic deploy form:**
- Fields generated from `constructorArgs` schema: `{ [name]: { type, description } }`
- Type mapping: `string` → text input, `uint256` → number input
- Optional project dropdown (user's projects from API)
- Submit → `POST /marketplace/[id]/deploy` with `{ constructorArgs, projectId? }`
- Loading state during deploy, success card on completion

## Auth Pages

### Login (`/login`)

Centered card with:
- Email input
- Password input (min 6 chars)
- Sign In button
- Link to register

### Register (`/register`)

Same layout, additional fields:
- Name
- Username
- Email
- Password (min 6 chars)
- Sign Up button
- Link to login

Post-register: auto-login + redirect to `/chat`.

## State Management (zustand)

### Auth Store

```typescript
interface AuthStore {
  token: string | null;
  user: UserProfile | null;  // { walletAddress, walletMnemonic, email, username, name }
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
}
```

- JWT token persisted via zustand persist middleware (localStorage)
- API client attaches `Authorization: Bearer <token>` header via interceptor
- 401 response → clear token, redirect to `/login`

### Chat Store

```typescript
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  responseId: string | null;
  projectId: string | null;
  createdAt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  deployments?: Deployment[];
  timestamp: string;
}

interface ChatStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  sendMessage: (text: string, projectId?: string) => Promise<void>;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}
```

- All conversations persisted to localStorage
- Title auto-generated: first 40 chars of first user message
- Grouped by date in sidebar (Today, Yesterday, Previous 7 Days, etc.)

### Project Store

```typescript
interface ProjectStore {
  projects: Project[];
  selectedProjectId: string | null;
  fetchProjects: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  selectProject: (id: string | null) => void;
}
```

## Theme

- Dark + Light mode toggle via `next-themes`
- shadcn/ui CSS variables for theme colors
- Default: system preference
- Toggle in navbar (sun/moon icon)

## File Structure

```
frontend/
├── app/
│   ├── layout.tsx
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx
│   │   ├── chat/page.tsx
│   │   ├── marketplace/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── page.tsx
│   └── middleware.ts
├── components/
│   ├── ui/                     ← shadcn/ui (auto-generated)
│   ├── chat/
│   │   ├── chat-sidebar.tsx
│   │   ├── chat-area.tsx
│   │   ├── chat-input.tsx
│   │   ├── message-bubble.tsx
│   │   ├── deployment-card.tsx
│   │   └── suggestion-cards.tsx
│   ├── marketplace/
│   │   ├── template-card.tsx
│   │   ├── template-grid.tsx
│   │   ├── search-bar.tsx
│   │   ├── tag-filter.tsx
│   │   └── deploy-form.tsx
│   ├── layout/
│   │   ├── navbar.tsx
│   │   ├── theme-toggle.tsx
│   │   └── user-menu.tsx
│   └── auth/
│       ├── login-form.tsx
│       └── register-form.tsx
├── stores/
│   ├── auth-store.ts
│   ├── chat-store.ts
│   └── project-store.ts
├── lib/
│   ├── api.ts                  ← Axios instance + interceptors
│   ├── utils.ts                ← shadcn cn() utility
│   └── types.ts                ← Shared TypeScript types
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

## API Integration Reference

| Frontend Feature | API Endpoint | Method |
|-----------------|-------------|--------|
| Login | `/auth/login` | POST |
| Register | `/auth/register` | POST |
| Get user profile | `/auth/user` | GET |
| Send chat message | `/assistants/chat` | POST |
| List projects | `/projects` | GET |
| Create project | `/projects` | POST |
| Delete project | `/projects/:id` | DELETE |
| List tokens | `/tokens` | GET |
| List marketplace | `/marketplace` | GET |
| Search marketplace | `/marketplace/search` | GET |
| Get template detail | `/marketplace/:id` | GET |
| Deploy from marketplace | `/marketplace/:id/deploy` | POST |

## Key Design Decisions

1. **Chat history in localStorage** — No backend persistence needed. Simple, fast. Trade-off: no cross-device sync.
2. **Projects/Tokens in sidebar only** — No separate dashboard page. Keeps the focus on chat as the primary interface.
3. **shadcn/ui** — Tailwind-native, fully customizable, accessible. Cards, Badges, Inputs, Sheets all needed.
4. **zustand over Context** — Simpler API, built-in localStorage persist middleware, no provider nesting.
5. **Separate marketplace pages** — Grid for browsing, detail page for deploy. SEO-friendly URLs.
6. **Dynamic deploy forms** — Generated from `constructorArgs` schema, no hardcoded form for each template type.
