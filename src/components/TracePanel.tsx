'use client';

import { Loader2 } from 'lucide-react';
import type { RunStepView, RunView } from '@/lib/shared-types';

interface TracePanelProps {
  trace: RunView | null;
}

const STATUS_LABEL: Record<RunStepView['status'], string> = {
  pending: '等待中',
  running: '执行中',
  done: '完成',
  failed: '失败',
  skipped: '跳过',
};

function iconCls(status: RunStepView['status']): string {
  switch (status) {
    case 'running':
      return 'border-violet-300 text-violet-600';
    case 'done':
      return 'border-emerald-300 text-emerald-600';
    case 'failed':
      return 'border-rose-300 text-rose-600';
    default:
      return 'border-stone-200 text-stone-400';
  }
}

export function TracePanel({ trace }: TracePanelProps) {
  if (!trace) {
    return (
      <div className="p-6 text-center text-xs leading-relaxed text-stone-400">
        还没有生成记录。
        <br />
        在「对话」里描述需求，这里会实时展示三个智能体的执行过程。
      </div>
    );
  }
  const steps = trace.steps;
  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
        <div className="text-[10px] font-medium tracking-wide text-stone-400">本次需求</div>
        <div className="mt-1 text-xs leading-relaxed text-stone-700">{trace.run.prompt}</div>
      </div>

      <div>
        {steps.map((s, i) => (
          <div key={s.agent} className="relative flex gap-3 pb-4">
            {i < steps.length - 1 && (
              <span className="absolute left-[11px] top-6 h-full w-px bg-stone-200" />
            )}
            <span
              className={`z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border bg-white text-xs font-bold ${iconCls(
                s.status,
              )}`}
            >
              {s.status === 'running' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : s.status === 'done' ? (
                '✓'
              ) : s.status === 'failed' ? (
                '✕'
              ) : s.status === 'skipped' ? (
                '—'
              ) : (
                '○'
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{s.title}</span>
                <span className="text-[10px] text-stone-400">
                  {STATUS_LABEL[s.status]}
                  {s.ms !== undefined ? ` · ${(s.ms / 1000).toFixed(1)}s` : ''}
                </span>
              </div>
              {s.note && (
                <p
                  className={`mt-0.5 text-xs leading-relaxed ${
                    s.status === 'failed' ? 'text-rose-500' : 'text-stone-500'
                  }`}
                >
                  {s.note}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {trace.run.status === 'failed' && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-600">
          任务失败：{trace.run.error || '未知原因'}。可回到对话重试。
        </div>
      )}

      {trace.run.status === 'done' && trace.result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <div className="font-medium">已生成 v{trace.result.version}</div>
          {trace.result.diff.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {trace.result.diff.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}