# ChainCraft Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js frontend with ChatGPT-style AI chat for smart contract generation/deployment and a marketplace for contract templates.

**Architecture:** Next.js 15 App Router with route groups `(auth)` and `(app)`. zustand stores for auth (persisted JWT), chat (persisted conversations), and projects. API client with axios interceptor for JWT. shadcn/ui components styled with Tailwind CSS v4.

**Tech Stack:** Next.js 15, Tailwind CSS v4, shadcn/ui, next-themes, zustand, axios, react-markdown, react-syntax-highlighter

**Backend API base:** `http://localhost:3001` (configurable via `NEXT_PUBLIC_API_URL` env var)

**Project directory:** `frontend/` — The frontend project lives inside the main repo at `/Users/gokbot/Documents/projects/openai-func/frontend/`. All file paths below use `frontend/` as the root.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `frontend/` (entire project directory)

**Step 1: Create Next.js project**

```bash
cd /Users/gokbot/Documents/projects/openai-func
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
```

When prompted, accept defaults. This creates the project with App Router, TypeScript, Tailwind CSS, ESLint, and `src/` directory.

**Step 2: Install dependencies**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm install zustand axios next-themes react-markdown react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

**Step 3: Initialize shadcn/ui**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npx shadcn@latest init -d
```

Accept defaults (New York style, zinc color, CSS variables: yes).

**Step 4: Add required shadcn/ui components**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npx shadcn@latest add button card input label badge sheet scroll-area separator dropdown-menu avatar skeleton textarea select
```

**Step 5: Create environment file**

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**Step 6: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

Expected: Build succeeds.

**Step 7: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/
git commit -m "feat: scaffold ChainCraft frontend with Next.js 15, shadcn/ui, and dependencies"
```

---

## Task 2: Shared Types and API Client

**Files:**
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/utils.ts` (already exists from shadcn, verify)

**Step 1: Create shared TypeScript types**

Create `frontend/src/lib/types.ts`:

```typescript
// Auth types — matches backend DTOs exactly
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  email: string;
  username: string;
  walletAddress: string;
}

export interface RegisterResponse {
  token: string;
}

export interface UserProfile {
  walletAddress: string;
  walletMnemonic: string;
  email: string;
  username: string;
  name: string;
}

// Project types
export interface Project {
  _id: string;
  name: string;
  user: string;
  createdAt: string;
  updatedAt: string;
}

// Token types
export enum TokenType {
  ERC20 = 'erc20',
  CUSTOM_CONTRACT = 'custom-contract',
}

export interface Token {
  _id: string;
  type: TokenType;
  data: string; // JSON string — parse before displaying
  user: string;
  project?: string;
  createdAt: string;
  updatedAt: string;
}

// Chat types
export interface ChatRequest {
  message: string;
  projectId?: string;
  previousResponseId?: string;
}

export interface Deployment {
  contractAddress: string;
  tokenId: string;
  type: string;
  name?: string;
  symbol?: string;
  totalSupply?: number;
}

export interface ChatResponse {
  message: string;
  responseId: string;
  deployments: Deployment[];
}

// Marketplace types
export interface ContractTemplate {
  _id: string;
  name: string;
  description: string;
  tags: string[];
  type: TokenType;
  template?: string;
  sources: Record<string, { content: string }>;
  contractName: string;
  constructorArgs: Record<string, { type: string; description: string }>;
  originalDeployment: {
    contractAddress: string;
    chain: string;
    deployedAt: string;
  };
  creator: {
    _id: string;
    username: string;
    walletAddress: string;
  };
  deployCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceListResponse {
  items: ContractTemplate[];
  total: number;
  page: number;
  limit: number;
}

export interface MarketplaceSearchResult extends ContractTemplate {
  score: number;
}

export interface RedeployRequest {
  constructorArgs: Record<string, string>;
  projectId?: string;
}

export interface RedeployResponse {
  contractAddress: string;
  tokenId: string;
  templateId: string;
}

// Local chat conversation types (localStorage)
export interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  deployments?: Deployment[];
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: LocalMessage[];
  responseId: string | null;
  projectId: string | null;
  createdAt: string;
}
```

