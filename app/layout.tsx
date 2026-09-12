import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://artist-mix.taltech.chatgpt.site'),
  title: 'Artist Mix — Your favourites, one playlist',
  description: 'Choose artists and turn their Spotify top tracks into one playlist.',
  openGraph: {
    title: 'Artist Mix — Your favourites, one playlist',
    description: 'Choose artists and turn their Spotify top tracks into one playlist.',
    url: '/',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Artist Mix — Your favourites, one playlist',
    description: 'Choose artists and turn their Spotify top tracks into one playlist.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
