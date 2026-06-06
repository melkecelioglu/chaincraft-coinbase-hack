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
import { useDeployContract } from '@/hooks/use-deploy-contract';

interface CompileResult {
  abi: any[];
  bytecode: string;
  sources: Record<string, { content: string }>;
  contractName: string;
  constructorArgs: Record<string, string>;
  templateId: string;
}

interface DeployResult {
  contractAddress: string;
  txHash: string;
  tokenId: string;
}

interface DeployFormProps {
  templateId: string;
  constructorArgs: Record<string, { type: string; description: string }>;
}

export function DeployForm({ templateId, constructorArgs }: DeployFormProps) {
  const [args, setArgs] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState<string>('');
  const [result, setResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState('');
  const projects = useProjectStore((s) => s.projects);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const token = useAuthStore((s) => s.token);
  const { deploy, isDeploying } = useDeployContract();

  useEffect(() => {
    if (token) fetchProjects();
  }, [token, fetchProjects]);

  const argEntries = Object.entries(constructorArgs);

  const handleDeploy = async () => {
    setError('');
    try {
      // 1. Compile via backend
      const res = await api.post<CompileResult>(`/marketplace/${templateId}/deploy`, {
        constructorArgs: args,
        ...(projectId && { projectId }),
      });
      const { abi, bytecode, sources, contractName } = res.data;

      // 2. Convert args to ordered array matching ABI constructor inputs
      const constructorAbi = abi.find((item: any) => item.type === 'constructor');
      const orderedArgs: any[] = [];
      if (constructorAbi?.inputs) {
        for (const input of constructorAbi.inputs) {
          orderedArgs.push(args[input.name] ?? '');
        }
      }

      // 3. Deploy via factory
      const deployResult = await deploy({
        abi,
        bytecode,
        constructorArgs: orderedArgs,
        contractName,
        sources,
        projectId: projectId || undefined,
      });

      setResult(deployResult);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === 'object' && 'response' in err
            ? (err as { response: { data: { message: string } } }).response?.data?.message
            : 'Deployment failed';
      setError(message || 'Deployment failed');
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
          <>
            <p className="text-xs text-muted-foreground">Deployment fee: 0.001 ETH</p>
            <Button onClick={handleDeploy} disabled={isDeploying} className="w-full">
              {isDeploying ? 'Deploying...' : 'Deploy Contract'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
