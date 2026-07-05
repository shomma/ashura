import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ASHURA',
  description: '番組検索、需要・競合調査、Gemini記事下書き生成をつなぐ記事企画ダッシュボード'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
