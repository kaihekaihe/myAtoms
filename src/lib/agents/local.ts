// 内置规则引擎：LLM 不可用（未配置 Key / 网络失败 / 输出无法解析）时的降级生成器。
// 纯本地、零网络依赖，保证"没 Key 也能跑"。

import { normalizeBlueprint, type AppBlueprint } from '../blueprint';

export interface LocalResult {
  blueprint: AppBlueprint;
  understanding: string;
  reason: string;
}

type BlueprintSeed = {
  app: AppBlueprint['app'];
  entity: string;
  fields: AppBlueprint['data']['fields'];
  views: Omit<AppBlueprint['views'], 'columns'> & { columns: string[] };
  stats: AppBlueprint['stats'];
  seed: Record<string, unknown>[];
};

const TEMPLATES: { key: string; label: string; keywords: string[]; make: () => BlueprintSeed }[] = [
  {
    key: 'inventory',
    label: '库存管理',
    keywords: ['库存', '货品', '商品', '物料', '仓库', '仓管', '进销存', '盘点'],
    make: () => ({
      app: { name: '库存管理台', tagline: '库存进出与盘点一目了然', icon: '📦', accent: '#0ea5e9' },
      entity: '库存商品',
      fields: [
        { name: 'product_name', label: '商品名称', kind: 'text', required: true, hint: '如 无线鼠标' },
        { name: 'sku', label: '规格编号', kind: 'text', hint: '如 WM-001' },
        { name: 'category', label: '品类', kind: 'select', options: ['数码', '食品', '日用', '服饰', '其他'] },
        { name: 'stock', label: '当前库存', kind: 'number', hint: '剩余数量' },
        { name: 'safety', label: '安全库存', kind: 'number', hint: '低于该值需补货' },
        { name: 'last_check', label: '盘点日期', kind: 'date' },
        { name: 'note', label: '备注', kind: 'textarea' },
      ],
      views: { mode: 'table', columns: ['product_name', 'category', 'stock', 'safety', 'last_check'] },
      stats: [
        { label: '商品总数', type: 'count' },
        { label: '库存总量', type: 'sum', field: 'stock' },
      ],
      seed: [
        { product_name: '无线鼠标', sku: 'WM-001', category: '数码', stock: 120, safety: 30, last_check: '2026-11-02' },
        { product_name: '机械键盘', sku: 'KB-014', category: '数码', stock: 18, safety: 20, note: '低于安全库存，待补货' },
        { product_name: '抽纸 3 层', sku: 'DP-208', category: '日用', stock: 340, safety: 100, last_check: '2026-11-08' },
        { product_name: '咖啡豆 500g', sku: 'FD-330', category: '食品', stock: 56, safety: 40 },
      ],
    }),
  },
  {
    key: 'customer',
    label: '客户跟进',
    keywords: ['客户', '线索', '联系人', 'crm', '销售', '商机'],
    make: () => ({
      app: { name: '客户跟进台', tagline: '线索从触达到成交全流程', icon: '🤝', accent: '#6c5ce7' },
      entity: '客户',
      fields: [
        { name: 'name', label: '客户姓名', kind: 'text', required: true },
        { name: 'company', label: '公司', kind: 'text', hint: '如 星河科技' },
        { name: 'phone', label: '联系电话', kind: 'text' },
        {
          name: 'stage',
          label: '跟进阶段',
          kind: 'select',
          required: true,
          options: ['新线索', '初步接触', '方案沟通', '谈判', '已成交', '已流失'],
        },
        { name: 'value', label: '预计金额', kind: 'number', display: 'currency' },
        { name: 'owner', label: '负责人', kind: 'text' },
        { name: 'next_date', label: '下次跟进', kind: 'date' },
        { name: 'note', label: '备注', kind: 'textarea' },
      ],
      views: {
        mode: 'kanban',
        groupBy: 'stage',
        columns: ['name', 'company', 'value', 'next_date'],
      },
      stats: [
        { label: '客户总数', type: 'count' },
        { label: '预计金额合计', type: 'sum', field: 'value' },
        { label: '成交率', type: 'ratio', whereField: 'stage', whereValue: '已成交' },
      ],
      seed: [
        { name: '陈立', company: '星河科技', phone: '138-0000-1234', stage: '方案沟通', value: 86000, owner: '王芳', next_date: '2026-11-20' },
        { name: '刘洋', company: '云帆传媒', stage: '新线索', value: 32000, owner: '王芳', note: '展会认识，待首次拜访' },
        { name: '赵敏', company: '北原制造', stage: '已成交', value: 152000, owner: '周凯', next_date: '2026-12-01' },
        { name: '孙浩', company: '青藤教育', stage: '谈判', value: 98000, owner: '周凯' },
      ],
    }),
  },
  {
    key: 'task',
    label: '任务管理',
    keywords: ['任务', '待办', '工单', 'todo', '进度', '事项'],
    make: () => ({
      app: { name: '任务推进板', tagline: '事项按状态流转不遗漏', icon: '✅', accent: '#10b981' },
      entity: '任务',
      fields: [
        { name: 'title', label: '任务标题', kind: 'text', required: true },
        { name: 'status', label: '状态', kind: 'select', required: true, options: ['待处理', '进行中', '已完成'] },
        { name: 'priority', label: '优先级', kind: 'select', options: ['低', '中', '高'] },
        { name: 'assignee', label: '负责人', kind: 'text' },
        { name: 'due', label: '截止日期', kind: 'date' },
        { name: 'hours', label: '预计工时', kind: 'number', hint: '小时' },
        { name: 'note', label: '描述', kind: 'textarea' },
      ],
      views: { mode: 'kanban', groupBy: 'status', columns: ['title', 'priority', 'assignee', 'due'] },
      stats: [
        { label: '任务总数', type: 'count' },
        { label: '完成率', type: 'ratio', whereField: 'status', whereValue: '已完成' },
        { label: '平均工时', type: 'avg', field: 'hours' },
      ],
      seed: [
        { title: '重构登录模块', status: '进行中', priority: '高', assignee: '林一', due: '2026-11-18', hours: 8 },
        { title: '官网首页文案', status: '待处理', priority: '中', assignee: '苏叶', due: '2026-11-21', hours: 4 },
        { title: 'Q4 数据周报', status: '已完成', priority: '中', assignee: '林一', hours: 6 },
        { title: '客户回访 3 家', status: '待处理', priority: '低', assignee: '何平', hours: 3 },
      ],
    }),
  },
  {
    key: 'survey',
    label: '反馈收集',
    keywords: ['问卷', '反馈', '评价', '报名', '调查', '意见'],
    make: () => ({
      app: { name: '反馈收集站', tagline: '意见与评价结构化沉淀', icon: '📝', accent: '#f59e0b' },
      entity: '反馈',
      fields: [
        { name: 'topic', label: '反馈主题', kind: 'text', required: true },
        { name: 'category', label: '类型', kind: 'select', options: ['建议', '问题', '投诉', '表扬'] },
        { name: 'content', label: '具体内容', kind: 'textarea', required: true },
        { name: 'contact', label: '联系方式', kind: 'text' },
        { name: 'score', label: '评分(1-5)', kind: 'number' },
        { name: 'submitted_at', label: '提交日期', kind: 'date' },
        { name: 'handled', label: '是否处理', kind: 'boolean' },
      ],
      views: { mode: 'table', columns: ['topic', 'category', 'score', 'submitted_at', 'handled'] },
      stats: [
        { label: '反馈总数', type: 'count' },
        { label: '平均评分', type: 'avg', field: 'score' },
        { label: '表扬占比', type: 'ratio', whereField: 'category', whereValue: '表扬' },
      ],
      seed: [
        { topic: '加载速度', category: '问题', content: '首次进入列表页较慢，希望优化。', score: 3, submitted_at: '2026-11-05', handled: true },
        { topic: '搜索体验', category: '表扬', content: '搜索过滤很顺手，点赞。', score: 5, submitted_at: '2026-11-09', handled: false },
        { topic: '导出格式', category: '建议', content: '希望能导出 Excel，目前只有 CSV。', score: 4, contact: 'user@example.com', submitted_at: '2026-11-11' },
      ],
    }),
  },
];

