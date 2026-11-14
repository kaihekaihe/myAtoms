import { db, loadJson } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ok, fail, parseId } from '@/lib/api';
import { diffBlueprint, type AppBlueprint } from '@/lib/blueprint';
import type { RunStep } from '@/lib/agents/pipeline';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const runId = parseId(params.runId);
  if (!runId) return fail(400, '无效的任务 ID');

  const d = db();
  const run = d.prepare('SELECT * FROM runs WHERE id = ? AND user_id = ?').get(runId, user.id) as
    | any
    | undefined;
  if (!run) return fail(404, '生成任务不存在');

  let result: {
    version: number;
    engine: string;
    blueprint: AppBlueprint | null;
    diff: string[];
  } | null = null;
  if (run.blueprint_id) {
    const bp = d.prepare('SELECT * FROM blueprints WHERE id = ?').get(run.blueprint_id) as any | undefined;
    if (bp) {
      const next = loadJson<AppBlueprint | null>(bp.data, null);
      const prevRow = d
        .prepare('SELECT data FROM blueprints WHERE project_id = ? AND version = ?')
        .get(bp.project_id, bp.version - 1) as { data: string } | undefined;
      const prev = prevRow ? loadJson<AppBlueprint | null>(prevRow.data, null) : null;
      result = { version: bp.version, engine: bp.engine, blueprint: next, diff: next ? diffBlueprint(prev, next) : [] };
    }
  }

  return ok({
    run: {
      id: run.id,
      prompt: run.prompt,
      status: run.status,
      error: run.error,
      created_at: run.created_at,
      updated_at: run.updated_at,
    },
    steps: loadJson<RunStep[]>(run.steps, []),
    result,
  });
}