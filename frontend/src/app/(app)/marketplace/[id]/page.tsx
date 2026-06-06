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
    async function fetchTemplate() {
      try {
        const res = await api.get<ContractTemplate>(`/marketplace/${id}`);
        setTemplate(res.data);
      } catch {
        // handle error
      } finally {
        setIsLoading(false);
      }
    }
    fetchTemplate();
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
    template.creator && typeof template.creator === 'object' ? template.creator.username : 'unknown';
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
