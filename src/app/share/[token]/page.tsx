import { notFound } from 'next/navigation';
import { db, loadJson } from '@/lib/db';
import type { AppBlueprint, RecordData } from '@/lib/blueprint';
import ShareView from './ShareView';

export const dynamic = 'force-dynamic';

export default async function SharePage({ params }: { params: { token: string } }) {
  const token = String(params.token ?? '');
  const d = db();
  const share = d
    .prepare(
      `SELECT s.token, p.id AS project_id, p.name AS project_name, p.active_blueprint_id
       FROM shares s JOIN projects p ON p.id = s.project_id
       WHERE s.token = ?`,
    )
    .get(token) as
    | { token: string; project_id: number; project_name: string; active_blueprint_id: number | null }
    | undefined;
  if (!share) notFound();

  const bpRow = share.active_blueprint_id
    ? (d.prepare('SELECT data FROM blueprints WHERE id = ?').get(share.active_blueprint_id) as
        | { data: string }
        | undefined)
    : undefined;
  const blueprint = bpRow ? loadJson<AppBlueprint | null>(bpRow.data, null) : null;

  const rows = d
    .prepare('SELECT id, data FROM records WHERE project_id = ? ORDER BY id ASC')
    .all(share.project_id) as { id: number; data: string }[];
  const records: RecordData[] = rows.map((r) => ({ id: r.id, data: loadJson(r.data, {}) }));

  return <ShareView projectName={share.project_name} blueprint={blueprint} records={records} />;
}