**Step 2: Create API client with axios interceptor**

Create `frontend/src/lib/api.ts`:

```typescript
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const token = parsed?.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // ignore parse errors
      }
    }
  }
  return config;
});

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
```

**Step 3: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat: add shared TypeScript types and axios API client"
```

---

## Task 3: Zustand Stores

**Files:**
- Create: `frontend/src/stores/auth-store.ts`
- Create: `frontend/src/stores/chat-store.ts`
- Create: `frontend/src/stores/project-store.ts`

**Step 1: Create auth store**

Create `frontend/src/stores/auth-store.ts`:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import type { UserProfile, LoginRequest, RegisterRequest, LoginResponse, RegisterResponse } from '@/lib/types';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,

      login: async (data: LoginRequest) => {
        const res = await api.post<LoginResponse>('/auth/login', data);
        set({ token: res.data.token });
      },

      register: async (data: RegisterRequest) => {
        const res = await api.post<RegisterResponse>('/auth/register', data);
        set({ token: res.data.token });
      },

      logout: () => {
        set({ token: null, user: null });
      },

      fetchUser: async () => {
        const res = await api.get<UserProfile>('/auth/user');
        set({ user: res.data });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    },
  ),
);
```

**Step 2: Create chat store**

Create `frontend/src/stores/chat-store.ts`:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import type { ChatRequest, ChatResponse, Conversation, LocalMessage } from '@/lib/types';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  sendMessage: (text: string, projectId?: string) => Promise<void>;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  getActiveConversation: () => Conversation | undefined;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isLoading: false,

      newConversation: () => {
        const id = crypto.randomUUID();
        const conversation: Conversation = {
          id,
          title: 'New Chat',
          messages: [],
          responseId: null,
          projectId: null,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: id,
        }));
      },

      selectConversation: (id: string) => {
        set({ activeConversationId: id });
      },

      deleteConversation: (id: string) => {
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
          activeConversationId:
            state.activeConversationId === id ? null : state.activeConversationId,
        }));
      },

      getActiveConversation: () => {
        const state = get();
        return state.conversations.find((c) => c.id === state.activeConversationId);
      },

      sendMessage: async (text: string, projectId?: string) => {
        const state = get();
        let conversationId = state.activeConversationId;

        // Create new conversation if none active
        if (!conversationId) {
          const id = crypto.randomUUID();
          const conversation: Conversation = {
            id,
            title: text.slice(0, 40),
            messages: [],
            responseId: null,
            projectId: projectId || null,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({
            conversations: [conversation, ...s.conversations],
            activeConversationId: id,
          }));
          conversationId = id;
        }

        // Add user message
        const userMessage: LocalMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          timestamp: new Date().toISOString(),
        };

        set((s) => ({
          isLoading: true,
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const updated = { ...c, messages: [...c.messages, userMessage] };
            // Set title from first message
            if (c.messages.length === 0) {
              updated.title = text.slice(0, 40);
            }
            return updated;
          }),
        }));

        try {
          const conversation = get().conversations.find((c) => c.id === conversationId);
          const request: ChatRequest = {
            message: text,
            projectId: projectId || conversation?.projectId || undefined,
            previousResponseId: conversation?.responseId || undefined,
          };

          const res = await api.post<ChatResponse>('/assistants/chat', request);

          const assistantMessage: LocalMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: res.data.message,
            deployments: res.data.deployments.length > 0 ? res.data.deployments : undefined,
            timestamp: new Date().toISOString(),
          };

          set((s) => ({
            isLoading: false,
            conversations: s.conversations.map((c) => {
              if (c.id !== conversationId) return c;
              return {
                ...c,
                messages: [...c.messages, assistantMessage],
                responseId: res.data.responseId,
              };
            }),
          }));
        } catch (error) {
          const errorMessage: LocalMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
            timestamp: new Date().toISOString(),
          };

          set((s) => ({
            isLoading: false,
            conversations: s.conversations.map((c) => {
              if (c.id !== conversationId) return c;
              return { ...c, messages: [...c.messages, errorMessage] };
            }),
          }));
        }
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
    },
  ),
);
```

**Step 3: Create project store**

Create `frontend/src/stores/project-store.ts`:

```typescript
import { create } from 'zustand';
import api from '@/lib/api';
import type { Project } from '@/lib/types';

interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;
  isLoading: boolean;
  fetchProjects: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>()((set) => ({
  projects: [],
  selectedProjectId: null,
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<Project[]>('/projects');
      set({ projects: res.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createProject: async (name: string) => {
    const res = await api.post<Project>('/projects', { name });
    set((state) => ({ projects: [...state.projects, res.data] }));
  },

  deleteProject: async (id: string) => {
    await api.delete(`/projects/${id}`);
    set((state) => ({
      projects: state.projects.filter((p) => p._id !== id),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
    }));
  },

  selectProject: (id: string | null) => {
    set({ selectedProjectId: id });
  },
}));
```

**Step 4: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/stores/
git commit -m "feat: add zustand stores for auth, chat, and projects"
```

---

## Task 4: Root Layout and Theme Provider

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Create: `frontend/src/components/providers.tsx`

**Step 1: Create providers component**

Create `frontend/src/components/providers.tsx`:

```tsx
'use client';

import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
```

**Step 2: Update root layout**

Replace `frontend/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ChainCraft',
  description: 'AI-powered smart contract builder and marketplace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Step 3: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

**Step 4: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/app/layout.tsx frontend/src/components/providers.tsx
git commit -m "feat: add root layout with ThemeProvider for dark/light mode"
```

---

## Task 5: Auth Pages (Login + Register)

**Files:**
- Create: `frontend/src/app/(auth)/layout.tsx`
- Create: `frontend/src/app/(auth)/login/page.tsx`
- Create: `frontend/src/app/(auth)/register/page.tsx`
- Create: `frontend/src/components/auth/login-form.tsx`
- Create: `frontend/src/components/auth/register-form.tsx`

**Step 1: Create auth layout**

Create `frontend/src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      {children}
    </div>
  );
}
```

**Step 2: Create login form component**

Create `frontend/src/components/auth/login-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth-store';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.push('/chat');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { message: string } } }).response?.data?.message
          : 'Login failed';
      setError(message || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to ChainCraft</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Create register form component**

Create `frontend/src/components/auth/register-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth-store';

export function RegisterForm() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const register = useAuthStore((s) => s.register);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await register({ name, username, email, password });
      router.push('/chat');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { message: string } } }).response?.data?.message
          : 'Registration failed';
      setError(message || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Create account</CardTitle>
        <CardDescription>Get started with ChainCraft</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="john_doe"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Sign Up'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 4: Create login page**

Create `frontend/src/app/(auth)/login/page.tsx`:

```tsx
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return <LoginForm />;
}
```

**Step 5: Create register page**

Create `frontend/src/app/(auth)/register/page.tsx`:

```tsx
import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
  return <RegisterForm />;
}
```

**Step 6: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

**Step 7: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/app/\(auth\)/ frontend/src/components/auth/
git commit -m "feat: add login and register pages with auth forms"
```

---

## Task 6: Middleware (Route Protection)

**Files:**
- Create: `frontend/src/middleware.ts`

**Step 1: Create Next.js middleware**

Create `frontend/src/middleware.ts`:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/register', '/marketplace'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for auth token in cookie or redirect to login
  // Note: zustand persists to localStorage, not cookies.
  // Middleware runs on the server and cannot read localStorage.
  // We handle client-side redirect in the (app) layout instead.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

**Step 2: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/middleware.ts
git commit -m "feat: add Next.js middleware for route matching"
```

---

## Task 7: App Layout (Navbar, Theme Toggle, User Menu)

**Files:**
- Create: `frontend/src/app/(app)/layout.tsx`
- Create: `frontend/src/components/layout/navbar.tsx`
- Create: `frontend/src/components/layout/theme-toggle.tsx`
- Create: `frontend/src/components/layout/user-menu.tsx`
- Create: `frontend/src/components/layout/auth-guard.tsx`

**Step 1: Create auth guard (client-side redirect)**

Create `frontend/src/components/layout/auth-guard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

const publicPaths = ['/marketplace'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const isPublic = publicPaths.some((path) => pathname.startsWith(path));

    if (!token && !isPublic) {
      router.push('/login');
      return;
    }

    if (token) {
      fetchUser().catch(() => {
        // Token invalid, will be cleared by interceptor
      });
    }

    setIsReady(true);
  }, [token, pathname, router, fetchUser]);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
```

**Step 2: Create theme toggle**

Create `frontend/src/components/layout/theme-toggle.tsx`:

```tsx
'use client';

import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <Button variant="ghost" size="icon" className="h-9 w-9" />;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      )}
    </Button>
  );
}
```

**Step 3: Create user menu**

Create `frontend/src/components/layout/user-menu.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/stores/auth-store';

export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  if (!user) return null;

  const truncatedAddress = user.walletAddress
    ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
    : '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {user.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="hidden sm:inline">{user.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs text-muted-foreground">
          {truncatedAddress}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            logout();
            router.push('/login');
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 4: Create navbar**

Create `frontend/src/components/layout/navbar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/chat', label: 'Chat' },
  { href: '/marketplace', label: 'Marketplace' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Link href="/chat" className="mr-6 flex items-center gap-2 font-bold">
        ChainCraft
      </Link>

      <nav className="flex items-center gap-1">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent',
              pathname.startsWith(link.href)
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground',
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
```

**Step 5: Create app layout**

Create `frontend/src/app/(app)/layout.tsx`:

```tsx
import { Navbar } from '@/components/layout/navbar';
import { AuthGuard } from '@/components/layout/auth-guard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1">{children}</main>
      </div>
    </AuthGuard>
  );
}
```

**Step 6: Create root page redirect**

Replace `frontend/src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/chat');
}
```

**Step 7: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

**Step 8: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/app/\(app\)/layout.tsx frontend/src/app/page.tsx frontend/src/components/layout/
git commit -m "feat: add app layout with navbar, theme toggle, user menu, and auth guard"
```

