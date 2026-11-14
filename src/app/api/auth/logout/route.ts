import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { ok, fail } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    db().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  const res = ok({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}