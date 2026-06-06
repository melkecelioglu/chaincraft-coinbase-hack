import { Navbar } from '@/components/layout/navbar';
import { AuthGuard } from '@/components/layout/auth-guard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1">{children}</main>
      </div>
    </AuthGuard>
  );
}
