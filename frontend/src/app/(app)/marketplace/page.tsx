import { TemplateGrid } from '@/components/marketplace/template-grid';

export default function MarketplacePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Contract Marketplace</h1>
        <p className="text-muted-foreground">Discover and deploy smart contract templates</p>
      </div>
      <TemplateGrid />
    </div>
  );
}
