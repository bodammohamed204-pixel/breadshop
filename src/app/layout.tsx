import type { Metadata } from 'next';
import '@fontsource-variable/cairo';
import './globals.css';

export const metadata: Metadata = {
  title: 'مخبز أولاد عثمان | نقطة البيع',
  description: 'نظام نقاط بيع مخبز أولاد عثمان',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
