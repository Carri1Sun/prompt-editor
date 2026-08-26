import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3001'),
  title: 'Prompt 工作台',
  description: '一处完成 Prompt 编辑、批注、AI 审阅与版本管理。',
  openGraph: {
    title: 'Prompt 工作台',
    description: '编辑、批注、AI 审阅与版本管理，都在同一个 Prompt 工作区。',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Prompt 工作台' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Prompt 工作台',
    description: '编辑、批注、AI 审阅与版本管理，都在同一个 Prompt 工作区。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
