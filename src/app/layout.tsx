import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/context/store-context';
import { Navbar } from '@/components/navbar';
import { DemoUserSwitcher } from '@/components/demo-user-switcher';

export const metadata: Metadata = {
  title: 'Gateway Gas — Internal Multi-Branch Portal',
  description: 'Multi-branch operations, cylinder brand exchange, POS, and rider logistics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
        <StoreProvider>
          <DemoUserSwitcher />
          <Navbar />
          <main className="flex-1">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
