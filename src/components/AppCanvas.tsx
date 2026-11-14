'use client';

import { useMemo, useState } from 'react';
import { Grid2X2, LayoutList, Pencil, Plus, Rows3, Search, Trash2, X } from 'lucide-react';
import {
  computeStats,
  MODE_CN,
  type AppBlueprint,
  type AppField,
  type RecordData,
} from '@/lib/blueprint';
import { DynamicField } from './fields';

interface AppCanvasProps {
  blueprint: AppBlueprint;
  records: RecordData[];
  readOnly?: boolean;
  onCreate?: (values: Record<string, unknown>) => Promise<void> | void;
  onEdit?: (id: number, values: Record<string, unknown>) => Promise<void> | void;
  onDelete?: (id: number) => Promise<void> | void;
  onPatch?: (id: number, partial: Record<string, unknown>) => Promise<void> | void;
}

const PILL_STYLES = [
  'border-violet-200 bg-violet-50 text-violet-700',
  'border-sky-200 bg-sky-50 text-sky-700',
  'border-amber-200 bg-amber-50 text-amber-700',
  'border-emerald-200 bg-emerald-50 text-emerald-700',
  'border-rose-200 bg-rose-50 text-rose-700',
  'border-stone-200 bg-stone-100 text-stone-600',
];

function Cell({ field, value }: { field: AppField; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-stone-300">—</span>;
  }
  if (field.kind === 'boolean') {
    return (
      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
          value
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-stone-200 bg-stone-100 text-stone-500'
        }`}
      >
        {value ? '是' : '否'}
      </span>
    );
  }
  if (field.kind === 'select') {
    const idx = field.options?.indexOf(String(value)) ?? -1;
    return (
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${PILL_STYLES[(idx >= 0 ? idx : 0) % PILL_STYLES.length]}`}>
        {String(value)}
      </span>
    );
  }
  if (field.kind === 'number') {
    const n = Number(value);
    if (field.display === 'currency') return <span>¥{n.toLocaleString()}</span>;
    if (field.display === 'percent') return <span>{n}%</span>;
    return <span>{n.toLocaleString()}</span>;
  }
  return <span className="break-all">{String(value)}</span>;
}