const GENERIC: BlueprintSeed = {
  app: { name: '业务台账', tagline: '结构化记录与跟踪', icon: '🗂️', accent: '#8b5cf6' },
  entity: '记录',
  fields: [
    { name: 'title', label: '标题', kind: 'text', required: true },
    { name: 'status', label: '状态', kind: 'select', options: ['待处理', '进行中', '已完成'] },
    { name: 'amount', label: '金额', kind: 'number', display: 'currency' },
    { name: 'date', label: '日期', kind: 'date' },
    { name: 'owner', label: '负责人', kind: 'text' },
    { name: 'note', label: '备注', kind: 'textarea' },
  ],
  views: { mode: 'table', columns: ['title', 'status', 'amount', 'date', 'owner'] },
  stats: [{ label: '记录总数', type: 'count' }],
  seed: [
    { title: '示例记录 1', status: '进行中', amount: 1200, date: '2026-11-10', owner: '示例' },
    { title: '示例记录 2', status: '待处理', amount: 360, owner: '示例' },
    { title: '示例记录 3', status: '已完成', amount: 980, date: '2026-11-01' },
  ],
};

function detectTemplate(prompt: string) {
  const lower = prompt.toLowerCase();
  return TEMPLATES.find((t) => t.keywords.some((k) => lower.includes(k))) ?? null;
}

