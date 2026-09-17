import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { SessionProvider } from '@/shared/auth';
import './globals.css';

// Inter — font của wireframe (artboard 0a). 600 cho tiêu đề, 400 cho nội dung.
const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Trung tâm Hành chính — Chuyển phát nhanh',
  description: 'Đề 3: theo dõi thư và kiện hàng đến, nhắc tự động theo SLA.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
