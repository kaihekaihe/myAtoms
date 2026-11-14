import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import Studio from '@/components/Studio';

export const dynamic = 'force-dynamic';

export default function StudioPage() {
  const user = currentUser();
  if (!user) redirect('/login');
  return <Studio />;
}