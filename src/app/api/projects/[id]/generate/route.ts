import { db, loadJson, nowIso } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ok, fail, parseId } from '@/lib/api';
import { executePipeline } from '@/lib/agents/pipeline';
import type { AppBlueprint } from '@/lib/blueprint';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  if (!id) return fail(400, '无效的项目 ID');

  const d = db();
  const project = d
    .prepare('SELECT id, active_blueprint_id FROM projects WHERE id = ? AND user_id = ?')
    .get(id, user.id) as { id: number; active_blueprint_id: number | null } | undefined;
  if (!project) return fail(404, '项目不存在');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, '请求体需为 JSON');
  }
  const prompt = String(body?.prompt ?? '').trim();
  if (!prompt) return fail(400, '请输入需求描述');
  if (prompt.length > 2000) return fail(400, '需求描述过长（最多 2000 字）');

  const running = d.prepare(`SELECT id FROM runs WHERE project_id = ? AND status = 'running'`).get(id);
  if (running) return fail(409, '已有生成任务在进行中，请稍候');

  const history = d
    .prepare('SELECT prompt FROM runs WHERE project_id = ? ORDER BY id DESC LIMIT 2')
    .all(id)
    .map((r: any) => r.prompt)
    .reverse();
  const bpRow = project.active_blueprint_id
    ? (d.prepare('SELECT data FROM blueprints WHERE id = ?').get(project.active_blueprint_id) as
        | { data: string }
        | undefined)
    : undefined;
  const current = bpRow ? loadJson<AppBlueprint | null>(bpRow.data, null) : null;

  const now = nowIso();
  const runId = Number(
    d
      .prepare(
        `INSERT INTO runs(project_id, user_id, prompt, status, steps, error, created_at, updated_at)
         VALUES (?,?,?,'running','[]','',?,?)`,
      )
      .run(id, user.id, prompt, now, now)
      .lastInsertRowid,
  );

  // 流水线在后台执行，前端通过轮询 /api/runs/{runId} 获取进度
  void executePipeline({ runId, projectId: id, prompt, history, current }).catch((e) => {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    db()
      .prepare(`UPDATE runs SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'running'`)
      .run(msg, nowIso(), runId);
  });

  return ok({ runId });
}