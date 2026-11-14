import { db, loadJson, nowIso } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ok, fail, parseId } from '@/lib/api';
import { validateRecord, type AppBlueprint } from '@/lib/blueprint';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  if (!id) return fail(400, '无效的项目 ID');
  const d = db();
  if (!d.prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(id, user.id)) {
    return fail(404, '项目不存在');
  }
  const rows = d
    .prepare('SELECT id, data, created_at, updated_at FROM records WHERE project_id = ? ORDER BY id ASC')
    .all(id) as any[];
  return ok({
    records: rows.map((r) => ({
      id: r.id,
      data: loadJson(r.data, {}),
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  if (!id) return fail(400, '无效的项目 ID');
  const d = db();
  if (!d.prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(id, user.id)) {
    return fail(404, '项目不存在');
  }

  const bpRow = d
    .prepare(
      `SELECT b.data FROM blueprints b JOIN projects p ON p.active_blueprint_id = b.id
       WHERE p.id = ? AND p.user_id = ?`,
    )
    .get(id, user.id) as { data: string } | undefined;
  if (!bpRow) return fail(409, '请先生成应用蓝图，再添加记录');
  const bp = loadJson<AppBlueprint | null>(bpRow.data, null);
  if (!bp) return fail(409, '当前版本蓝图不可用');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, '请求体需为 JSON');
  }
  const { errors, clean } = validateRecord(bp, body ?? {}, false);
  if (errors.length) return fail(400, errors.join('；'));

  const now = nowIso();
  const recId = Number(
    d
      .prepare('INSERT INTO records(project_id, data, created_at, updated_at) VALUES (?,?,?,?)')
      .run(id, JSON.stringify(clean), now, now)
      .lastInsertRowid,
  );
  return ok({ record: { id: recId, data: clean, created_at: now, updated_at: now } });
}