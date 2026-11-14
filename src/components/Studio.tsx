'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Download, Loader2, MessageSquare, Share2, X } from 'lucide-react';
import type { RecordData } from '@/lib/blueprint';
import type {
  ProjectDetail,
  ProjectSummary,
  RunBrief,
  RunView,
} from '@/lib/shared-types';
import { Sidebar } from './Sidebar';
import { AppCanvas } from './AppCanvas';
import { ChatPanel, type ChatMessage } from './ChatPanel';
import { TracePanel } from './TracePanel';
import { VersionsPanel } from './VersionsPanel';

interface Me {
  id: number;
  email: string;
  name: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `请求失败 (${res.status})`);
  return body;
}

function chatFromRuns(runs: RunBrief[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const r of runs) {
    out.push({ id: `u${r.id}`, role: 'user', text: r.prompt, time: r.created_at });
    if (r.status === 'done') {
      const understanding = r.steps.find((s) => s.agent === 'analyst')?.note || '已生成新版本';
      out.push({ id: `a${r.id}`, role: 'agent', text: understanding, time: r.created_at, engine: r.engine || 'agent' });
    } else if (r.status === 'failed') {
      out.push({
        id: `a${r.id}`,
        role: 'agent',
        text: `生成失败：${r.error || '未知原因'}。历史版本未受影响，可调整后重试。`,
        time: r.created_at,
        failed: true,
      });
    }
  }
  return out;
}

type Tab = 'chat' | 'trace' | 'versions';

const TABS: { key: Tab; label: string }[] = [
  { key: 'chat', label: '对话' },
  { key: 'trace', label: '智能体' },
  { key: 'versions', label: '版本' },
];

