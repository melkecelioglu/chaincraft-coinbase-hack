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