---

## Task 8: Chat Components — Sidebar

**Files:**
- Create: `frontend/src/components/chat/chat-sidebar.tsx`

**Step 1: Create chat sidebar**

Create `frontend/src/components/chat/chat-sidebar.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useChatStore } from '@/stores/chat-store';
import { useProjectStore } from '@/stores/project-store';
import { cn } from '@/lib/utils';

function groupByDate(conversations: { id: string; title: string; createdAt: string }[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: typeof conversations }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.createdAt);
    if (date >= today) groups[0].items.push(conv);
    else if (date >= yesterday) groups[1].items.push(conv);
    else if (date >= weekAgo) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

export function ChatSidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const newConversation = useChatStore((s) => s.newConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const projects = useProjectStore((s) => s.projects);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const selectProject = useProjectStore((s) => s.selectProject);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const groups = groupByDate(conversations);

  return (
    <div className="flex h-full w-[280px] flex-col border-r bg-muted/30">
      <div className="p-3">
        <Button variant="outline" className="w-full justify-start gap-2" onClick={newConversation}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3">
        {/* Chat history */}
        {groups.length > 0 && (
          <div className="space-y-4 pb-4">
            <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">Chats</p>
            {groups.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="px-2 text-xs text-muted-foreground">{group.label}</p>
                {group.items.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv.id)}
                    className={cn(
                      'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                      activeConversationId === conv.id && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <span className="truncate">{conv.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                      className="hidden text-muted-foreground hover:text-destructive group-hover:inline"
                      aria-label="Delete conversation"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <Separator className="my-2" />

        {/* Projects */}
        <div className="space-y-1 pb-4">
          <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">Projects</p>
          {projects.map((project) => (
            <button
              key={project._id}
              onClick={() => selectProject(selectedProjectId === project._id ? null : project._id)}
              className={cn(
                'flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                selectedProjectId === project._id && 'bg-accent text-accent-foreground',
              )}
            >
              <span className="truncate">{project.name}</span>
            </button>
          ))}
          {projects.length === 0 && (
            <p className="px-2 text-xs text-muted-foreground">No projects yet</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

**Step 2: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

**Step 3: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/components/chat/chat-sidebar.tsx
git commit -m "feat: add chat sidebar with conversation history and project list"
```

