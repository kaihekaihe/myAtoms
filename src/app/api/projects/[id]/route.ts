import { db, loadJson, nowIso } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ok, fail, parseId } from '@/lib/api';
import type { AppBlueprint } from '@/lib/blueprint';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  if (!id) return fail(400, '无效的项目 ID');

  const d = db();
  const project = d.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, user.id) as
    | {
        id: number;
        name: string;
        description: string;
        created_at: string;
        active_blueprint_id: number | null;
      }
    | undefined;
  if (!project) return fail(404, '项目不存在');

  const bpRow = project.active_blueprint_id
    ? (d.prepare('SELECT * FROM blueprints WHERE id = ?').get(project.active_blueprint_id) as
        | { data: string; version: number }
        | undefined)
    : undefined;

  const versions = d
    .prepare('SELECT id, version, engine, source_prompt, created_at FROM blueprints WHERE project_id = ? ORDER BY version DESC')
    .all(id);
  const runs = d
    .prepare(
      `SELECT r.id, r.prompt, r.status, r.error, r.steps, r.created_at, b.engine AS engine
       FROM runs r LEFT JOIN blueprints b ON b.id = r.blueprint_id
       WHERE r.project_id = ?
       ORDER BY r.id DESC LIMIT 8`,
    )
    .all(id);
  const share = d.prepare('SELECT token FROM shares WHERE project_id = ?').get(id) as { token: string } | undefined;
  const recordRows = d
    .prepare('SELECT id, data, created_at, updated_at FROM records WHERE project_id = ? ORDER BY id ASC')
    .all(id);

  return ok({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      created_at: project.created_at,
      active_version: bpRow?.version ?? null,
    },
    blueprint: bpRow ? (loadJson<AppBlueprint | null>(bpRow.data, null)) : null,
    versions,
    runs: runs.map((r: any) => ({
      id: r.id,
      prompt: r.prompt,
      status: r.status,
      error: r.error,
      engine: r.engine ?? '',
      steps: loadJson(r.steps, []),
      created_at: r.created_at,
    })),
    shareToken: share?.token ?? null,
    records: recordRows.map((r: any) => ({
      id: r.id,
      data: loadJson(r.data, {}),
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  if (!id) return fail(400, '无效的项目 ID');
  const result = db()
    .prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .run(id, user.id);
  if (result.changes === 0) return fail(404, '项目不存在');
  void nowIso();
  return ok({ ok: true });
}