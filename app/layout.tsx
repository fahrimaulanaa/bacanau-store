import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bacanau Store | Platform Apparel & Digital Art Kampus',
  description: 'Official e-commerce Bacanau Store. Beli merchandise eksklusif, apparel streetwear, dan digital art dengan pembayaran QRIS otomatis. Melayani pengiriman ke Jatinangor, Ganesha, dan sekitarnya.',
  keywords: ['Bacanau Store', 'BaCaNau', 'Nautika ITB', 'Streetwear Bandung', 'Digital Art Bacanau'],
  authors: [{ name: 'Fahri Maulana' }],
  verification: {
    google: 'f8ik7ltUc0EBBLqJq-BuharKN-Xu7zBSpS3tO8PbjWI', 
    // Contoh dari gambarmu: 'ezN9lZ75WnD74od1ix3Rww8IsPREpnzT98z7J...'
  },
  openGraph: {
    title: 'Bacanau Store | Apparel & Digital Art',
    description: 'Official e-commerce Bacanau Store. Beli merchandise eksklusif dengan mudah.',
    url: 'https://domain-bacanau-kamu.com', // Ganti dengan domain aslimu nanti
    siteName: 'Bacanau Store',
    images: [
      {
        url: 'https://domain-bacanau-kamu.com/banner-toko.jpg', // Ganti dengan URL gambar logomu
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
