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
    try {
      await navigator.clipboard.writeText(deployment.contractAddress);
    } catch {
      // Fallback for non-secure contexts (HTTP)
      const textarea = document.createElement('textarea');
      textarea.value = deployment.contractAddress;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
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
          <span className="text-xs text-muted-foreground">0.001 ETH fee</span>
        </div>
      </CardContent>
    </Card>
  );
}
