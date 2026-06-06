# Chat Error Messages Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show real backend error messages in chat instead of generic "something went wrong", with visual distinction for errors.

**Architecture:** Extract error details from axios response in chat-store catch block, add `isError` flag to LocalMessage type, style error messages with red/destructive theme in message-bubble.

**Tech Stack:** zustand (chat-store), React (message-bubble), TypeScript (types)

---

### Task 1: Add `isError` flag to LocalMessage type + extract real error in chat-store

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/stores/chat-store.ts`

**Step 1: Add `isError` to LocalMessage**

In `frontend/src/lib/types.ts`, add optional `isError` field to `LocalMessage`:

```typescript
export interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  deployments?: Deployment[];
  isError?: boolean;
  timestamp: string;
}
```

**Step 2: Extract real error message in chat-store catch block**

Replace the catch block in `sendMessage` (lines 129-143) with:

```typescript
} catch (error: unknown) {
  let content = 'Something went wrong. Please try again.';

  if (error && typeof error === 'object' && 'response' in error) {
    const res = (error as { response: { data?: { message?: string | string[] }; status?: number } }).response;
    const msg = res?.data?.message;
    if (Array.isArray(msg)) {
      content = msg.join(', ');
    } else if (typeof msg === 'string') {
      content = msg;
    }
  }

  const errorMessage: LocalMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    isError: true,
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
```

**Step 3: Verify frontend builds**

```bash
cd /Users/gokbot/Documents/projects/openai-func/frontend
npx next build
```

**Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/stores/chat-store.ts
git commit -m "fix: extract real error messages in chat store"
```

---

### Task 2: Style error messages in message-bubble

**Files:**
- Modify: `frontend/src/components/chat/message-bubble.tsx`

**Step 1: Add error styling to MessageBubble**

When `message.isError` is true, render with destructive styling instead of normal assistant bubble:

```tsx
if (message.isError) {
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[80%] rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          <span>{message.content}</span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify frontend builds**

```bash
cd /Users/gokbot/Documents/projects/openai-func/frontend
npx next build
```

**Step 3: Commit**

```bash
git add frontend/src/components/chat/message-bubble.tsx
git commit -m "fix: style error messages with destructive theme in chat"
```
