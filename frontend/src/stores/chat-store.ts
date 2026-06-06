import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import type { ChatRequest, ChatResponse, Conversation, Deployment, LocalMessage } from '@/lib/types';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (HTTP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  sendMessage: (text: string, projectId?: string) => Promise<void>;
  markDeployed: (messageId: string, deployment: Deployment) => void;
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
        const id = generateId();
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

      markDeployed: (messageId: string, deployment: Deployment) => {
        set((s) => ({
          conversations: s.conversations.map((c) => {
            const msgIndex = c.messages.findIndex((m) => m.id === messageId);
            if (msgIndex === -1) return c;
            const messages = [...c.messages];
            const msg = { ...messages[msgIndex] };
            msg.deployments = [...(msg.deployments || []), deployment];
            messages[msgIndex] = msg;
            return { ...c, messages };
          }),
        }));
      },

      sendMessage: async (text: string, projectId?: string) => {
        const state = get();
        let conversationId = state.activeConversationId;

        // Create new conversation if none active
        if (!conversationId) {
          const id = generateId();
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
          id: generateId(),
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
            id: generateId(),
            role: 'assistant',
            content: res.data.message,
            deployments: res.data.deployments.length > 0 ? res.data.deployments : undefined,
            pendingDeploys: res.data.pendingDeploys?.length > 0 ? res.data.pendingDeploys : undefined,
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
        } catch (error: unknown) {
          let content = 'Something went wrong. Please try again.';

          if (error && typeof error === 'object' && 'response' in error) {
            const res = (error as { response: { data?: { message?: string | string[] } } }).response;
            const msg = res?.data?.message;
            if (Array.isArray(msg)) {
              content = msg.join(', ');
            } else if (typeof msg === 'string') {
              content = msg;
            }
          }

          const errorMessage: LocalMessage = {
            id: generateId(),
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
