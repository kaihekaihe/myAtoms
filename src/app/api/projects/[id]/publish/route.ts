import crypto from 'node:crypto';
import { db, nowIso } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ok, fail, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

function publicBase(req: Request): string {
  const fromEnv = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const host = req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
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
  const existing = d.prepare('SELECT token FROM shares WHERE project_id = ?').get(id) as
    | { token: string }
    | undefined;
  let token = existing?.token;
  if (!token) {
    token = crypto.randomBytes(8).toString('hex');
    d.prepare('INSERT INTO shares(token, project_id, created_at) VALUES (?,?,?)').run(token, id, nowIso());
  }
  return ok({ token, url: `${publicBase(req)}/share/${token}` });
}