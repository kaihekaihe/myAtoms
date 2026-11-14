import { currentUser } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = currentUser();
  if (!user) return fail(401, '未登录');
  return ok({ user });
}