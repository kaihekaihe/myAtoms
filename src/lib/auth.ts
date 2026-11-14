import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { db, nowIso } from './db';
import type { UserRow } from './db';

export const SESSION_COOKIE = 'atomlab_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SafeUser = Omit<UserRow, 'password_hash'>;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored || ':').split(':');
  if (!salt || !hash) return false;
  const got = crypto.scryptSync(password, salt, 64);
  const want = Buffer.from(hash, 'hex');
  return want.length === got.length && crypto.timingSafeEqual(got, want);
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  db()
    .prepare('INSERT INTO sessions(token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, new Date(Date.now() + SESSION_TTL_MS).toISOString(), nowIso());
  return token;
}

export function currentUser(): SafeUser | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, nowIso()) as SafeUser | undefined;
  return row ?? null;
}