export function AppCanvas({
  blueprint,
  records,
  readOnly = false,
  onCreate,
  onEdit,
  onDelete,
  onPatch,
}: AppCanvasProps) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecordData | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);

  const fields = blueprint.data.fields;
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);
  const columns = useMemo(
    () =>
      blueprint.views.columns
        .map((name) => fieldMap.get(name))
        .filter((f): f is AppField => Boolean(f)),
    [blueprint.views.columns, fieldMap],
  );
  const titleField = columns[0];
  const groupByField = blueprint.views.groupBy ? fieldMap.get(blueprint.views.groupBy) : undefined;
  const stats = useMemo(() => computeStats(blueprint, records), [blueprint, records]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((r) => {
      const matchesSearch =
        !term || Object.values(r.data).some((v) => String(v ?? '').toLowerCase().includes(term));
      const matchesGroup = !groupByField || !group || String(r.data[groupByField.name] ?? '') === group;
      return matchesSearch && matchesGroup;
    });
  }, [records, search, group, groupByField]);

  const groupOptions = useMemo(() => {
    if (!groupByField) return [];
    const base = [...(groupByField.options ?? [])];
    for (const r of filtered) {
      const v = r.data[groupByField.name];
      if (v !== undefined && v !== null && v !== '' && !base.includes(String(v))) base.push(String(v));
    }
    return base;
  }, [groupByField, filtered]);

  const canMove = !readOnly && blueprint.actions.update && Boolean(groupByField) && Boolean(onPatch);

  const emptyValues = () => {
    const v: Record<string, unknown> = {};
    for (const f of fields) v[f.name] = f.kind === 'boolean' ? false : '';
    return v;
  };

  const openCreate = () => {
    setEditing(null);
    setValues(emptyValues());
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (r: RecordData) => {
    setEditing(r);
    setValues({ ...emptyValues(), ...r.data });
    setFormError('');
    setFormOpen(true);
  };

  const payloadFromValues = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.kind === 'number') {
        payload[f.name] = v === '' || v === null || v === undefined ? null : Number(v);
      } else {
        payload[f.name] = v;
      }
    }
    return payload;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = payloadFromValues();
      if (editing) {
        await onEdit?.(editing.id, payload);
      } else {
        await onCreate?.(payload);
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (r: RecordData) => {
    if (!window.confirm(`确定删除这条「${blueprint.data.entity}」吗？`)) return;
    onDelete?.(r.id);
  };

  const handleDrop = (g: string) => {
    if (dragId !== null && groupByField && canMove) {
      onPatch?.(dragId, { [groupByField.name]: g });
    }
    setDragId(null);
    setOverGroup(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 应用头 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-5 py-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl"
          style={{ background: `${blueprint.app.accent}1a` }}
        >
          {blueprint.app.icon}
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-semibold leading-tight">{blueprint.app.name}</h2>
          <p className="truncate text-xs text-stone-500">{blueprint.app.tagline}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-stone-400">
          <span className="badge border border-stone-200 bg-stone-50 text-stone-500">
            {blueprint.views.mode === 'kanban' ? (
              <Grid2X2 size={11} />
            ) : blueprint.views.mode === 'cards' ? (
              <Rows3 size={11} />
            ) : (
              <LayoutList size={11} />
            )}
            {MODE_CN[blueprint.views.mode]}视图
          </span>
          <span>
            {records.length} 条{blueprint.data.entity}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {/* 统计卡片 */}
        {stats.length > 0 && (
          <div className={`grid grid-cols-2 gap-3 ${stats.length > 2 ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
            {stats.map((s) => (
              <div key={s.label} className="card px-4 py-3">
                <div className="text-xs text-stone-500">{s.label}</div>
                <div className="mt-1 text-2xl font-semibold" style={{ color: blueprint.app.accent }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              className="input pl-9"
              placeholder={`搜索${blueprint.data.entity}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {groupByField && (
            <select
              className="input w-auto"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">全部{groupByField.label}</option>
              {groupOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          {!readOnly && blueprint.actions.create && (
            <button className="btn-primary ml-auto" onClick={openCreate}>
              <Plus size={14} /> 新增{blueprint.data.entity}
            </button>
          )}
        </div>

        {/* 视图 */}
        {filtered.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-stone-300 bg-white/60 py-16 text-center">
            <span className="text-2xl">🗒️</span>
            <p className="mt-2 text-sm text-stone-500">
              {search || group ? '没有符合当前条件的记录' : `暂无${blueprint.data.entity}数据`}
            </p>
            {!readOnly && blueprint.actions.create && !search && !group && (
              <button className="btn-outline mt-4" onClick={openCreate}>
                <Plus size={14} /> 新增第一条
              </button>
            )}
          </div>
        ) : blueprint.views.mode === 'kanban' && groupByField ? (
          <div className="flex items-start gap-3 overflow-x-auto pb-2">
            {groupOptions.map((g) => {
              const items = filtered.filter(
                (r) => String(r.data[groupByField.name] ?? '') === g,
              );
              // 空列自动隐藏：删光某分组后不留占位框（要移回该分组用编辑弹窗改选项）
              if (items.length === 0) return null;
              return (
                <div
                  key={g}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverGroup(g);
                  }}
                  onDragLeave={() => setOverGroup((cur) => (cur === g ? null : cur))}
                  onDrop={() => handleDrop(g)}
                  className={`w-60 shrink-0 rounded-xl p-2 transition ${
                    overGroup === g ? 'bg-violet-100/70 ring-2 ring-violet-300' : 'bg-stone-200/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-stone-600">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: blueprint.app.accent }}
                    />
                    {g}
                    <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-400">
                      {items.length}
                    </span>
                  </div>
                  <div className="mt-1 space-y-2">
                    {items.map((r) => (
                      <div
                        key={r.id}
                        draggable={canMove}
                        onDragStart={() => setDragId(r.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverGroup(null);
                        }}
                        className={`card p-3 ${canMove ? 'cursor-grab active:cursor-grabbing' : ''} ${
                          dragId === r.id ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-1">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {titleField ? (
                              <Cell field={titleField} value={r.data[titleField.name]} />
                            ) : (
                              `#${r.id}`
                            )}
                          </span>
                          {!readOnly && (blueprint.actions.update || blueprint.actions.remove) && (
                            <span className="flex shrink-0 gap-0.5 opacity-60 hover:opacity-100">
                              {blueprint.actions.update && (
                                <button
                                  title="编辑"
                                  onClick={() => openEdit(r)}
                                  className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                              {blueprint.actions.remove && (
                                <button
                                  title="删除"
                                  onClick={() => confirmDelete(r)}
                                  className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-500"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 space-y-1">
                          {columns
                            .filter((f) => f.name !== titleField?.name)
                            .slice(0, 2)
                            .map((f) => (
                              <div key={f.name} className="flex items-center gap-1 text-xs text-stone-500">
                                <span className="shrink-0">{f.label}：</span>
                                <span className="min-w-0 flex-1 truncate">
                                  <Cell field={f} value={r.data[f.name]} />
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : blueprint.views.mode === 'cards' ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <div key={r.id} className="card space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-semibold">
                    {titleField ? (
                      <Cell field={titleField} value={r.data[titleField.name]} />
                    ) : (
                      `#${r.id}`
                    )}
                  </div>
                  {!readOnly && (blueprint.actions.update || blueprint.actions.remove) && (
                    <span className="flex shrink-0 gap-0.5 opacity-60 hover:opacity-100">
                      {blueprint.actions.update && (
                        <button
                          title="编辑"
                          onClick={() => openEdit(r)}
                          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {blueprint.actions.remove && (
                        <button
                          title="删除"
                          onClick={() => confirmDelete(r)}
                          className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  )}
                </div>
                <dl className="space-y-1.5">
                  {columns
                    .filter((f) => f.name !== titleField?.name)
                    .map((f) => (
                      <div key={f.name} className="flex items-baseline gap-2 text-sm">
                        <dt className="w-20 shrink-0 text-xs text-stone-400">{f.label}</dt>
                        <dd className="min-w-0 flex-1">
                          <Cell field={f} value={r.data[f.name]} />
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left">
                    {columns.map((f) => (
                      <th key={f.name} className="whitespace-nowrap px-3 py-2.5 text-xs font-medium text-stone-500">
                        {f.label}
                      </th>
                    ))}
                    {!readOnly && (blueprint.actions.update || blueprint.actions.remove) && (
                      <th className="w-20 px-3 py-2.5 text-xs font-medium text-stone-500">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-stone-100 transition last:border-0 hover:bg-stone-50/60">
                      {columns.map((f) => (
                        <td key={f.name} className="max-w-[240px] px-3 py-2.5 align-top">
                          <Cell field={f} value={r.data[f.name]} />
                        </td>
                      ))}
                      {!readOnly && (blueprint.actions.update || blueprint.actions.remove) && (
                        <td className="px-3 py-2.5">
                          <span className="flex gap-0.5 opacity-60 hover:opacity-100">
                            {blueprint.actions.update && (
                              <button
                                title="编辑"
                                onClick={() => openEdit(r)}
                                className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            {blueprint.actions.remove && (
                              <button
                                title="删除"
                                onClick={() => confirmDelete(r)}
                                className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-500"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 记录表单 */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4"
          onMouseDown={() => setFormOpen(false)}
        >
          <form
            className="card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                {editing ? `编辑${blueprint.data.entity}` : `新增${blueprint.data.entity}`}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <DynamicField
                  key={f.name}
                  field={f}
                  value={values[f.name]}
                  accent={blueprint.app.accent}
                  onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
                />
              ))}
            </div>
            {formError && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                {formError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setFormOpen(false)}>
                取消
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}