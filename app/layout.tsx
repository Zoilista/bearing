import type { Metadata } from 'next';
import { Inter_Tight, Source_Sans_3 } from 'next/font/google';
import './globals.css';

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const sourceSans3 = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bearing — Idea Validation for Indie Game Developers',
  description:
    "Bearing doesn't tell you where to land. It helps you find your direction. Real market data for indie game idea validation.",
  keywords: ['indie game', 'idea validation', 'game dev', 'steam', 'market research'],
  openGraph: {
    title: 'Bearing',
    description: 'Real-data idea validation for indie game developers.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${sourceSans3.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
