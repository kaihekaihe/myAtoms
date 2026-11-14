import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AtomLab · 智能体应用生成工作台',
  description:
    '一句话描述业务，三个 AI 智能体接力生成可运行的应用：数据模型、动态界面、增删改查、统计看板与版本管理。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}