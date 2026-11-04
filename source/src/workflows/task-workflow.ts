import type { GeoTask, ServiceMode, TaskProgress, UserRole } from '../data/geo-data'

import { directRepairStatus, isDirectRepairTask } from './direct-repair'

export interface TaskBrief {
  goal: string
  persona: string
  factor: string
  source: string
  executionTarget: string
  acceptance: string
  /** Legacy fields are retained during migration so saved Brief data is not discarded. */
  audience?: string
  scope?: string
  facts?: string
  deliverables?: string
  constraints?: string
  contentInstruction?: string
  supplementalTopics?: string[]
  webSupplement?: boolean
}
export interface TaskKnowledge {
  id: string
  title: string
  tag: string
  source: string
  status: 'ready' | 'failed'
  content: string
}
export interface TaskVersion {
  version: number
  time: string
  note: string
  brief: TaskBrief
  methods: string[]
  knowledge: TaskKnowledge[]
  output: string
}
export interface IgnoredBrief {
  reason: string
  explanation: string
  actor: string
  time: string
}
export interface IgnoredTask extends IgnoredBrief {
  stage: TaskProgress
  stageLabel: string
}
export interface TaskWorkflow {
  brief: TaskBrief
  briefStatus: 'ready' | 'changes_requested' | 'agent_reworking' | 'confirmed'
  feedback: string
  versions: TaskVersion[]
  knowledge: TaskKnowledge[]
  output: { title: string, body: string, revision: number }
  reviews: Array<{ time: string, actor: string, note: string }>
  ignoredBrief?: IgnoredBrief
  ignoredTask?: IgnoredTask
  site: { requirements: string, attempts: number, simulateFailure: boolean, preview: string, result: string, targetSite?: string, targetPage?: string, changeType?: string, factBoundary?: string, acceptance?: string }
  url: string
}
export type TaskBucket = 'brief' | 'brief_changes' | 'executing' | 'review' | 'website' | 'done' | 'ignored'
export type WorkflowAction = 'save_brief' | 'update_web_supplement' | 'confirm_brief' | 'ignore_brief' | 'ignore_task' | 'request_brief_changes' | 'rework_brief' | 'save_output' | 'request_output_changes' | 'approve_ops' | 'approve_client' | 'submit_site' | 'retry_site' | 'publish' | 'complete_recheck'
export interface WorkflowPayload {
  note?: string
  ignoreReason?: string
  brief?: TaskBrief
  webSupplement?: boolean
  methods?: string[]
  knowledge?: TaskKnowledge[]
  title?: string
  body?: string
  url?: string
  simulateFailure?: boolean
}
export const knowledgeLibrary: TaskKnowledge[] = [
  { id: 'KB-001', title: '企业与品牌基础信息', tag: '品牌事实', source: '演示知识库', status: 'ready', content: '演示资料：企业官方名称、品牌定位和业务范围。正式执行前需替换为已核实的品牌资料。' },
  { id: 'KB-002', title: '产品规格与应用场景', tag: '产品资料', source: '演示知识库', status: 'ready', content: '演示资料：产品参数、应用行业、典型场景与能力边界。不得据此推断未提供的性能数据。' },
  { id: 'KB-003', title: '认证、专利与交付能力', tag: '信任证据', source: '演示知识库', status: 'ready', content: '演示资料：认证、专利、交期与服务网络资料；真实编号和承诺需要客户提供。' },
]
const now = () => new Date().toISOString()
function record(task: GeoTask, actor: string, note: string) {
  ensureWorkflow(task).reviews.push({ time: now(), actor, note })
}
export function ensureWorkflow(task: GeoTask): TaskWorkflow {
  if (task.workflow) {
    if (task.workflow.ignoredBrief && !task.workflow.ignoredTask) {
      task.workflow.ignoredTask = {
        ...task.workflow.ignoredBrief,
        stage: 'brief',
        stageLabel: 'Task Brief 确认',
      }
    }
    const fallbackSource = `${task.source}${task.strategy && task.strategy !== '不经过候选策略' ? ` / ${task.strategy}` : ''}`
    task.workflow.briefStatus ??= task.progress === 'brief' ? 'ready' : 'confirmed'
    task.workflow.site ||= { requirements: '', attempts: 0, simulateFailure: false, preview: '', result: '' }
    task.workflow.versions ||= []
    task.workflow.knowledge ||= []
    const normalizeBrief = (value: TaskBrief) => {
      const brief = value as TaskBrief & Record<string, string | undefined>
      brief.persona ||= brief.audience || task.persona || '不适用'
      brief.factor ||= task.factor || '—'
      brief.source ||= fallbackSource
      brief.executionTarget ||= brief.scope || task.destination || '—'
      brief.goal ||= task.name
      brief.acceptance ||= `覆盖「${task.factor}」，符合已确认的业务事实与执行范围。`
      brief.contentInstruction ||= ''
      brief.supplementalTopics ||= []
      brief.webSupplement ??= true
      return brief
    }
    task.workflow.brief = normalizeBrief(task.workflow.brief)
    task.workflow.versions.forEach((version) => {
      version.brief = normalizeBrief(version.brief)
    })
    const brief = task.workflow.brief
    const legacyFacts = [brief.facts, brief.constraints].filter((value): value is string => !!value?.trim()).join('\n')
    const legacySeedOutput = `演示产物：${task.name}\n\n执行范围：${brief.scope || task.destination}\n执行方法：${task.methods.join('、')}\n验收依据：${brief.acceptance}\n\n本内容仅用于流程演示，发布前请核实品牌事实与资料引用。`
    if (task.workflow.output.body === legacySeedOutput) {
      task.workflow.output.body = `演示产物：${task.name}\n\n任务目标：${brief.goal}\n目标人设：${brief.persona}\n决策因子：${brief.factor}\n来源诊断 / 策略：${brief.source}\n执行对象：${brief.executionTarget}\n\n执行方法：${task.methods.join('、')}\n验收条件：${brief.acceptance}\n\n本内容仅用于流程演示，发布前请核实品牌事实与资料引用。`
    }
    task.workflow.site.targetSite ||= 'APW 水刀切割网站'
    const legacyWebBoundary = '使用客户终审版本；不得扩写未确认的价格、交期、认证和服务承诺'
    if (!task.workflow.site.targetPage || (task.type === 'repair' && task.workflow.site.targetPage === '目标内容页'))
      task.workflow.site.targetPage = task.type === 'repair' ? '相关官网页面 / 全站实体配置' : '目标内容页'
    if (task.type === 'repair') {
      task.workflow.site.changeType = '技术修复'
      if (!task.workflow.site.factBoundary || task.workflow.site.factBoundary === legacyWebBoundary)
        task.workflow.site.factBoundary = '不得改写已确认的企业、认证与产品事实'
    }
    else {
      task.workflow.site.changeType ||= '官网内容新增 / 更新'
      task.workflow.site.factBoundary ||= legacyWebBoundary
    }
    if (legacyFacts && !task.workflow.site.factBoundary.includes(legacyFacts))
      task.workflow.site.factBoundary = `${task.workflow.site.factBoundary}\n${legacyFacts}`
    task.workflow.site.requirements ||= brief.deliverables || ''
    task.workflow.site.acceptance ||= task.workflow.brief.acceptance
    return task.workflow
  }
  const brief: TaskBrief = {
    goal: task.name,
    persona: task.persona || '不适用',
    factor: task.factor || '—',
    source: `${task.source}${task.strategy && task.strategy !== '不经过候选策略' ? ` / ${task.strategy}` : ''}`,
    executionTarget: task.destination,
    acceptance: `覆盖「${task.factor}」，符合已确认的业务事实与执行范围。`,
    contentInstruction: '',
    supplementalTopics: [],
    webSupplement: true,
  }
  task.workflow = {
    brief,
    briefStatus: task.progress === 'brief' ? 'ready' : 'confirmed',
    feedback: '',
    versions: [],
    knowledge: [],
    output: { title: task.name, body: ['human', 'client_review', 'site_submit', 'site_publish', 'done'].includes(task.progress) ? `演示产物：${task.name}\n\n任务目标：${brief.goal}\n目标人设：${brief.persona}\n决策因子：${brief.factor}\n来源诊断 / 策略：${brief.source}\n执行对象：${brief.executionTarget}\n\n执行方法：${task.methods.join('、')}\n验收条件：${brief.acceptance}\n\n本内容仅用于流程演示，发布前请核实品牌事实与资料引用。` : '', revision: 1 },
    reviews: [],
    site: { requirements: '', attempts: 0, simulateFailure: false, preview: '', result: '', targetSite: 'APW 水刀切割网站', targetPage: task.type === 'repair' ? '相关官网页面 / 全站实体配置' : '目标内容页', changeType: task.type === 'repair' ? '技术修复' : '官网内容新增 / 更新', factBoundary: task.type === 'repair' ? '不得改写已确认的企业、认证与产品事实' : '使用客户终审版本；不得扩写未确认的价格、交期、认证和服务承诺', acceptance: brief.acceptance },
    url: '',
  }
  saveVersion(task, '初始 Brief')
  return task.workflow
}
function saveVersion(task: GeoTask, note: string) {
  const flow = ensureWorkflow(task)
  flow.versions.push({ version: flow.versions.length + 1, time: now(), note, brief: { ...flow.brief }, methods: [...task.methods], knowledge: flow.knowledge.map(item => ({ ...item })), output: flow.output.body })
}
export function isStructureOnly(task: GeoTask, methods = task.methods) {
  const text = [task.name, task.factor, task.destination, ...methods].join(' ')
  return task.type !== 'external' && /官网结构优化|网站结构优化|页面结构优化|抓取渲染|爬取障碍|索引|robots|sitemap|canonical|重定向|导航结构|页面层级/i.test(text) && !/结构化数据|schema|sameAs|FAQ|Product|产品|认证|专利|地址|企业信息|品牌|事实|JSON-LD/i.test(text)
}
export function briefGate(
  task: GeoTask,
  contentInstruction = task.workflow?.brief.contentInstruction || '',
  webSupplement = task.workflow?.brief.webSupplement ?? false,
): string[] {
  const errors: string[] = []
  if (!task.methods.some(method => method.trim()))
    errors.push('至少选择 1 个执行方法')
  const flow = task.workflow
  if (!flow || !flow.brief.goal.trim() || !flow.brief.executionTarget.trim() || !flow.brief.acceptance.trim())
    errors.push('填写任务目标、执行对象与验收条件')
  const hasReadyKnowledge = flow?.knowledge.some(item => item.status === 'ready' && item.content.trim()) ?? false
  if (!hasReadyKnowledge && !contentInstruction.trim() && !webSupplement)
    errors.push('选择知识资料、填写补充说明或勾选联网补充')
  return errors
}
export function validPublishUrl(value: string) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
  }
  catch {
    return false
  }
}
export function canEditBrief(task: GeoTask, role: UserRole, mode: ServiceMode) {
  return task.progress === 'brief' && !isTaskIgnored(task) && task.workflow?.briefStatus === 'ready' && role === 'ops' && mode === 'managed'
}
export function canPrepareBrief(task: GeoTask, role: UserRole, mode: ServiceMode) {
  return mode === 'agent'
    ? task.progress === 'brief' && !isTaskIgnored(task) && task.workflow?.briefStatus === 'ready' && role === 'client'
    : canEditBrief(task, role, mode)
}
export function reviewOwner(task: GeoTask, mode: ServiceMode): UserRole {
  if (task.progress === 'client_content_review')
    return 'client'
  return task.progress === 'human' && mode === 'managed' ? 'ops' : 'client'
}
export function ignoreOwner(task: GeoTask, mode: ServiceMode): UserRole | null {
  if (isDirectRepairTask(task)) return null
  if (task.progress === 'done')
    return null
  if (task.progress === 'brief')
    return ['ready', 'changes_requested'].includes(task.workflow?.briefStatus || '') ? (mode === 'managed' ? 'ops' : 'client') : null
  if (['todo', 'running', 'client_content_review', 'client_review', 'site_publish', 'publish'].includes(task.progress))
    return 'client'
  if (task.progress === 'human')
    return reviewOwner(task, mode)
  return mode === 'managed' ? 'ops' : 'client'
}
export function ignoredTaskFor(task: GeoTask): IgnoredTask | undefined {
  const workflow = task.workflow
  if (!workflow)
    return undefined
  return workflow.ignoredTask || (workflow.ignoredBrief
    ? { ...workflow.ignoredBrief, stage: 'brief', stageLabel: 'Task Brief 确认' }
    : undefined)
}
export function isTaskIgnored(task: GeoTask): boolean {
  return Boolean(ignoredTaskFor(task))
}
/** Pure validation: UI visibility never substitutes for action authorization. */
export function validateAction(task: GeoTask, role: UserRole, mode: ServiceMode, action: WorkflowAction, payload: WorkflowPayload = {}): string | null {
  if (isDirectRepairTask(task)) return '官网技术直接处理由 AI 建站自动执行，无需人工操作'
  const stage = task.progress
  const flow = task.workflow
  if (!flow)
    return '任务尚未初始化'
  if (mode === 'agent' && role !== 'client')
    return 'Agent 模式下请使用客户角色'
  const briefEditable = canPrepareBrief(task, role, mode)
  const reviewing = ['client_content_review', 'human', 'client_review'].includes(stage) && reviewOwner(task, mode) === role
  const preparingContent = role === 'client' && ['todo', 'running'].includes(stage)
  const siteOwner = role === (mode === 'managed' ? 'ops' : 'client')
  if (action === 'save_brief') {
    if (!briefEditable || !payload.brief || !payload.methods || !payload.knowledge)
      return '当前角色或阶段不能编辑 Brief'
    if (mode === 'agent') {
      const lockedKeys = new Set([...Object.keys(flow.brief), ...Object.keys(payload.brief)])
      lockedKeys.delete('contentInstruction')
      lockedKeys.delete('webSupplement')
      if ([...lockedKeys].some(key => JSON.stringify(payload.brief![key as keyof TaskBrief]) !== JSON.stringify(flow.brief[key as keyof TaskBrief])) || JSON.stringify(payload.methods) !== JSON.stringify(task.methods))
        return '客户可补充资料与说明，任务目标和专业方法由 AI 生成'
    }
    return null
  }
  if (action === 'update_web_supplement')
    return (reviewing || preparingContent) && typeof payload.webSupplement === 'boolean' ? null : '当前角色或阶段不能调整联网补充设置'
  if (action === 'confirm_brief')
    return !briefEditable ? (mode === 'managed' ? '仅运营可确认待确认的 Brief' : '仅客户可确认待确认的 Brief') : briefGate(task).join('；') || null
  if (action === 'ignore_brief') {
    if (role !== (mode === 'managed' ? 'ops' : 'client'))
      return mode === 'managed' ? '仅运营可忽略待确认的 Brief' : '仅客户可忽略待确认的 Brief'
    if (flow.ignoredBrief)
      return '本次审核事项已忽略'
    if (!briefEditable)
      return '仅运营可忽略待确认的 Brief'
    return !payload.ignoreReason?.trim() ? '请选择忽略原因' : !payload.note?.trim() ? '请填写忽略说明' : null
  }
  if (action === 'ignore_task') {
    if (isTaskIgnored(task))
      return '本次审核事项已忽略'
    if (stage === 'done')
      return '任务已完成，不能再忽略'
    if (ignoreOwner(task, mode) !== role)
      return `仅当前步骤负责人（${ignoreOwner(task, mode) === 'ops' ? '运营' : '客户'}）可忽略当前步骤`
    return !payload.ignoreReason?.trim() ? '请选择忽略原因' : !payload.note?.trim() ? '请填写忽略说明' : null
  }
  if (action === 'request_brief_changes')
    return role !== 'client' || !briefEditable ? '当前阶段仅运营可维护 Brief' : payload.note?.trim() ? null : '请填写调整意见'
  if (action === 'rework_brief')
    return mode === 'managed' && role === 'ops' && stage === 'brief' && flow.briefStatus === 'changes_requested' ? null : '等待运营审核调整意见'
  if (action === 'save_output')
    return !reviewing ? '仅当前审核负责人可编辑产物' : payload.title?.trim() && payload.body?.trim() ? null : '产物标题和正文不能为空'
  if (action === 'request_output_changes')
    return !reviewing ? '当前角色不能要求修改产物' : payload.note?.trim() ? null : '请填写产物修改意见'
  if (action === 'approve_ops')
    return reviewing && role === 'ops' && stage === 'human' && mode === 'managed' ? null : '仅运营可完成当前阶段的专业审核'
  if (action === 'approve_client')
    return reviewing && role === 'client' && flow.output.body.trim() ? null : '请由客户审核完整产物，必要时先完成运营审核'
  if (action === 'submit_site')
    return siteOwner && (stage === 'site_submit' || (mode === 'agent' && task.type === 'repair' && stage === 'human')) && task.type !== 'external' ? null : '仅负责人可提交待提交的官网执行包'
  if (action === 'retry_site')
    return !siteOwner || stage !== 'site_failed' ? '仅负责人可重试失败的官网执行包' : payload.note?.trim() ? null : '请补充调整要求'
  if (action === 'publish') {
    if (role !== 'client' || !['site_publish', 'publish'].includes(stage) || task.type === 'external')
      return '仅客户可确认通过验证的官网发布'
    return !payload.url?.trim() || validPublishUrl(payload.url) ? null : '请输入完整的 http:// 或 https:// 发布 URL'
  }
  if (action === 'complete_recheck')
    return stage === 'recheck' && task.type === 'web' ? null : '当前任务不在官网核验阶段'
  return '不支持此操作'
}
export function applyAction(task: GeoTask, role: UserRole, mode: ServiceMode, action: WorkflowAction, payload: WorkflowPayload = {}): string | null {
  const error = validateAction(task, role, mode, action, payload)
  if (error)
    return error
  const flow = ensureWorkflow(task)
  const actor = role === 'ops' ? '运营' : '客户'
  const note = payload.note?.trim() || ''
  switch (action) {
    case 'save_brief':
      flow.brief = { ...payload.brief! }
      task.methods = [...new Set(payload.methods!.map(value => value.trim()).filter(Boolean))]
      flow.knowledge = payload.knowledge!.map(item => ({ ...item }))
      saveVersion(task, note || '修改 Brief、执行方法或知识资料')
      break
    case 'update_web_supplement':
      flow.brief.webSupplement = payload.webSupplement!
      saveVersion(task, '调整联网补充设置')
      break
    case 'confirm_brief':
      flow.briefStatus = 'confirmed'
      task.progress = task.executionKind === 'verification' ? 'human' : 'todo'
      break
    case 'ignore_brief':
    case 'ignore_task': {
      const ignored = { stage: task.progress, stageLabel: task.progress === 'brief' ? 'Task Brief 确认' : taskStageLabel(task), reason: payload.ignoreReason!.trim(), explanation: note, actor, time: now() }
      flow.ignoredTask = ignored
      if (task.progress === 'brief')
        flow.ignoredBrief = { reason: ignored.reason, explanation: ignored.explanation, actor, time: ignored.time }
      break
    }
    case 'request_brief_changes':
      flow.feedback = note
      flow.briefStatus = mode === 'managed' ? 'changes_requested' : 'agent_reworking'
      break
    case 'rework_brief':
      flow.briefStatus = 'agent_reworking'
      break
    case 'save_output':
      flow.output = { title: payload.title!.trim(), body: payload.body!.trim(), revision: flow.output.revision + 1 }
      saveVersion(task, '人工修改产物')
      break
    case 'request_output_changes':
      flow.feedback = note
      task.progress = 'running'
      break
    case 'approve_ops':
      task.progress = 'client_review'
      break
    case 'approve_client':
      task.progress = mode === 'agent' ? (task.type === 'external' ? 'done' : 'site_submitted') : task.progress === 'client_content_review' ? 'human' : task.type === 'web' || task.type === 'external' ? 'done' : 'site_submit'
      if (mode === 'agent' && task.type !== 'external')
        flow.site.attempts += 1
      flow.site.requirements = `${flow.brief.executionTarget}\n${flow.brief.acceptance}`
      if (task.type === 'web' && task.progress === 'done') {
        flow.site.attempts += 1
        flow.site.result = '本地模拟建站接口返回成功；任务直接进入发布结果终态。真实官网接口尚未接入。'
      }
      break
    case 'submit_site':
    case 'retry_site':
      flow.site.requirements += note ? `\n调整要求：${note}` : ''
      flow.site.simulateFailure = payload.simulateFailure ?? false
      flow.site.attempts += 1
      task.progress = 'site_submitted'
      break
    case 'publish':
      flow.url = payload.url?.trim() || ''
      task.progress = 'recheck'
      break
    case 'complete_recheck':
      task.progress = 'done'
      break
  }
  const labels: Record<WorkflowAction, string> = { save_brief: '保存 Brief 新版本', update_web_supplement: `联网补充已${payload.webSupplement ? '开启' : '关闭'}`, confirm_brief: '确认 Brief，进入本地模拟执行', ignore_brief: '忽略本次审核事项', ignore_task: '忽略本次审核事项', request_brief_changes: '提出 Brief 调整意见', rework_brief: '运营审核意见，交 Agent 重整 Brief', save_output: '保存产物修改', request_output_changes: '要求 Agent 修改产物', approve_ops: '修复专业审核通过，等待客户确认', approve_client: mode === 'agent' && task.type !== 'external' ? '客户确认内容，AI 自动提交官网执行包（本地模拟）' : task.type === 'external' ? '外部内容确认，完成交付；不跟踪外部发布 URL' : task.type === 'web' && task.progress === 'done' ? '客户终审通过，建站接口模拟成功，任务已完成' : '客户终审通过，生成官网执行包', submit_site: '提交 AI 建站执行包（本地模拟）', retry_site: '补充要求并重新提交（本地模拟）', publish: '客户确认发布上线，开始官网 Re-check（演示流程）', complete_recheck: '监测 Agent 完成本次官网核验，任务闭环' }
  record(task, actor, `${labels[action]}${action === 'ignore_brief' || action === 'ignore_task' ? `：${payload.ignoreReason!.trim()}；${note}` : note ? `：${note}` : ''}`)
  return null
}
export function hasAutomaticStep(task: GeoTask, mode: ServiceMode = 'managed') {
  if (isDirectRepairTask(task))
    return task.progress !== 'done'
  if (isTaskIgnored(task))
    return false
  if (task.type === 'repair' && mode === 'managed')
    return false
  return ['todo', 'running', 'site_submit', 'site_submitted', 'site_running', 'site_verifying'].includes(task.progress) || (task.progress === 'brief' && task.workflow?.briefStatus === 'agent_reworking')
}
/** One local demo step, called by a disposable timer. No external requests or publishing. */
export function advanceAutomatic(task: GeoTask, mode: ServiceMode = 'managed') {
  const flow = ensureWorkflow(task)
  if (isDirectRepairTask(task)) {
    if (task.progress === 'done') return false
    flow.ignoredTask = undefined
    flow.ignoredBrief = undefined
    flow.site.attempts = Math.max(1, flow.site.attempts)
    task.progress = task.progress === 'site_running' ? 'done' : 'site_running'
    if (task.progress === 'done')
      flow.site.result = '本地模拟：AI 建站已完成技术修复与验证。'
    record(task, 'AI 建站（模拟）', directRepairStatus(task.progress === 'done'))
    return true
  }
  if (isTaskIgnored(task))
    return false
  if (task.progress === 'brief' && flow.briefStatus === 'agent_reworking') {
    flow.briefStatus = 'ready'
    saveVersion(task, `根据客户意见重整：${flow.feedback}`)
    record(task, 'Agent（模拟）', '新 Brief 已生成，等待客户重新确认')
    return true
  }
  const transitions: Partial<Record<TaskProgress, TaskProgress>> = { todo: 'running', running: mode === 'agent' ? 'client_review' : task.type === 'external' ? 'client_content_review' : 'human', site_submit: 'done', site_submitted: 'site_running', site_running: 'site_verifying', site_verifying: flow.site.simulateFailure ? 'site_failed' : mode === 'agent' ? 'done' : 'site_publish' }
  const next = transitions[task.progress]
  if (!next)
    return false
  const previous = task.progress
  if (task.progress === 'running') {
    flow.output.body = `【本地模拟产物 · ${task.name}】\n\n任务目标：${flow.brief.goal}\n目标人设：${flow.brief.persona}\n决策因子：${flow.brief.factor}\n来源诊断 / 策略：${flow.brief.source}\n执行对象：${flow.brief.executionTarget}\n\n执行方法：${task.methods.join('、')}\n\n知识库依据：\n${flow.knowledge.map(item => `${item.title}：${item.content}`).join('\n') || flow.brief.facts || '本任务未关联知识库资料。'}\n\n验收条件：${flow.brief.acceptance}${flow.brief.constraints ? `\n执行约束：${flow.brief.constraints}` : ''}${flow.feedback ? `\n本次修改：${flow.feedback}` : ''}\n\n此为演示产物，真实内容生成和事实验证服务尚未接入。`
    flow.output.revision += 1
    saveVersion(task, 'Agent 模拟生成产物与自动检查')
  }
  if (task.progress === 'site_running')
    flow.site.preview = `PREVIEW-${task.id}-V${flow.site.attempts || 1}`
  if (task.progress === 'site_verifying')
    flow.site.result = flow.site.simulateFailure ? '模拟验证失败：执行结果与验收条件存在差异，请补充要求后重新提交。' : '模拟验证通过：变更范围、内容一致性与机器可读结果符合本次执行包。'
  if (previous === 'site_submit') {
    flow.site.attempts += 1
    flow.site.result = '本地模拟建站接口返回成功；任务直接进入发布结果终态。真实官网接口尚未接入。'
  }
  task.progress = next
  record(task, '系统（模拟）', previous === 'site_submit' ? '建站接口模拟成功，任务直接进入发布结果终态；未访问或修改真实网站。' : next === 'done' ? '本地模拟 Re-check 完成；未访问或修改真实网站，生产验证待接入。' : `自动进入：${taskStageLabel(task)}`)
  return true
}
export function getTaskBucket(task: GeoTask): TaskBucket {
  if (isDirectRepairTask(task))
    return task.progress === 'done' ? 'done' : 'executing'
  if (isTaskIgnored(task))
    return 'ignored'
  if (task.progress === 'done')
    return 'done'
  if (task.progress === 'brief')
    return ['changes_requested', 'agent_reworking'].includes(task.workflow?.briefStatus || '') ? 'brief_changes' : 'brief'
  if (['todo', 'running'].includes(task.progress))
    return 'executing'
  if (['client_content_review', 'human', 'client_review'].includes(task.progress))
    return 'review'
  return 'website'
}
export function taskStageLabel(task: GeoTask, mode: ServiceMode = 'managed'): string {
  if (task.executionKind === 'verification') return task.progress === 'brief' ? '核查 Brief 待确认' : task.progress === 'done' ? '核查已完成' : '待客户核查'
  if (isDirectRepairTask(task))
    return directRepairStatus(task.progress === 'done')
  if (isTaskIgnored(task))
    return '已忽略'
  if (task.progress === 'brief')
    return task.workflow?.briefStatus === 'agent_reworking' ? 'Agent 重整 Brief' : task.workflow?.briefStatus === 'changes_requested' ? 'Brief 待调整' : 'Brief 待确认'
  const labels: Record<Exclude<TaskProgress, 'brief'>, string> = { todo: '等待 Agent 执行', running: 'Agent 生成与自动质检', client_content_review: '客户确认文案', human: task.type === 'repair' ? '修复结果确认' : '运营专业审核', client_review: '客户终审', publish: '发布确认', site_submit: '待提交 AI 建站', site_submitted: 'AI 建站审核中', site_running: task.type === 'repair' ? '等待官网处理结果' : 'AI 建站执行中', site_returned: '官网已返回处理结果', site_verifying: 'GEO 验证中', site_publish: '发布门禁确认', site_failed: 'GEO 验证未通过', recheck: 'Re-check 中', done: '任务已完成' }
  return mode === 'agent' && ['human', 'client_content_review', 'client_review'].includes(task.progress) ? (task.type === 'repair' ? '待客户确认修复' : '待客户审核') : labels[task.progress]
}
export function collaborationLabel(task: GeoTask, mode: ServiceMode = 'managed'): string {
  if (isDirectRepairTask(task))
    return directRepairStatus(task.progress === 'done')
  if (isTaskIgnored(task))
    return '已忽略'
  if (task.progress === 'done')
    return '完成'
  if (hasAutomaticStep(task))
    return 'Agent 处理中'
  if (task.progress === 'site_failed')
    return '验证未通过'
  if (mode === 'managed' && ((task.progress === 'brief' && task.workflow?.briefStatus === 'changes_requested') || (task.progress === 'human' && task.type === 'repair') || task.progress === 'site_submit'))
    return '运营审核'
  return '待用户审核'
}
