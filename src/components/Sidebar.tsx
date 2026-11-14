'use client';

import { useState } from 'react';
import { LogOut, Plus, Trash2 } from 'lucide-react';
import type { ProjectSummary } from '@/lib/shared-types';

interface SidebarProps {
  user: { id: number; email: string; name: string };
  projects: ProjectSummary[];
  selectedId: number | null;
  running: boolean;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onDelete: (id: number) => void;
  onLogout: () => void;
}

export function Sidebar({ user, projects, selectedId, running, onSelect, onCreate, onDelete, onLogout }: SidebarProps) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setCreating(false);
    setDraft('');
    onCreate(name);
  };

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-ink-950 text-stone-300 lg:flex">
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white">
          A
        </div>
        <div>
          <div className="text-sm font-semibold text-white">AtomLab</div>
          <div className="text-[10px] tracking-wide text-stone-500">智能体应用工作台</div>
        </div>
      </div>

      <div className="px-3">
        {creating ? (
          <form onSubmit={submitCreate} className="mb-2 flex gap-1.5">
            <input
              autoFocus
              className="w-full min-w-0 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-stone-600 focus:border-violet-500"
              placeholder="项目名，如 我的库存"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={40}
            />
            <button className="shrink-0 rounded-lg bg-violet-600 px-2.5 text-sm font-medium text-white hover:bg-violet-500">
              创建
            </button>
            <button
              type="button"
              className="shrink-0 rounded-lg px-1.5 text-sm text-stone-500 hover:bg-ink-800"
              onClick={() => setCreating(false)}
            >
              ✕
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-700 py-2 text-sm text-stone-400 transition hover:border-violet-500 hover:text-violet-300"
          >
            <Plus size={14} /> 新建项目
          </button>
        )}

        <nav className="space-y-0.5">
          {projects.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center rounded-lg pr-1 ${
                p.id === selectedId ? 'bg-ink-800 text-white' : 'hover:bg-ink-900'
              }`}
            >
              <button onClick={() => onSelect(p.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block truncate text-[11px] text-stone-500">
                  {p.active_version ? `v${p.active_version}` : '未生成'} · {p.record_count} 条记录
                  {running && p.id === selectedId && <span className="text-violet-400"> · 生成中</span>}
                </span>
              </button>
              <button
                title="删除项目"
                onClick={() => onDelete(p.id)}
                className="shrink-0 px-1.5 text-stone-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="px-3 py-6 text-center text-xs leading-relaxed text-stone-600">
              还没有项目
              <br />
              点击上方新建一个吧
            </div>
          )}
        </nav>
      </div>

      <div className="mt-auto border-t border-ink-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-700 text-xs font-semibold text-white">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-stone-300">{user.name}</div>
            <div className="truncate text-[11px] text-stone-500">{user.email}</div>
          </div>
          <button title="退出登录" onClick={onLogout} className="shrink-0 text-stone-500 transition hover:text-white">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}