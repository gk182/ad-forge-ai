import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/config/site';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: `${SITE_NAME} | ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  keywords: ['AI video', 'video ad generator', 'TikTok ads', 'product marketing', 'AI advertising'],
  openGraph: {
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: 'Turn any product URL into a viral video ad in seconds.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col relative overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
        <div className="bg-blob w-[500px] h-[500px] bg-[var(--primary)] top-[-200px] left-[-100px]" />
        <div className="bg-blob w-[400px] h-[400px] bg-[var(--secondary)] bottom-[-150px] right-[-100px]" />
        <div className="bg-blob w-[300px] h-[300px] bg-purple-600 top-[40%] right-[20%]" />

        {children}

        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#12121a',
              color: '#e4e4e7',
              border: '1px solid #1e1e35',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#22c55e', secondary: '#12121a' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#12121a' },
              duration: 6000,
            },
          }}
        />
      </body>
    </html>
  );
}
