import { db, nowIso } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  const rows = db()
    .prepare(
      `SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM records r WHERE r.project_id = p.id) AS record_count,
              (SELECT b.version FROM blueprints b WHERE b.id = p.active_blueprint_id) AS active_version
       FROM projects p
       WHERE p.user_id = ?
       ORDER BY p.updated_at DESC`,
    )
    .all(user.id);
  return ok({ projects: rows });
}

export async function POST(req: Request) {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, '请求体需为 JSON');
  }
  const name = String(body?.name ?? '').trim().slice(0, 40);
  if (!name) return fail(400, '项目名不能为空');
  const description = String(body?.description ?? '').trim().slice(0, 200);
  const now = nowIso();
  const id = Number(
    db().prepare('INSERT INTO projects(user_id, name, description, created_at, updated_at) VALUES (?,?,?,?,?)')
      .run(user.id, name, description, now, now)
      .lastInsertRowid,
  );
  const row = db().prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return ok({ project: row });
}