'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  time: string;
  engine?: string;
  failed?: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  running: boolean;
  onSend: (text: string) => void;
}

const SUGGESTIONS = [
  '做一个库存管理应用，按品类看板展示，统计商品总数和库存总量',
  '客户跟进工具：记录姓名、公司、阶段、预计金额，看板按阶段分栏',
  '团队任务板，要有优先级和截止日期，能看完成率',
  '用户反馈收集，带评分和类型分布统计',
];

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

export function ChatPanel({ messages, running, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, running]);

  const submit = () => {
    const text = draft.trim();
    if (!text || running) return;
    setDraft('');
    onSend(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !running ? (
          <div className="pt-4 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-2xl">💬</div>
            <h3 className="mt-3 font-semibold">从一句话开始</h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              需求分析师 → 应用架构师 → 蓝图质检员
              <br />
              三个智能体接力，生成可运行的应用
            </p>
            <div className="mt-4 space-y-2 text-left">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs text-stone-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-violet-600 px-3.5 py-2 text-sm text-white">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[85%]">
                    <div
                      className={`whitespace-pre-wrap rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm ${
                        m.failed
                          ? 'border border-rose-200 bg-rose-50 text-rose-700'
                          : 'border border-stone-200 bg-stone-50 text-stone-700'
                      }`}
                    >
                      {m.text}
                      {m.engine && !m.failed && (
                        <span
                          className={`badge mt-2 border ${
                            m.engine === 'agent'
                              ? 'border-violet-200 bg-violet-50 text-violet-600'
                              : 'border-amber-200 bg-amber-50 text-amber-600'
                          }`}
                        >
                          {m.engine === 'agent' ? '智能体流水线' : '本地规则引擎'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 px-1 text-[10px] text-stone-400">{fmtTime(m.time)}</div>
                  </div>
                </div>
              ),
            )}
            {running && (
              <div className="flex items-center gap-2 px-1 text-xs text-stone-400">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
                智能体正在工作中…
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-stone-200 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-stone-200 bg-white p-2 transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
          <textarea
            className="max-h-32 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-stone-400"
            rows={2}
            placeholder="描述你想要的应用，或提出修改…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            onClick={submit}
            disabled={running || !draft.trim()}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}