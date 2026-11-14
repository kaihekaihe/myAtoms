// 三智能体生成流水线：需求分析师 → 应用架构师 → 蓝图质检员。
// 每个阶段都是一次真实 LLM 调用，步骤状态实时落库（runs.steps），前端轮询可见。
// 任何阶段失败都有明确的降级路径，最终保证产出一份可渲染的蓝图。

import { db, nowIso } from '../db';
import {
  type AppBlueprint,
  MODE_CN,
  normalizeBlueprint,
} from '../blueprint';
import { chatJson, llmConfigured } from '../llm';
import { localGenerate } from './local';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface RunStep {
  seq: number;
  agent: string;
  title: string;
  status: StepStatus;
  ms?: number;
  note?: string;
}

export interface PipelineInput {
  runId: number;
  projectId: number;
  prompt: string;
  history: string[];
  current: AppBlueprint | null;
}

const STEP_DEFS = [
  { agent: 'analyst', title: '需求分析师' },
  { agent: 'architect', title: '应用架构师' },
  { agent: 'inspector', title: '蓝图质检员' },
];

function persistSteps(runId: number, steps: RunStep[]) {
  db()
    .prepare('UPDATE runs SET steps = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(steps), nowIso(), runId);
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 120);

function markDone(steps: RunStep[], i: number, ms: number, note: string) {
  steps[i].status = 'done';
  steps[i].ms = ms;
  steps[i].note = note;
}

function markFailed(steps: RunStep[], i: number, ms: number, note: string) {
  steps[i].status = 'failed';
  steps[i].ms = ms;
  steps[i].note = note;
}

// --------------------------------------------------------------------------------------
// 提示词
// --------------------------------------------------------------------------------------

const ANALYST_SYS = `你是 AtomLab 的需求分析师。用户会用中文描述想要的业务小应用，也可能在已有应用基础上提出修改。
你的任务：把需求理解成一份结构化的需求简报（JSON），供应用架构师使用。

只输出一个 JSON 对象，不要解释、不要用代码块包裹，结构如下：
{
  "understanding": "20-40 字概括用户想要的东西",
  "entity": "单条记录的 2-4 字名称，如 库存、工单、客户",
  "purpose": "一句话说明这个应用解决什么问题",
  "fieldIdeas": [{"label": "中文字段名", "kind": "text|textarea|number|date|select|boolean", "reason": "为什么需要该字段"}],
  "viewMode": "table | kanban | cards",
  "viewReason": "选择该视图的一句话理由",
  "theme": {"icon": "一个 emoji", "accent": "#rrggbb 十六进制色", "tagline": "20 字以内副标题"},
  "incremental": false
}

要求：
- fieldIdeas 给 4-9 个，覆盖用户提到的全部信息点；可补 1-2 个常用辅助字段（如备注、日期），不要臆造核心业务字段。
- kind 选择：金额/价格/数量/评分用 number；状态/类型/分类/阶段用 select；时间用 date；是/否用 boolean；长描述用 textarea；其余 text。
- 适合按状态分栏跟踪的需求（任务、工单、订单流转、线索阶段）选 kanban；信息密度高、列多选 table；重展示美感选 cards。
- 本次是在已有应用上做局部修改时（增删字段、换视图、改名），incremental 置 true。`;

const ARCHITECT_SYS = `你是 AtomLab 的应用架构师。根据需求简报与用户原话，产出一份完整的 AppBlueprint（应用蓝图 JSON）。蓝图会被通用运行时解释渲染，字段 name 是数据层锚点，必须谨慎设计。

只输出一个 JSON 对象，不要解释、不要用代码块包裹：
{
  "app": {"name": "应用名，10 字内", "tagline": "副标题，24 字内", "icon": "一个 emoji", "accent": "#rrggbb"},
  "data": {
    "entity": "记录名，2-4 字",
    "fields": [{"name": "snake_case 标识", "label": "中文名", "kind": "text|textarea|number|date|select|boolean", "required": false, "hint": "占位提示，可选", "options": ["仅 select 需要，2-8 个中文短选项"], "display": "currency 或 percent，仅 number 可选"}],
    "seed": [{"字段name": 值}, ...3-5 条示例记录]
  },
  "views": {"mode": "table|kanban|cards", "columns": ["列表展示字段 name，3-6 个，按重要性排序"], "groupBy": "看板模式必填：分栏用的 select 字段 name；其他模式省略"},
  "actions": {"create": true, "update": true, "remove": true},
  "stats": [{"label": "指标名", "type": "count|sum|avg|ratio", "field": "sum/avg 必填：number 字段 name", "whereField": "ratio 必填：select 字段 name", "whereValue": "ratio 必填：该字段某个 option 的原值"}]
}

硬性规则：
1. fields 4-10 个；name 只用小写字母、数字、下划线，全表唯一。
2. select 必须给 options（2-8 个不重复）。
3. kanban 必须配 groupBy 且指向一个 select 字段；columns 里要包含 groupBy。
4. stats 0-3 个；sum/avg 的 field 必须是 number 字段；ratio 的 whereValue 必须逐字等于该 select 字段的某个 option。
5. seed 每条的 key 必须是 fields 里的 name；number 给数值、select 给 options 原值、date 给 YYYY-MM-DD、boolean 给 true/false；内容贴近真实业务、有区分度；看板应用要覆盖每个分组各至少一条。首次生成给 3-5 条；在已有蓝图上增量修改时 seed 必须是空数组（业务数据已存在，不要重复编造）。
6. 增量修改时：保留未提及字段的 name 与 label 不变（name 是历史数据锚点），只动用户要求改的部分。
7. required 只给核心标识字段（名称/标题/编号/主题），其余 false。
8. 用户明确要求某状态标色/统计/高亮时，优先用 stats 表达；应用名与 icon 要贴合业务。`;

const INSPECTOR_SYS = `你是 AtomLab 的蓝图质检员。给你一份 AppBlueprint JSON 与用户需求原话，请逐项检查并输出修复后的完整蓝图 JSON（结构要求同架构师，这里不重复）。

检查清单：
1. 字段 name 是否全部合法（小写字母/数字/下划线、唯一、不以数字开头）；label 是否可读。
2. kind 是否在 text|textarea|number|date|select|boolean 内；select 的 options 是否 2-8 个且无重复。
3. views.columns 是否都指向真实字段、数量 3-6；mode 为 kanban 时 groupBy 是否存在且为 select 字段。
4. stats：type 是否合法；sum/avg 的 field 是否存在且为 number；ratio 的 whereField/whereValue 是否存在且 whereValue 逐字在 options 内。
5. seed：key 是否都在 fields 内；值是否与 kind 匹配（select 值必须在 options 内、date 是否 YYYY-MM-DD）；条数 3-5；看板应用是否覆盖各分组。
6. 语义贴合：是否遗漏用户明确提到的信息点；字段是否冗余。

只输出修复后的完整蓝图 JSON，不要输出检查过程。若全部合格，原样输出。`;

// --------------------------------------------------------------------------------------
// 阶段消息
// --------------------------------------------------------------------------------------

function historyBlock(history: string[]): string {
  if (!history.length) return '（无）';
  return history.map((h, i) => `${i + 1}. ${h}`).join('\n');
}

function userForAnalyst(input: PipelineInput): string {
  return [
    `【本次需求】\n${input.prompt}`,
    `【之前提过的需求（最近 ${input.history.length} 条）】\n${historyBlock(input.history)}`,
    `【当前应用蓝图】\n${input.current ? JSON.stringify(input.current) : 'null（首次生成）'}`,
    '请按系统要求输出需求简报 JSON。',
  ].join('\n\n');
}

function userForArchitect(input: PipelineInput, brief: Record<string, unknown> | null): string {
  return [
    `【用户需求原话】\n${input.prompt}`,
    `【需求分析师简报】\n${brief ? JSON.stringify(brief) : '（分析阶段失败，请直接从用户原话理解）'}`,
    `【当前应用蓝图（增量修改时保留未提及字段的 name）】\n${input.current ? JSON.stringify(input.current) : 'null（首次生成）'}`,
    '请输出完整 AppBlueprint JSON。',
  ].join('\n\n');
}

function userForInspector(input: PipelineInput, blueprint: AppBlueprint): string {
  return [
    `【用户需求原话】\n${input.prompt}`,
    `【待质检蓝图】\n${JSON.stringify(blueprint)}`,
    '请按检查清单输出修复后的完整蓝图 JSON。',
  ].join('\n\n');
}

// --------------------------------------------------------------------------------------
// 收尾
// --------------------------------------------------------------------------------------

function inspectionNote(before: AppBlueprint, after: AppBlueprint): string {
  const notes: string[] = [];
  const bNames = new Set(before.data.fields.map((f) => f.name));
  const aNames = new Set(after.data.fields.map((f) => f.name));
  const added = [...aNames].filter((n) => !bNames.has(n)).length;
  const removed = [...bNames].filter((n) => !aNames.has(n)).length;
  if (added) notes.push(`补字段 ${added} 个`);
  if (removed) notes.push(`删字段 ${removed} 个`);
  if (JSON.stringify(before.views) !== JSON.stringify(after.views)) notes.push('修正视图');
  if (JSON.stringify(before.stats) !== JSON.stringify(after.stats)) notes.push('修正统计');
  if (JSON.stringify(before.app) !== JSON.stringify(after.app)) notes.push('修正应用信息');
  if (JSON.stringify(before.seed) !== JSON.stringify(after.seed)) notes.push('修正示例数据');
  return `质检完成：${notes.length ? notes.join('、') : '逐项核对通过'}`;
}

/** 写入蓝图版本 + 种子记录 + 激活版本 + 结束 run。种子仅在项目尚无记录时插入（增量生成不重复造数据）。 */
function finalize(input: PipelineInput, bp: AppBlueprint, engine: 'agent' | 'local') {
  const d = db();
  const versionRow = d
    .prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM blueprints WHERE project_id = ?')
    .get(input.projectId) as { v: number };
  const now = nowIso();
  const bpId = Number(
    d
      .prepare(
        'INSERT INTO blueprints(project_id, version, data, source_prompt, run_id, engine, created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(input.projectId, versionRow.v, JSON.stringify(bp), input.prompt, input.runId, engine, now)
      .lastInsertRowid,
  );
  const existingCount = (
    d.prepare('SELECT COUNT(*) AS n FROM records WHERE project_id = ?').get(input.projectId) as { n: number }
  ).n;
  const ins = d.prepare('INSERT INTO records(project_id, data, created_at, updated_at) VALUES (?,?,?,?)');
  if (existingCount === 0 && bp.seed.length) {
    const seedAll = d.transaction(() => {
      for (const row of bp.seed) ins.run(input.projectId, JSON.stringify(row), now, now);
    });
    seedAll();
  }
  d.prepare('UPDATE projects SET active_blueprint_id = ?, updated_at = ? WHERE id = ?').run(
    bpId,
    now,
    input.projectId,
  );
  d.prepare('UPDATE runs SET status = ?, blueprint_id = ?, error = ?, updated_at = ? WHERE id = ?').run(
    'done',
    bpId,
    '',
    now,
    input.runId,
  );
}

function markRunFailed(runId: number, steps: RunStep[], message: string) {
  for (const s of steps) {
    if (s.status === 'running' || s.status === 'pending') {
      s.status = 'failed';
      s.note = message;
    }
  }
  persistSteps(runId, steps);
  db()
    .prepare('UPDATE runs SET status = ?, error = ?, updated_at = ? WHERE id = ?')
    .run('failed', message, nowIso(), runId);
}

function finishLocal(input: PipelineInput, steps: RunStep[], stageNote: string) {
  const t0 = Date.now();
  steps[0].status = 'running';
  let result;
  try {
    result = localGenerate(input.prompt, input.current);
  } catch (e) {
    markRunFailed(input.runId, steps, `规则引擎也失败：${errText(e)}`);
    return;
  }
  markDone(steps, 0, Date.now() - t0, result.understanding);
  markDone(steps, 1, 0, `本地规则引擎：${result.reason}（${stageNote}）`);
  steps[2] = { ...steps[2], status: 'skipped', note: '本地规则模式，无需质检' };
  persistSteps(input.runId, steps);
  try {
    finalize(input, result.blueprint, 'local');
  } catch (e) {
    markRunFailed(input.runId, steps, `落库失败：${errText(e)}`);
  }
}

// --------------------------------------------------------------------------------------
// 主流程
// --------------------------------------------------------------------------------------

export async function executePipeline(input: PipelineInput): Promise<void> {
  const steps: RunStep[] = STEP_DEFS.map((s, i) => ({
    seq: i + 1,
    agent: s.agent,
    title: s.title,
    status: 'pending',
  }));
  persistSteps(input.runId, steps);

  if (!llmConfigured()) {
    finishLocal(input, steps, '未配置 LLM_API_KEY');
    return;
  }

  // 阶段 1：需求分析
  let brief: Record<string, unknown> | null = null;
  {
    steps[0].status = 'running';
    persistSteps(input.runId, steps);
    const t0 = Date.now();
    try {
      brief = await chatJson(ANALYST_SYS, userForAnalyst(input));
      const u = String((brief as any).understanding ?? '').trim().slice(0, 60);
      markDone(steps, 0, Date.now() - t0, u ? `理解需求：${u}` : '产出需求简报');
    } catch (e) {
      markFailed(steps, 0, Date.now() - t0, `分析失败（${errText(e)}），跳过该阶段`);
    }
    persistSteps(input.runId, steps);
  }

  // 阶段 2：蓝图设计
  let blueprint: AppBlueprint | null = null;
  {
    steps[1].status = 'running';
    persistSteps(input.runId, steps);
    const t0 = Date.now();
    try {
      const raw = await chatJson(ARCHITECT_SYS, userForArchitect(input, brief));
      blueprint = normalizeBlueprint(raw);
      markDone(
        steps,
        1,
        Date.now() - t0,
        `产出蓝图：${blueprint.data.fields.length} 个字段 · ${MODE_CN[blueprint.views.mode]}视图 · ${blueprint.stats.length} 个统计 · ${blueprint.seed.length} 条示例数据`,
      );
    } catch (e) {
      markFailed(steps, 1, Date.now() - t0, `设计失败（${errText(e)}）`);
    }
    persistSteps(input.runId, steps);
  }

  if (!blueprint) {
    finishLocal(input, steps, '架构师阶段失败，整体降级');
    return;
  }

  // 阶段 3：质检修复
  let finalBp = blueprint;
  {
    steps[2].status = 'running';
    persistSteps(input.runId, steps);
    const t0 = Date.now();
    try {
      const raw = await chatJson(INSPECTOR_SYS, userForInspector(input, blueprint));
      finalBp = normalizeBlueprint(raw);
      markDone(steps, 2, Date.now() - t0, inspectionNote(blueprint, finalBp));
    } catch (e) {
      markFailed(steps, 2, Date.now() - t0, `质检失败（${errText(e)}），沿用架构师蓝图`);
    }
    persistSteps(input.runId, steps);
  }

  try {
    finalize(input, finalBp, 'agent');
  } catch (e) {
    markRunFailed(input.runId, steps, `落库失败：${errText(e)}`);
  }
}