import type { Metadata, Viewport } from 'next';
import './globals.css';
import { StoreProvider } from '@/context/store-context';
import { ToastProvider } from '@/components/ui/toast';
import { Navbar } from '@/components/navbar';
import { OfflineBanner } from '@/components/offline-banner';
import { DemoUserSwitcher } from '@/components/demo-user-switcher';

export const metadata: Metadata = {
  title: 'Gateway Gas — Internal Multi-Branch Portal',
  description: 'Multi-branch operations, cylinder brand exchange, POS, and rider logistics.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
          <ToastProvider>
            <OfflineBanner />
            <DemoUserSwitcher />
            <Navbar />
            <main className="flex-1">{children}</main>
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
