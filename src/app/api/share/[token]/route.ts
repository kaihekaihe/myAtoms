import { db, loadJson } from '@/lib/db';
import { ok, fail } from '@/lib/api';
import type { AppBlueprint } from '@/lib/blueprint';

export const dynamic = 'force-dynamic';

/** 公开分享接口：免登录，仅暴露已发布应用的蓝图与数据。 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = String(params.token ?? '');
  if (!/^[a-f0-9]{16}$/.test(token)) return fail(404, '分享链接无效');

  const d = db();
  const share = d
    .prepare(
      `SELECT s.token, p.id AS project_id, p.name AS project_name, p.active_blueprint_id
       FROM shares s JOIN projects p ON p.id = s.project_id
       WHERE s.token = ?`,
    )
    .get(token) as any | undefined;
  if (!share) return fail(404, '分享链接无效或已撤销');

  const bpRow = share.active_blueprint_id
    ? (d.prepare('SELECT data FROM blueprints WHERE id = ?').get(share.active_blueprint_id) as
        | { data: string }
        | undefined)
    : undefined;
  const blueprint = bpRow ? loadJson<AppBlueprint | null>(bpRow.data, null) : null;

  const rows = d
    .prepare('SELECT id, data, created_at, updated_at FROM records WHERE project_id = ? ORDER BY id ASC')
    .all(share.project_id) as any[];

  return ok({
    projectName: share.project_name,
    blueprint,
    records: rows.map((r) => ({
      id: r.id,
      data: loadJson(r.data, {}),
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  });
}