---

## Task 9: Chat Components — Message Bubble, Deployment Card, Chat Input

**Files:**
- Create: `frontend/src/components/chat/deployment-card.tsx`
- Create: `frontend/src/components/chat/message-bubble.tsx`
- Create: `frontend/src/components/chat/chat-input.tsx`
- Create: `frontend/src/components/chat/suggestion-cards.tsx`

**Step 1: Create deployment card**

Create `frontend/src/components/chat/deployment-card.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Deployment } from '@/lib/types';

const EXPLORER_URL = 'https://sepolia.basescan.org/address';

export function DeploymentCard({ deployment }: { deployment: Deployment }) {
  const [copied, setCopied] = useState(false);

  const truncatedAddress = `${deployment.contractAddress.slice(0, 6)}...${deployment.contractAddress.slice(-4)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(deployment.contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const label = deployment.name
    ? `${deployment.name}${deployment.symbol ? ` (${deployment.symbol})` : ''}`
    : 'Contract';

  return (
    <Card className="my-2 border-green-500/30 bg-green-500/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{label} deployed</span>
              <Badge variant="secondary" className="text-xs">
                {deployment.type}
              </Badge>
            </div>
            <p className="font-mono text-xs text-muted-foreground">{truncatedAddress}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`${EXPLORER_URL}/${deployment.contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Explorer
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Badge variant="outline" className="ml-auto text-xs">
            Base Sepolia
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Create message bubble**

Create `frontend/src/components/chat/message-bubble.tsx`:

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { DeploymentCard } from './deployment-card';
import { cn } from '@/lib/utils';
import type { LocalMessage } from '@/lib/types';

export function MessageBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted',
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');

                  if (match) {
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-md text-xs"
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    );
                  }

                  return (
                    <code className={cn('rounded bg-muted px-1 py-0.5 text-xs', className)} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {message.deployments?.map((deployment, i) => (
          <DeploymentCard key={i} deployment={deployment} />
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Create chat input**

Create `frontend/src/components/chat/chat-input.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Describe your smart contract...' }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent p-2 focus-visible:ring-0 focus-visible:ring-offset-0"
        rows={1}
      />
      <Button
        size="icon"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="h-9 w-9 shrink-0 rounded-xl"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
      </Button>
    </div>
  );
}
```

**Step 4: Create suggestion cards**

Create `frontend/src/components/chat/suggestion-cards.tsx`:

```tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';

const suggestions = [
  {
    title: 'Deploy ERC20',
    description: 'Create a standard ERC20 token',
    prompt: 'Deploy an ERC20 token called MyToken with symbol MTK and total supply of 1000000',
  },
  {
    title: 'Staking Contract',
    description: 'Build a staking pool',
    prompt: 'Generate a staking contract where users can stake ERC20 tokens and earn rewards',
  },
  {
    title: 'Governance DAO',
    description: 'On-chain voting system',
    prompt: 'Create a governance contract with proposal creation and token-weighted voting',
  },
  {
    title: 'Custom Contract',
    description: 'Describe any contract',
    prompt: 'Generate a custom smart contract that ',
  },
];

interface SuggestionCardsProps {
  onSelect: (prompt: string) => void;
}

export function SuggestionCards({ onSelect }: SuggestionCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {suggestions.map((s) => (
        <Card
          key={s.title}
          className="cursor-pointer transition-colors hover:bg-accent"
          onClick={() => onSelect(s.prompt)}
        >
          <CardContent className="p-4">
            <p className="text-sm font-medium">{s.title}</p>
            <p className="text-xs text-muted-foreground">{s.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Step 5: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

**Step 6: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/components/chat/
git commit -m "feat: add chat components — message bubble, deployment card, input, suggestions"
```

---

## Task 10: Chat Area and Chat Page

**Files:**
- Create: `frontend/src/components/chat/chat-area.tsx`
- Create: `frontend/src/app/(app)/chat/page.tsx`

**Step 1: Create chat area**

Create `frontend/src/components/chat/chat-area.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { SuggestionCards } from './suggestion-cards';
import { useChatStore } from '@/stores/chat-store';
import { useProjectStore } from '@/stores/project-store';

export function ChatArea() {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const isLoading = useChatStore((s) => s.isLoading);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages || [];
  const isEmpty = messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  const handleSend = (text: string) => {
    sendMessage(text, selectedProjectId || undefined);
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScrollArea className="flex-1 p-4">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-8 pt-[20vh]">
            <div className="text-center">
              <h1 className="text-3xl font-bold">ChainCraft</h1>
              <p className="mt-2 text-muted-foreground">What do you want to build?</p>
            </div>
            <div className="w-full max-w-lg">
              <SuggestionCards onSelect={handleSend} />
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-4">
        <div className="mx-auto max-w-3xl">
          <ChatInput onSend={handleSend} disabled={isLoading} />
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create chat page**

Create `frontend/src/app/(app)/chat/page.tsx`:

```tsx
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ChatArea } from '@/components/chat/chat-area';

export default function ChatPage() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full">
      <ChatSidebar />
      <ChatArea />
    </div>
  );
}
```

**Step 3: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

**Step 4: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/components/chat/chat-area.tsx frontend/src/app/\(app\)/chat/
git commit -m "feat: add chat area with empty state and chat page"
```

---

## Task 11: Marketplace — Template Card and Grid

**Files:**
- Create: `frontend/src/components/marketplace/template-card.tsx`
- Create: `frontend/src/components/marketplace/search-bar.tsx`
- Create: `frontend/src/components/marketplace/tag-filter.tsx`
- Create: `frontend/src/components/marketplace/template-grid.tsx`

**Step 1: Create template card**

Create `frontend/src/components/marketplace/template-card.tsx`:

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ContractTemplate } from '@/lib/types';

export function TemplateCard({ template }: { template: ContractTemplate }) {
  return (
    <Link href={`/marketplace/${template._id}`}>
      <Card className="h-full cursor-pointer transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{template.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="line-clamp-2 text-sm text-muted-foreground">{template.description}</p>
          <div className="flex flex-wrap gap-1">
            {template.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{template.deployCount} deploy{template.deployCount !== 1 ? 's' : ''}</span>
            <span>
              by @{typeof template.creator === 'object' ? template.creator.username : 'unknown'}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

**Step 2: Create search bar**

Create `frontend/src/components/marketplace/search-bar.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';

interface SearchBarProps {
  onSearch: (query: string) => void;
  defaultValue?: string;
}

export function SearchBar({ onSearch, defaultValue = '' }: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);

  const debouncedSearch = useCallback(
    (() => {
      let timeout: NodeJS.Timeout;
      return (query: string) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => onSearch(query), 300);
      };
    })(),
    [onSearch],
  );

  useEffect(() => {
    debouncedSearch(value);
  }, [value, debouncedSearch]);

  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
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

**Step 3: Create tag filter**

Create `frontend/src/components/marketplace/tag-filter.tsx`:

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const COMMON_TAGS = ['erc20', 'governance', 'staking', 'defi', 'nft', 'token'];

interface TagFilterProps {
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}

export function TagFilter({ selectedTags, onTagToggle }: TagFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={selectedTags.length === 0 ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => {
          // Clear all tags
          selectedTags.forEach((t) => onTagToggle(t));
        }}
      >
        All
      </Badge>
      {COMMON_TAGS.map((tag) => (
        <Badge
          key={tag}
          variant={selectedTags.includes(tag) ? 'default' : 'outline'}
          className={cn('cursor-pointer')}
          onClick={() => onTagToggle(tag)}
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}
```

**Step 4: Create template grid**

Create `frontend/src/components/marketplace/template-grid.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateCard } from './template-card';
import { SearchBar } from './search-bar';
import { TagFilter } from './tag-filter';
import api from '@/lib/api';
import type { ContractTemplate, MarketplaceListResponse, MarketplaceSearchResult } from '@/lib/types';

export function TemplateGrid() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 12;

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      if (searchQuery) {
        const res = await api.get<MarketplaceSearchResult[]>('/marketplace/search', {
          params: { q: searchQuery, limit },
        });
        setTemplates(res.data);
        setTotal(res.data.length);
      } else {
        const params: Record<string, string | number> = { page, limit };
        if (selectedTags.length > 0) {
          params.tags = selectedTags.join(',');
        }
        const res = await api.get<MarketplaceListResponse>('/marketplace', { params });
        setTemplates(res.data.items);
        setTotal(res.data.total);
      }
    } catch {
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedTags, page]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
    setPage(1);
  };

  const hasMore = !searchQuery && page * limit < total;

  return (
    <div className="space-y-6">
      <SearchBar onSearch={handleSearch} />
      <TagFilter selectedTags={selectedTags} onTagToggle={handleTagToggle} />

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
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

**Step 5: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

**Step 6: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/components/marketplace/
git commit -m "feat: add marketplace components — template card, grid, search, tag filter"
```

---

## Task 12: Marketplace Page

**Files:**
- Create: `frontend/src/app/(app)/marketplace/page.tsx`

**Step 1: Create marketplace page**

Create `frontend/src/app/(app)/marketplace/page.tsx`:

```tsx
import { TemplateGrid } from '@/components/marketplace/template-grid';

export default function MarketplacePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Contract Marketplace</h1>
        <p className="text-muted-foreground">Discover and deploy smart contract templates</p>
      </div>
      <TemplateGrid />
    </div>
  );
}
```

**Step 2: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

**Step 3: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/app/\(app\)/marketplace/page.tsx
git commit -m "feat: add marketplace listing page"
```

---

## Task 13: Marketplace — Deploy Form and Detail Page

**Files:**
- Create: `frontend/src/components/marketplace/deploy-form.tsx`
- Create: `frontend/src/app/(app)/marketplace/[id]/page.tsx`

**Step 1: Create deploy form**

Create `frontend/src/components/marketplace/deploy-form.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useProjectStore } from '@/stores/project-store';
import { useAuthStore } from '@/stores/auth-store';
import type { RedeployResponse } from '@/lib/types';

interface DeployFormProps {
  templateId: string;
  constructorArgs: Record<string, { type: string; description: string }>;
}

export function DeployForm({ templateId, constructorArgs }: DeployFormProps) {
  const [args, setArgs] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState<string>('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [result, setResult] = useState<RedeployResponse | null>(null);
  const [error, setError] = useState('');
  const projects = useProjectStore((s) => s.projects);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) fetchProjects();
  }, [token, fetchProjects]);

  const argEntries = Object.entries(constructorArgs);

  const handleDeploy = async () => {
    setError('');
    setIsDeploying(true);
    try {
      const res = await api.post<RedeployResponse>(`/marketplace/${templateId}/deploy`, {
        constructorArgs: args,
        ...(projectId && { projectId }),
      });
      setResult(res.data);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { message: string } } }).response?.data?.message
          : 'Deployment failed';
      setError(message || 'Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  };

  if (result) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader>
          <CardTitle className="text-base">Deployment Successful</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="font-mono text-sm">{result.contractAddress}</p>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://sepolia.basescan.org/address/${result.contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Explorer
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Deploy This Contract</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {argEntries.map(([name, schema]) => (
          <div key={name} className="space-y-2">
            <Label htmlFor={name}>
              {name}{' '}
              <span className="text-xs text-muted-foreground">({schema.type})</span>
            </Label>
            <Input
              id={name}
              type={schema.type.includes('uint') || schema.type.includes('int') ? 'number' : 'text'}
              placeholder={schema.description}
              value={args[name] || ''}
              onChange={(e) => setArgs((prev) => ({ ...prev, [name]: e.target.value }))}
            />
          </div>
        ))}

        {token && projects.length > 0 && (
          <div className="space-y-2">
            <Label>Project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!token ? (
          <p className="text-sm text-muted-foreground">Sign in to deploy this contract.</p>
        ) : (
          <Button onClick={handleDeploy} disabled={isDeploying} className="w-full">
            {isDeploying ? 'Deploying...' : 'Deploy Contract'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Create template detail page**

Create `frontend/src/app/(app)/marketplace/[id]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { DeployForm } from '@/components/marketplace/deploy-form';
import api from '@/lib/api';
import type { ContractTemplate } from '@/lib/types';

export default function TemplateDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [template, setTemplate] = useState<ContractTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get<ContractTemplate>(`/marketplace/${id}`);
        setTemplate(res.data);
      } catch {
        // handle error
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, [id]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 text-center">
        <p className="text-muted-foreground">Template not found.</p>
        <Button variant="link" asChild>
          <Link href="/marketplace">Back to Marketplace</Link>
        </Button>
      </div>
    );
  }

  const creatorName =
    typeof template.creator === 'object' ? template.creator.username : 'unknown';
  const sourceEntries = Object.entries(template.sources);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      {/* Back link */}
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
        Back to Marketplace
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{template.name}</h1>
        <p className="text-sm text-muted-foreground">
          by @{creatorName} | {template.deployCount} deploy{template.deployCount !== 1 ? 's' : ''} | Base Sepolia
        </p>
      </div>

      {/* Description */}
      <p className="text-muted-foreground">{template.description}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        {template.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Source Code */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source Code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sourceEntries.map(([filename, { content }]) => (
            <div key={filename}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{filename}</p>
              <SyntaxHighlighter
                style={oneDark}
                language="solidity"
                className="rounded-md text-xs"
              >
                {content}
              </SyntaxHighlighter>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Deploy Form */}
      <DeployForm templateId={template._id} constructorArgs={template.constructorArgs} />

      {/* Original Deployment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Original Deployment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Contract: </span>
            <span className="font-mono">{template.originalDeployment.contractAddress}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Chain: </span>
            {template.originalDeployment.chain}
          </p>
          <p>
            <span className="text-muted-foreground">Deployed: </span>
            {new Date(template.originalDeployment.deployedAt).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 3: Verify build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

**Step 4: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/components/marketplace/deploy-form.tsx frontend/src/app/\(app\)/marketplace/\[id\]/
git commit -m "feat: add marketplace deploy form and template detail page"
```

---

## Task 14: App Root Page and Final Polish

**Files:**
- Create: `frontend/src/app/(app)/page.tsx`

**Step 1: Create app root redirect**

Create `frontend/src/app/(app)/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function AppHome() {
  redirect('/chat');
}
```

**Step 2: Verify full build**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

Expected: Build succeeds with no errors.

**Step 3: Test dev server**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run dev
```

Visit `http://localhost:3000` — should redirect to `/login`. Check:
- Login page renders with form
- Register page renders with form
- Theme toggle works after login
- `/marketplace` loads (may be empty without data)

**Step 4: Commit**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/src/app/\(app\)/page.tsx
git commit -m "feat: add app root redirect and finalize routing"
```

---

## Task 15: Final Build Verification and Cleanup

**Step 1: Full lint check**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run lint
```

Fix any lint errors found.

**Step 2: Full build check**

```bash
cd /Users/gokbot/Documents/projects/openai-func/chaincraft-frontend
npm run build
```

Expected: Build succeeds with no errors.

**Step 3: Commit any fixes**

```bash
cd /Users/gokbot/Documents/projects/openai-func
git add frontend/
git commit -m "fix: resolve lint errors and build warnings"
```

**Step 4: Final commit — mark implementation complete**

Verify all files are committed:

```bash
cd /Users/gokbot/Documents/projects/openai-func
git status
```

Expected: Clean working tree for `frontend/`.
