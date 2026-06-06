'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { SuggestionCards } from './suggestion-cards';
import { useChatStore } from '@/stores/chat-store';
import { useProjectStore } from '@/stores/project-store';
import { useAuthStore } from '@/stores/auth-store';

export function ChatArea() {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const isLoading = useChatStore((s) => s.isLoading);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const token = useAuthStore((s) => s.token);
  const isWalletConnected = !!token;
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
            {isWalletConnected && (
              <div className="w-full max-w-lg">
                <SuggestionCards onSelect={handleSend} />
              </div>
            )}
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
          <ChatInput
            onSend={handleSend}
            disabled={isLoading || !isWalletConnected}
            placeholder={
              isWalletConnected
                ? 'Describe your smart contract...'
                : 'Connect your wallet to start chatting'
            }
          />
        </div>
      </div>
    </div>
  );
}
