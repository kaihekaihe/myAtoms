'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { AppBlueprint, RecordData } from '@/lib/blueprint';
import { AppCanvas } from '@/components/AppCanvas';

interface ShareViewProps {
  projectName: string;
  blueprint: AppBlueprint | null;
  records: RecordData[];
}

export default function ShareView({ projectName, blueprint, records }: ShareViewProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-4 py-2.5">
        <Link href="/" className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700">
          <ArrowLeft size={13} /> AtomLab
        </Link>
        <span className="text-xs text-stone-300">·</span>
        <span className="truncate text-xs text-stone-500">只读分享 · {projectName}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-stone-400">
          <ExternalLink size={11} /> 数据实时读取
        </span>
      </header>
      <div className="min-h-0 flex-1">
        {blueprint ? (
          <AppCanvas blueprint={blueprint} records={records} readOnly />
        ) : (
          <div className="grid h-full place-items-center text-sm text-stone-400">该应用尚未生成蓝图</div>
        )}
      </div>
    </div>
  );
}