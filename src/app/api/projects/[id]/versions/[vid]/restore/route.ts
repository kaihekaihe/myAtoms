import { db, nowIso } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ok, fail, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string; vid: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  const vid = parseId(params.vid);
  if (!id || !vid) return fail(400, '无效的 ID');

  const d = db();
  if (!d.prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(id, user.id)) {
    return fail(404, '项目不存在');
  }
  const old = d.prepare('SELECT * FROM blueprints WHERE id = ? AND project_id = ?').get(vid, id) as
    | any
    | undefined;
  if (!old) return fail(404, '版本不存在');

  const nextVersion = (
    d.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM blueprints WHERE project_id = ?').get(id) as { v: number }
  ).v;
  const now = nowIso();
  const newId = Number(
    d
      .prepare(
        'INSERT INTO blueprints(project_id, version, data, source_prompt, run_id, engine, created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(id, nextVersion, old.data, `恢复自 v${old.version}`, null, 'restore', now)
      .lastInsertRowid,
  );
  d.prepare('UPDATE projects SET active_blueprint_id = ?, updated_at = ? WHERE id = ?').run(newId, now, id);
  return ok({
    version: {
      id: newId,
      version: nextVersion,
      engine: 'restore',
      source_prompt: `恢复自 v${old.version}`,
      created_at: now,
    },
  });
}