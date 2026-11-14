import { NextResponse } from 'next/server';
import { db, nowIso } from '@/lib/db';
import { createSession, hashPassword, SESSION_COOKIE } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

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
  const name = String(body?.name ?? '').trim().slice(0, 24);
  const password = String(body?.password ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, '邮箱格式不正确');
  if (password.length < 6) return fail(400, '密码至少 6 位');

  const d = db();
  if (d.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return fail(409, '该邮箱已注册，请直接登录');
  }
  const displayName = name || email.split('@')[0];
  const userId = Number(
    d
      .prepare('INSERT INTO users(email, name, password_hash, created_at) VALUES (?,?,?,?)')
      .run(email, displayName, hashPassword(password), nowIso())
      .lastInsertRowid,
  );
  const token = createSession(userId);
  const res = ok({ user: { id: userId, email, name: displayName } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}