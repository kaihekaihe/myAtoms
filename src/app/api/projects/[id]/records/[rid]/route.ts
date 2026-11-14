import { db, loadJson, nowIso } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ok, fail, parseId } from '@/lib/api';
import { validateRecord, type AppBlueprint } from '@/lib/blueprint';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string; rid: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  const rid = parseId(params.rid);
  if (!id || !rid) return fail(400, '无效的 ID');
  const d = db();
  if (!d.prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(id, user.id)) {
    return fail(404, '项目不存在');
  }
  const existing = d
    .prepare('SELECT * FROM records WHERE id = ? AND project_id = ?')
    .get(rid, id) as { data: string; created_at: string } | undefined;
  if (!existing) return fail(404, '记录不存在');

  const bpRow = d
    .prepare(
      `SELECT b.data FROM blueprints b JOIN projects p ON p.active_blueprint_id = b.id
       WHERE p.id = ? AND p.user_id = ?`,
    )
    .get(id, user.id) as { data: string } | undefined;
  if (!bpRow) return fail(409, '请先生成应用蓝图');
  const bp = loadJson<AppBlueprint | null>(bpRow.data, null);
  if (!bp) return fail(409, '当前版本蓝图不可用');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, '请求体需为 JSON');
  }
  const { errors, clean } = validateRecord(bp, body ?? {}, true);
  if (errors.length) return fail(400, errors.join('；'));

  const merged = { ...loadJson<Record<string, unknown>>(existing.data, {}), ...clean };
  const now = nowIso();
  d.prepare('UPDATE records SET data = ?, updated_at = ? WHERE id = ? AND project_id = ?').run(
    JSON.stringify(merged),
    now,
    rid,
    id,
  );
  return ok({ record: { id: rid, data: merged, created_at: existing.created_at, updated_at: now } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string; rid: string } }) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const id = parseId(params.id);
  const rid = parseId(params.rid);
  if (!id || !rid) return fail(400, '无效的 ID');
  const result = db()
    .prepare('DELETE FROM records WHERE id = ? AND project_id = ?')
    .run(rid, id);
  if (result.changes === 0) return fail(404, '记录不存在');
  return ok({ ok: true });
}