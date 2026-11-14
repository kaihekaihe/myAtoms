import { db, loadJson } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ok, fail, parseId } from '@/lib/api';
import type { AppBlueprint } from '@/lib/blueprint';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  if (!id) return fail(400, '无效的项目 ID');
  if (!db().prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(id, user.id)) {
    return fail(404, '项目不存在');
  }
  const rows = db()
    .prepare(
      'SELECT id, version, engine, source_prompt, created_at, data FROM blueprints WHERE project_id = ? ORDER BY version DESC',
    )
    .all(id) as any[];
  return ok({
    versions: rows.map((r) => ({
      id: r.id,
      version: r.version,
      engine: r.engine,
      source_prompt: r.source_prompt,
      created_at: r.created_at,
      blueprint: loadJson<AppBlueprint | null>(r.data, null),
    })),
  });
}