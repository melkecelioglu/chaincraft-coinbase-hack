'use client';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { DeploymentCard } from './deployment-card';
import { PendingDeployCard } from './pending-deploy-card';
import { cn } from '@/lib/utils';
import type { LocalMessage } from '@/lib/types';

export function MessageBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === 'user';

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

        {message.pendingDeploys?.map((pd, i) => (
          <PendingDeployCard
            key={i}
            pendingDeploy={pd}
            messageId={message.id}
            deployed={!!message.deployments?.length}
          />
        ))}
      </div>
    </div>
  );
}
