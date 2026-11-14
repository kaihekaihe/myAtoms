'use client';

import type { VersionInfo } from '@/lib/shared-types';

interface VersionsPanelProps {
  versions: VersionInfo[];
  activeVersion: number | null;
  onRestore: (id: number) => void;
  restoringId: number | null;
}

const ENGINE_BADGE: Record<string, { text: string; cls: string }> = {
  agent: { text: '智能体', cls: 'border-violet-200 bg-violet-50 text-violet-600' },
  local: { text: '规则', cls: 'border-amber-200 bg-amber-50 text-amber-600' },
  restore: { text: '恢复', cls: 'border-sky-200 bg-sky-50 text-sky-600' },
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function VersionsPanel({ versions, activeVersion, onRestore, restoringId }: VersionsPanelProps) {
  if (!versions.length) {
    return (
      <div className="p-6 text-center text-xs leading-relaxed text-stone-400">
        还没有版本。
        <br />
        生成应用后，每次迭代都会自动存档。
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="mb-3 text-[11px] leading-relaxed text-stone-400">
        每次生成都会存档；「恢复」会以历史版本为基础创建新版本，已有数据不会被清空。
      </p>
      <ul className="space-y-2">
        {versions.map((v) => {
          const badge = ENGINE_BADGE[v.engine] ?? ENGINE_BADGE.agent;
          const active = v.version === activeVersion;
          return (
            <li
              key={v.id}
              className={`rounded-lg border p-3 ${
                active ? 'border-violet-300 bg-violet-50/50' : 'border-stone-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">v{v.version}</span>
                <span className={`badge border ${badge.cls}`}>{badge.text}</span>
                {active && (
                  <span className="badge border border-emerald-200 bg-emerald-50 text-emerald-600">当前</span>
                )}
                <span className="ml-auto text-[10px] text-stone-400">{fmtTime(v.created_at)}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs text-stone-600">{v.source_prompt || '（无需求文本）'}</p>
              {!active && (
                <button
                  onClick={() => onRestore(v.id)}
                  disabled={restoringId !== null}
                  className="mt-2 text-xs font-medium text-violet-600 transition hover:text-violet-700 disabled:opacity-40"
                >
                  {restoringId === v.id ? '恢复中…' : '恢复此版本'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}