export default function Studio() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const [trace, setTrace] = useState<RunView | null>(null);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [rightOpen, setRightOpen] = useState(false);
  const toastTimer = useRef<number | null>(null);

  const running = activeRunId !== null;
  const blueprint = detail?.blueprint ?? null;
  const records = detail?.records ?? [];
  const activeVersion = detail?.project.active_version ?? null;
  const chat = useMemo(() => chatFromRuns(detail?.runs ?? []), [detail]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);

  const loadProjects = useCallback(async (): Promise<ProjectSummary[]> => {
    try {
      const data = await api<{ projects: ProjectSummary[] }>('/api/projects');
      setProjects(data.projects);
      return data.projects;
    } catch (e) {
      if ((e as Error).message === '未登录') router.replace('/login');
      return [];
    }
  }, [router]);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const data = await api<ProjectDetail>(`/api/projects/${id}`);
      setDetail(data);
      setShareToken(data.shareToken);
      return data;
    } catch {
      setDetail(null);
      return null;
    }
  }, []);

  const selectProject = useCallback(
    (id: number) => {
      setProjectId(id);
      setTrace(null);
      setActiveRunId(null);
      loadDetail(id);
    },
    [loadDetail],
  );

  // 初始化：校验登录态 → 项目列表 → 选中第一个
  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ user: Me }>('/api/auth/me');
        setMe(data.user);
      } catch {
        router.replace('/login');
        return;
      }
      const list = await loadProjects();
      if (list.length) selectProject(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 轮询生成任务进度
  useEffect(() => {
    if (activeRunId === null) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const data = await api<RunView>(`/api/runs/${activeRunId}`);
        if (stopped) return;
        setTrace(data);
        if (data.run.status !== 'running') {
          window.clearInterval(timer);
          setActiveRunId(null);
          if (data.run.status === 'done') {
            showToast(`已生成 v${data.result?.version ?? ''}`.trim());
          } else {
            showToast('生成失败，已保留历史版本');
          }
          if (projectId) {
            await loadDetail(projectId);
            await loadProjects();
          }
        }
      } catch {
        // 网络抖动：继续轮询
      }
    }, 1200);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeRunId, projectId, loadDetail, loadProjects, showToast]);

  const send = async (text: string) => {
    if (!projectId || running) return;
    setTab('trace');
    setTrace({
      run: {
        id: -1,
        prompt: text,
        status: 'running',
        error: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      steps: [
        { seq: 1, agent: 'analyst', title: '需求分析师', status: 'pending' },
        { seq: 2, agent: 'architect', title: '应用架构师', status: 'pending' },
        { seq: 3, agent: 'inspector', title: '蓝图质检员', status: 'pending' },
      ],
      result: null,
    });
    try {
      const data = await api<{ runId: number }>(`/api/projects/${projectId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ prompt: text }),
      });
      setActiveRunId(data.runId);
    } catch (e) {
      showToast((e as Error).message);
      setTrace(null);
      setTab('chat');
    }
  };

  const createProject = async (name: string) => {
    try {
      const data = await api<{ project: ProjectSummary }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await loadProjects();
      selectProject(data.project.id);
      showToast('项目已创建，描述需求开始生成');
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const removeProject = async (id: number) => {
    if (!window.confirm('确定删除该项目？所有蓝图版本与数据都会清除。')) return;
    try {
      await api(`/api/projects/${id}`, { method: 'DELETE' });
      const list = await loadProjects();
      if (projectId === id) {
        if (list.length) selectProject(list[0].id);
        else {
          setProjectId(null);
          setDetail(null);
        }
      }
      showToast('项目已删除');
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const publish = async () => {
    if (!projectId) return;
    setPublishing(true);
    try {
      const data = await api<{ token: string }>(`/api/projects/${projectId}/publish`, {
        method: 'POST',
      });
      setShareToken(data.token);
      showToast('已发布，链接可复制分享');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const copyShare = async () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/share/${shareToken}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const restore = async (vid: number) => {
    if (!projectId) return;
    setRestoringId(vid);
    try {
      await api(`/api/projects/${projectId}/versions/${vid}/restore`, { method: 'POST' });
      await loadDetail(projectId);
      await loadProjects();
      showToast('已恢复并创建新版本');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setRestoringId(null);
    }
  };

  const createRecord = async (values: Record<string, unknown>) => {
    if (!projectId) return;
    const data = await api<{ record: RecordData }>(`/api/projects/${projectId}/records`, {
      method: 'POST',
      body: JSON.stringify(values),
    });
    setDetail((cur) => (cur ? { ...cur, records: [data.record, ...cur.records] } : cur));
    void loadProjects(); // 同步侧栏记录数
    showToast('已保存');
  };

  const updateRecord = async (id: number, values: Record<string, unknown>) => {
    if (!projectId) return;
    const data = await api<{ record: RecordData }>(`/api/projects/${projectId}/records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(values),
    });
    setDetail((cur) =>
      cur ? { ...cur, records: cur.records.map((r) => (r.id === data.record.id ? data.record : r)) } : cur,
    );
    showToast('已保存');
  };

  const removeRecord = async (id: number) => {
    if (!projectId) return;
    await api(`/api/projects/${projectId}/records/${id}`, { method: 'DELETE' });
    setDetail((cur) => (cur ? { ...cur, records: cur.records.filter((r) => r.id !== id) } : cur));
    void loadProjects(); // 同步侧栏记录数
    showToast('已删除');
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  };

  const currentStepTitle = trace?.steps.find((s) => s.status === 'running')?.title;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        {me && (
          <Sidebar
            user={me}
            projects={projects}
            selectedId={projectId}
            running={running}
            onSelect={selectProject}
            onCreate={createProject}
            onDelete={removeProject}
            onLogout={logout}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* 顶栏 */}
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4">
            <div className="min-w-0 flex-1 lg:flex-none lg:max-w-md">
              <div className="lg:hidden">
                <select
                  className="input py-1.5 text-sm font-medium"
                  value={projectId ?? ''}
                  onChange={(e) => e.target.value && selectProject(Number(e.target.value))}
                >
                  <option value="" disabled>
                    选择项目
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hidden lg:block">
                <div className="flex items-center gap-2">
                  <h1 className="truncate font-semibold">{detail?.project.name ?? 'AtomLab'}</h1>
                  {activeVersion !== null && (
                    <span className="badge shrink-0 border border-violet-200 bg-violet-50 text-violet-600">
                      v{activeVersion}
                    </span>
                  )}
                  {running && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-violet-600">
                      <Loader2 size={12} className="animate-spin" /> 生成中
                    </span>
                  )}
                </div>
                {detail?.project.description && (
                  <p className="truncate text-xs text-stone-400">{detail.project.description}</p>
                )}
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {shareToken ? (
                <button className="btn-outline py-1.5 text-xs" onClick={copyShare}>
                  {copied ? <Copy size={13} className="text-emerald-600" /> : <Share2 size={13} />}
                  {copied ? '已复制' : '分享链接'}
                </button>
              ) : (
                <button
                  className="btn-outline py-1.5 text-xs"
                  disabled={!blueprint || running || publishing}
                  onClick={publish}
                >
                  <Share2 size={13} /> {publishing ? '发布中…' : '发布分享'}
                </button>
              )}
              <button
                className="btn-outline py-1.5 text-xs"
                disabled={!blueprint || !projectId}
                onClick={() => projectId && window.open(`/api/projects/${projectId}/export`, '_blank')}
              >
                <Download size={13} /> 导出 CSV
              </button>
              <button
                className="btn-ghost px-2 py-1.5 text-stone-500 lg:hidden"
                onClick={() => setRightOpen(true)}
              >
                <MessageSquare size={16} />
              </button>
            </div>
          </header>

          {/* 主体 */}
          <div className="relative flex min-h-0 flex-1">
            <section className="min-w-0 flex-1">
              {blueprint ? (
                <AppCanvas
                  blueprint={blueprint}
                  records={records}
                  onCreate={createRecord}
                  onEdit={updateRecord}
                  onDelete={removeRecord}
                  onPatch={updateRecord}
                />
              ) : (
                <div className="grid h-full place-items-center p-8">
                  <div className="max-w-sm text-center">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white text-3xl shadow-panel">
                      🏗️
                    </div>
                    <h2 className="mt-5 text-lg font-semibold">
                      {running ? '三个智能体正在为你搭建应用' : '这里还空着'}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-stone-500">
                      {running
                        ? `当前阶段：${currentStepTitle ?? '启动中'}`
                        : '在右侧「对话」里用一句话描述你想要的业务应用，需求分析师、应用架构师和蓝图质检员会接力把它变成可运行的界面。'}
                    </p>
                    {running && (
                      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-violet-600">
                        <Loader2 size={13} className="animate-spin" /> 预计 10-30 秒
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* 右侧面板 */}
            <aside
              className={`${
                rightOpen ? 'flex' : 'hidden lg:flex'
              } fixed inset-y-0 right-0 z-40 w-[min(92vw,380px)] flex-col border-l border-stone-200 bg-white shadow-2xl lg:static lg:z-auto lg:w-[380px] lg:shadow-none`}
            >
              <div className="flex shrink-0 items-center border-b border-stone-200">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`relative flex-1 py-2.5 text-sm font-medium transition ${
                      tab === t.key ? 'text-violet-600' : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    {t.label}
                    {t.key === 'versions' && detail?.versions.length ? (
                      <span className="ml-1 text-[10px] text-stone-400">{detail.versions.length}</span>
                    ) : null}
                    {t.key === 'trace' && running && (
                      <span className="absolute right-4 top-2.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                    )}
                    {tab === t.key && (
                      <span className="absolute inset-x-6 -bottom-px h-0.5 rounded-full bg-violet-600" />
                    )}
                  </button>
                ))}
                <button
                  className="px-3 text-stone-400 hover:text-stone-600 lg:hidden"
                  onClick={() => setRightOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {tab === 'chat' && <ChatPanel messages={chat} running={running} onSend={send} />}
                {tab === 'trace' && <TracePanel trace={trace} />}
                {tab === 'versions' && (
                  <VersionsPanel
                    versions={detail?.versions ?? []}
                    activeVersion={activeVersion}
                    onRestore={restore}
                    restoringId={restoringId}
                  />
                )}
              </div>
            </aside>
            {rightOpen && (
              <div className="absolute inset-0 z-30 bg-ink-950/30 lg:hidden" onClick={() => setRightOpen(false)} />
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-ink-950 px-4 py-2 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}