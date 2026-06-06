'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChatStore } from '@/stores/chat-store';
import { useDeployContract } from '@/hooks/use-deploy-contract';
import type { PendingDeploy } from '@/lib/types';

interface PendingDeployCardProps {
  pendingDeploy: PendingDeploy;
  messageId: string;
  deployed?: boolean;
}

export function PendingDeployCard({
  pendingDeploy,
  messageId,
  deployed = false,
}: PendingDeployCardProps) {
  const { contractName, constructorArgs, abi, bytecode, sources } = pendingDeploy;
  const markDeployed = useChatStore((s) => s.markDeployed);
  const conversation = useChatStore((s) => s.getActiveConversation());
  const { deploy, isDeploying } = useDeployContract();
  const [error, setError] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of Object.keys(constructorArgs)) {
      initial[key] = '';
    }
    return initial;
  });

  const allFilled = Object.values(values).every((v) => v.trim() !== '');
  const canDeploy = allFilled && !deployed && !isDeploying && !!abi && !!bytecode;

  const handleDeploy = async () => {
    if (!canDeploy || !abi || !bytecode) return;
    setError(null);

    // Convert Record<string, string> to ordered array matching ABI constructor inputs
    const constructorAbi = abi.find((item: any) => item.type === 'constructor');
    const orderedArgs: any[] = [];
    if (constructorAbi?.inputs) {
      for (const input of constructorAbi.inputs) {
        orderedArgs.push(values[input.name] ?? '');
      }
    }

    try {
      const result = await deploy({
        abi,
        bytecode,
        constructorArgs: orderedArgs,
        constructorValues: values,
        contractName,
        sources,
        projectId: conversation?.projectId || undefined,
      });

      markDeployed(messageId, {
        contractAddress: result.contractAddress,
        tokenId: result.tokenId,
        type: 'custom-contract',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deployment failed';
      setError(msg);
    }
  };

  return (
    <Card className="mt-3 border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Deploy {contractName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(constructorArgs).map(([name, { type }]) => (
          <div key={name} className="space-y-1">
            <Label htmlFor={`arg-${name}`} className="text-xs">
              {name}{' '}
              <span className="text-muted-foreground font-mono">({type})</span>
            </Label>
            <Input
              id={`arg-${name}`}
              placeholder={type}
              value={values[name]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [name]: e.target.value }))
              }
              disabled={deployed || isDeploying}
              className="h-8 text-sm font-mono"
            />
          </div>
        ))}

        {!abi || !bytecode ? (
          <p className="text-xs text-muted-foreground">
            Compilation data missing — cannot deploy.
          </p>
        ) : (
          <Button
            onClick={handleDeploy}
            disabled={!canDeploy}
            size="sm"
            className="w-full"
          >
            {isDeploying
              ? 'Deploying...'
              : deployed
                ? 'Deployed'
                : 'Deploy Contract'}
          </Button>
        )}

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
