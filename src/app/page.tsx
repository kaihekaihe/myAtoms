import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default function Home() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  redirect(token ? '/studio' : '/login');
}