function ensureField(bp: AppBlueprint, field: AppBlueprint['data']['fields'][number]): boolean {
  if (bp.data.fields.some((f) => f.name === field.name || f.label === field.label)) return false;
  if (bp.data.fields.length >= 12) return false;
  bp.data.fields.push(field);
  return true;
}

/** 在既有蓝图上做规则化增量修改，返回变更描述。 */
function patch(current: AppBlueprint, prompt: string): { changes: string[] } {
  const changes: string[] = [];
  const lower = prompt.toLowerCase();

  if (/(看板|kanban)/.test(lower)) {
    current.views.mode = 'kanban';
    let group = current.data.fields.find((f) => f.kind === 'select');
    if (!group) {
      group = { name: 'status', label: '状态', kind: 'select', options: ['待处理', '进行中', '已完成'] };
      ensureField(current, group);
    }
    current.views.groupBy = group.name;
    if (!current.views.columns.includes(group.name)) current.views.columns.unshift(group.name);
    changes.push('切换为看板视图');
  } else if (/(卡片|cards?)/.test(lower)) {
    current.views.mode = 'cards';
    changes.push('切换为卡片视图');
  } else if (/(表格|table)/.test(lower)) {
    current.views.mode = 'table';
    changes.push('切换为表格视图');
  }

  const addMatch = prompt.match(/加(?:一个|个|一个)?\s*([A-Za-z\u4e00-\u9fa5]{1,10}?)\s*(?:字段|列|一栏)/);
  if (addMatch && addMatch[1]) {
    const label = addMatch[1].trim();
    let name = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!name) name = `field_${current.data.fields.length + 1}`;
    if (ensureField(current, { name, label, kind: 'text' })) {
      if (current.views.columns.length < 7 && !current.views.columns.includes(name)) {
        current.views.columns.push(name);
      }
      changes.push(`新增字段「${label}」`);
    }
  }

  if (/(金额|价格|报价)/.test(lower) && !current.data.fields.some((f) => f.kind === 'number')) {
    ensureField(current, { name: 'amount', label: '金额', kind: 'number', display: 'currency' });
    changes.push('补充金额字段');
  }
  if (/(日期|时间)/.test(lower) && !current.data.fields.some((f) => f.kind === 'date')) {
    ensureField(current, { name: 'date', label: '日期', kind: 'date' });
    changes.push('补充日期字段');
  }
  if (/(状态|阶段)/.test(lower) && !current.data.fields.some((f) => f.kind === 'select')) {
    ensureField(current, {
      name: 'status',
      label: '状态',
      kind: 'select',
      options: ['待处理', '进行中', '已完成'],
    });
    changes.push('补充状态下拉字段');
  }

  return { changes };
}

export function localGenerate(
  prompt: string,
  current: AppBlueprint | null,
  understandingOverride?: string,
): LocalResult {
  const tpl = detectTemplate(prompt);
  const tweak = current !== null && /加|增加|新增|改成|换|去掉|删除|调|启用|关闭|改为/.test(prompt) && !tpl;

  if (current && tweak) {
    const next = JSON.parse(JSON.stringify(current)) as AppBlueprint;
    next.seed = [];
    const { changes } = patch(next, prompt);
    return {
      blueprint: normalizeBlueprint(next),
      understanding: understandingOverride || `在现有「${current.app.name}」上做规则化调整`,
      reason: `应用规则：${changes.length ? changes.join('；') : '校验并保留现有结构'}`,
    };
  }

  const seed = tpl ? tpl.make() : GENERIC;
  const blueprint = normalizeBlueprint({
    app: seed.app,
    data: { entity: seed.entity, fields: seed.fields, seed: seed.seed },
    views: seed.views,
    actions: { create: true, update: true, remove: true },
    stats: seed.stats,
  });
  const { changes } = patch(blueprint, prompt);
  void changes; // 模板自带种子数据；增量补丁只调整结构，不新增种子

  return {
    blueprint: normalizeBlueprint(blueprint),
    understanding:
      understandingOverride ||
      (tpl ? `识别为「${tpl.label}」类需求，套用内置模板` : '未识别到明确业务类型，使用通用台账模板'),
    reason: changes.length ? `模板 + 规则补丁：${changes.join('；')}` : '使用内置模板直接生成',
  };
}