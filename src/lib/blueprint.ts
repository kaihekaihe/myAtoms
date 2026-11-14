// AppBlueprint（应用蓝图）：类型定义、归一化、记录校验、版本差异、CSV 与统计。
// 纯函数模块，服务端路由与前端组件共用，不依赖数据库或 Next 运行时。

export type FieldKind = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'boolean';
export type ViewMode = 'table' | 'kanban' | 'cards';
export type StatType = 'count' | 'sum' | 'avg' | 'ratio';

export interface AppField {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  hint?: string;
  display?: 'currency' | 'percent';
}

export interface StatDef {
  label: string;
  type: StatType;
  field?: string;
  whereField?: string;
  whereValue?: string;
}

export interface AppBlueprint {
  app: { name: string; tagline: string; icon: string; accent: string };
  data: { entity: string; fields: AppField[] };
  views: { mode: ViewMode; columns: string[]; groupBy?: string };
  actions: { create: boolean; update: boolean; remove: boolean };
  stats: StatDef[];
  seed: Record<string, unknown>[];
}

export interface RecordData {
  id: number;
  data: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export const MODE_CN: Record<ViewMode, string> = {
  table: '表格',
  kanban: '看板',
  cards: '卡片',
};

const KINDS: FieldKind[] = ['text', 'textarea', 'number', 'date', 'select', 'boolean'];
const ACCENTS = ['#6c5ce7', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED = new Set(['id', 'created_at', 'updated_at', 'project_id']);
const MAX_FIELDS = 12;
const MAX_COLUMNS = 7;
const MAX_STATS = 3;
const MAX_SEED = 5;

function str(value: unknown, max: number): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function slug(value: unknown): string {
  let text = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (text && /^\d/.test(text)) text = `f_${text}`;
  return text.slice(0, 40);
}

function pickAccent(seedText: string): string {
  let hash = 0;
  for (const ch of seedText) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return ACCENTS[hash % ACCENTS.length];
}

function pickIcon(value: unknown): string {
  const text = str(value, 4).trim();
  if (!text) return '📦';
  const ch = Array.from(text)[0];
  return ch && !/^[a-zA-Z0-9\s#.,]$/.test(ch) ? ch : '📦';
}

function optionsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' && typeof item !== 'number') continue;
    const label = str(item, 16);
    if (label && !out.includes(label)) out.push(label);
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * 把模型/规则引擎产出的原始蓝图整理成运行时可安全解释的形状。
 * 越界内容一律修正或丢弃；字段不足时抛错，由调用方决定降级。
 */
export function normalizeBlueprint(raw: unknown): AppBlueprint {
  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const data = (root.data ?? {}) as Record<string, any>;
  const fieldsRaw: any[] = Array.isArray(data.fields)
    ? data.fields
    : Array.isArray(root.fields)
      ? root.fields
      : [];

  const fields: AppField[] = [];
  const used = new Set<string>();
  for (const item of fieldsRaw) {
    if (fields.length >= MAX_FIELDS || !item || typeof item !== 'object') continue;
    let name = slug(item.name ?? item.key);
    const label = str(item.label ?? item.name, 24) || name;
    if (!name) name = slug(label);
    if (!name) name = 'field';
    let candidate = name;
    let i = 2;
    while (used.has(candidate) || RESERVED.has(candidate)) {
      candidate = `${name}_${i}`;
      i += 1;
    }
    name = candidate;

    let kind = String(item.kind ?? item.type ?? '').toLowerCase() as FieldKind;
    if (!KINDS.includes(kind)) kind = 'text';

    let options: string[] | undefined;
    if (kind === 'select') {
      options = optionsFrom(item.options);
      if (options.length < 2) {
        kind = 'text';
        options = undefined;
      }
    }

    const field: AppField = { name, label, kind, required: Boolean(item.required) };
    if (options) field.options = options;
    const hint = str(item.hint ?? item.placeholder, 40);
    if (hint) field.hint = hint;
    if (kind === 'number' && (item.display === 'currency' || item.display === 'percent')) {
      field.display = item.display;
    }
    used.add(name);
    fields.push(field);
  }
  if (fields.length < 2) throw new Error('蓝图字段不足（至少 2 个）');

  const byName = new Map(fields.map((f) => [f.name, f]));

  const viewsRaw = (root.views ?? {}) as Record<string, any>;
  let mode: ViewMode =
    viewsRaw.mode === 'kanban' || viewsRaw.mode === 'cards' || viewsRaw.mode === 'table'
      ? viewsRaw.mode
      : root.layout === 'kanban' || root.layout === 'cards'
        ? root.layout
        : 'table';

  const columnsSource: unknown[] = Array.isArray(viewsRaw.columns)
    ? viewsRaw.columns
    : Array.isArray(viewsRaw.visibleFields)
      ? viewsRaw.visibleFields
      : [];
  const columns: string[] = [];
  for (const c of columnsSource) {
    const hit = byName.get(slug(c));
    if (hit && !columns.includes(hit.name)) columns.push(hit.name);
    if (columns.length >= MAX_COLUMNS) break;
  }
  if (columns.length === 0) {
    columns.push(...fields.slice(0, Math.min(5, fields.length)).map((f) => f.name));
  }

  let groupBy: string | undefined;
  if (viewsRaw.groupBy) {
    const g = byName.get(slug(viewsRaw.groupBy));
    if (g && g.kind === 'select') groupBy = g.name;
  }
  if (mode === 'kanban') {
    if (!groupBy) groupBy = fields.find((f) => f.kind === 'select')?.name;
    if (!groupBy) mode = 'table';
  }
  if (groupBy && !columns.includes(groupBy)) columns.unshift(groupBy);

  const actionsRaw = (root.actions ?? {}) as Record<string, any>;
  const actions = {
    create: actionsRaw.create === undefined ? true : Boolean(actionsRaw.create),
    update: actionsRaw.update === undefined ? true : Boolean(actionsRaw.update),
    remove: actionsRaw.remove === undefined ? true : Boolean(actionsRaw.remove),
  };

  const appRaw = (root.app ?? {}) as Record<string, any>;
  const appName = str(appRaw.name ?? root.name ?? root.title, 20) || '未命名应用';
  const accentRaw = str(appRaw.accent ?? appRaw.primaryColor, 7);
  const app = {
    name: appName,
    tagline: str(appRaw.tagline ?? appRaw.description, 40),
    icon: pickIcon(appRaw.icon),
    accent: HEX_RE.test(accentRaw) ? accentRaw.toLowerCase() : pickAccent(appName),
  };

  const stats: StatDef[] = [];
  for (const s of Array.isArray(root.stats) ? root.stats : []) {
    if (stats.length >= MAX_STATS || !s || typeof s !== 'object') continue;
    const label = str(s.label, 16);
    const type: StatType =
      s.type === 'sum' || s.type === 'avg' || s.type === 'ratio' || s.type === 'count' ? s.type : 'count';
    if (!label || stats.some((x) => x.label === label)) continue;
    const field = type === 'count' ? undefined : byName.get(slug(s.field));
    if ((type === 'sum' || type === 'avg') && (!field || field.kind !== 'number')) continue;
    const stat: StatDef = { label, type };
    if (field) stat.field = field.name;
    if (type === 'ratio') {
      const wf = byName.get(slug(s.whereField));
      const wv = str(s.whereValue, 24);
      if (!wf || wf.kind !== 'select' || !wf.options?.includes(wv)) continue;
      stat.whereField = wf.name;
      stat.whereValue = wv;
    }
    stats.push(stat);
  }

  const seed: Record<string, unknown>[] = [];
  const seedRaw = Array.isArray(data.seed) ? data.seed : Array.isArray(root.seed) ? root.seed : [];
  for (const row of seedRaw) {
    if (
      seed.length >= MAX_SEED ||
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row)
    )
      continue;
    const cleaned: Record<string, unknown> = {};
    let bad = false;
    for (const f of fields) {
      const v = (row as Record<string, unknown>)[f.name];
      if (v === undefined || v === null || v === '') continue;
      if (f.kind === 'number') {
        const n = typeof v === 'boolean' ? NaN : Number(v);
        if (!Number.isFinite(n)) {
          bad = true;
          break;
        }
        cleaned[f.name] = n;
      } else if (f.kind === 'boolean') {
        cleaned[f.name] = Boolean(v);
      } else if (f.kind === 'select') {
        const s = str(v, 24);
        if (!f.options?.includes(s)) {
          bad = true;
          break;
        }
        cleaned[f.name] = s;
      } else if (f.kind === 'date') {
        const s = str(v, 10);
        if (!DATE_RE.test(s)) {
          bad = true;
          break;
        }
        cleaned[f.name] = s;
      } else {
        cleaned[f.name] = str(v, 200);
      }
    }
    if (bad) continue;
    if (fields.some((f) => f.required && (cleaned[f.name] === undefined || cleaned[f.name] === '')))
      continue;
    seed.push(cleaned);
  }

  return {
    app,
    data: { entity: str(data.entity ?? data.entityName, 8) || '记录', fields },
    views: {
      mode,
      columns: columns.slice(0, MAX_COLUMNS),
      ...(groupBy ? { groupBy } : {}),
    },
    actions,
    stats,
    seed,
  };
}

/** 按蓝图校验一条记录。partial=true 时只校验提供的键（用于更新）。 */
export function validateRecord(
  bp: AppBlueprint,
  input: Record<string, unknown>,
  partial: boolean,
): { errors: string[]; clean: Record<string, unknown> } {
  const errors: string[] = [];
  const clean: Record<string, unknown> = {};
  const byName = new Map(bp.data.fields.map((f) => [f.name, f]));

  for (const [key, value] of Object.entries(input ?? {})) {
    const field = byName.get(key);
    if (!field) continue;
    if (value === null || value === undefined || value === '') {
      if (!partial) continue;
      clean[key] = value === '' ? (field.kind === 'number' ? null : '') : value;
      continue;
    }
    if (field.kind === 'text' || field.kind === 'textarea') {
      clean[key] = str(value, field.kind === 'textarea' ? 2000 : 200);
    } else if (field.kind === 'number') {
      const n = typeof value === 'boolean' ? NaN : Number(value);
      if (!Number.isFinite(n)) errors.push(`${field.label} 必须是数字`);
      else clean[key] = n;
    } else if (field.kind === 'date') {
      const s = str(value, 10);
      if (!DATE_RE.test(s)) errors.push(`${field.label} 需要 YYYY-MM-DD 格式的日期`);
      else clean[key] = s;
    } else if (field.kind === 'select') {
      const s = str(value, 24);
      if (!field.options?.includes(s)) errors.push(`${field.label} 的取值不在选项内`);
      else clean[key] = s;
    } else {
      clean[key] = Boolean(value);
    }
  }

  if (!partial) {
    for (const field of bp.data.fields) {
      if (!field.required) continue;
      const v = clean[field.name];
      if (v === undefined || v === null || v === '') errors.push(`${field.label} 为必填项`);
    }
  }
  return { errors, clean };
}

export function diffBlueprint(prev: AppBlueprint | null, next: AppBlueprint): string[] {
  if (!prev) {
    const parts = [`首次生成：${next.data.fields.length} 个字段`, `${MODE_CN[next.views.mode]}视图`];
    if (next.stats.length) parts.push(`${next.stats.length} 个统计卡`);
    if (next.seed.length) parts.push(`${next.seed.length} 条示例数据`);
    return parts;
  }
  const out: string[] = [];
  const oldMap = new Map(prev.data.fields.map((f) => [f.name, f]));
  const newMap = new Map(next.data.fields.map((f) => [f.name, f]));
  const added = [...newMap.values()].filter((f) => !oldMap.has(f.name));
  const removed = [...oldMap.values()].filter((f) => !newMap.has(f.name));
  if (added.length) out.push(`新增字段：${added.map((f) => f.label).join('、')}`);
  if (removed.length) out.push(`移除字段 ${removed.length} 个`);
  const changed = [...newMap.values()].filter((f) => {
    const o = oldMap.get(f.name);
    return (
      o &&
      (o.label !== f.label ||
        o.kind !== f.kind ||
        (o.options ?? []).join('|') !== (f.options ?? []).join('|'))
    );
  });
  if (changed.length) out.push(`调整字段：${changed.map((f) => f.label).join('、')}`);
  if (prev.views.mode !== next.views.mode) out.push(`视图切换为${MODE_CN[next.views.mode]}`);
  if (Boolean(prev.stats.length) !== Boolean(next.stats.length)) {
    out.push(next.stats.length ? '增加统计卡片' : '移除统计卡片');
  }
  if (prev.app.name !== next.app.name) out.push(`应用更名为「${next.app.name}」`);
  return out.length ? out : ['蓝图细节微调，结构保持不变'];
}

export function toCsv(bp: AppBlueprint, rows: RecordData[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = bp.data.fields.map((f) => esc(f.label));
  const body = rows.map((r) =>
    bp.data.fields.map((f) => {
      const v = r.data[f.name];
      return esc(f.kind === 'boolean' ? (v ? '是' : '否') : v);
    }),
  );
  // 前置 BOM，保证 Excel 直接打开中文不乱码
  return '\uFEFF' + [header, ...body].map((line) => line.join(',')).join('\n');
}

export interface StatValue {
  label: string;
  value: string;
}

/** 统计卡片取值（前端渲染时按当前记录集计算，无额外请求）。 */
export function computeStats(bp: AppBlueprint, rows: RecordData[]): StatValue[] {
  return bp.stats.map((stat) => {
    const total = rows.length;
    if (stat.type === 'count') return { label: stat.label, value: String(total) };
    const values = rows
      .map((r) => r.data[stat.field ?? ''])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (stat.type === 'sum') {
      const sum = values.reduce((a, b) => a + b, 0);
      const field = bp.data.fields.find((f) => f.name === stat.field);
      return {
        label: stat.label,
        value: field?.display === 'currency' ? `¥${Math.round(sum).toLocaleString()}` : String(Math.round(sum * 10) / 10),
      };
    }
    if (stat.type === 'avg') {
      if (!values.length) return { label: stat.label, value: '—' };
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      return { label: stat.label, value: String(Math.round(avg * 10) / 10) };
    }
    const matched = rows.filter((r) => r.data[stat.whereField ?? ''] === stat.whereValue).length;
    return { label: stat.label, value: total ? `${Math.round((matched / total) * 100)}%` : '—' };
  });
}