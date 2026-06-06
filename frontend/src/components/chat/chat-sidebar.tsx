'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useChatStore } from '@/stores/chat-store';
import { useProjectStore } from '@/stores/project-store';
import { useAuthStore } from '@/stores/auth-store';
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

  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) fetchProjects();
  }, [token, fetchProjects]);

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
                  <div
                    key={conv.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectConversation(conv.id)}
                    onKeyDown={(e) => e.key === 'Enter' && selectConversation(conv.id)}
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
                  </div>
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
