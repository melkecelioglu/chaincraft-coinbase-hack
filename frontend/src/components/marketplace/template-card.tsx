import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ContractTemplate } from '@/lib/types';

export function TemplateCard({ template }: { template: ContractTemplate }) {
  return (
    <Link href={`/marketplace/${template._id}`}>
      <Card className="h-full cursor-pointer transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{template.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="line-clamp-2 text-sm text-muted-foreground">{template.description}</p>
          <div className="flex flex-wrap gap-1">
            {template.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{template.deployCount} deploy{template.deployCount !== 1 ? 's' : ''}</span>
            <span>
              by @{template.creator ? template.creator.username : 'unknown'}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
