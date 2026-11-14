import { db, loadJson } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { fail, parseId } from '@/lib/api';
import { toCsv, type AppBlueprint } from '@/lib/blueprint';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  if (!id) return fail(400, '无效的项目 ID');

  const d = db();
  const project = d
    .prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
    .get(id, user.id) as any | undefined;
  if (!project) return fail(404, '项目不存在');
  if (!project.active_blueprint_id) return fail(409, '请先生成应用蓝图再导出数据');

  const bpRow = d.prepare('SELECT data FROM blueprints WHERE id = ?').get(project.active_blueprint_id) as
    | { data: string }
    | undefined;
  const bp = bpRow ? loadJson<AppBlueprint | null>(bpRow.data, null) : null;
  if (!bp) return fail(409, '当前版本蓝图不可用');

  const rows = d
    .prepare('SELECT id, data FROM records WHERE project_id = ? ORDER BY id ASC')
    .all(id) as any[];
  const csv = toCsv(
    bp,
    rows.map((r) => ({ id: r.id, data: loadJson(r.data, {}) })),
  );
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="atomlab-${id}.csv"`,
    },
  });
}