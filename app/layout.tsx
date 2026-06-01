import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://bacanaustore.netlify.app'),
  title: 'Bacanau Store | Bantu Kami LPT',
  description: 'Official e-commerce Bacanau Store. Beli apapun yang kami jual hehe',
  keywords: ['Bacanau Store', 'BaCaNau', 'Nautika ITB', ],
  authors: [{ name: 'Fahri Maulana Al Ghazali and Team' }],
  verification: {
    google: 'f8ik7ltUc0EBBLqJq-BuharKN-Xu7zBSpS3tO8PbjWI', 
  },
  openGraph: {
    title: 'Bacanau Store | Bantu Kami LPT',
    description: 'Beli merchandise kami dong. Support UMKM lokal hehe.',
    url: 'https://bacanaustore.netlify.app', 
    siteName: 'Bacanau Store',
    images: [
      {
        url: '/logo_bacanau_25.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
