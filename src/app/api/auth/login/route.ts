import { db } from '@/lib/db';
import { createSession, verifyPassword, SESSION_COOKIE } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import type { UserRow } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, '请求体需为 JSON');
  }
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!email || !password) return fail(400, '请填写邮箱和密码');

  const row = db().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    return fail(401, '邮箱或密码不正确');
  }
  const token = createSession(row.id);
  const res = ok({ user: { id: row.id, email: row.email, name: row.name } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}