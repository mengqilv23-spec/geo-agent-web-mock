<script setup lang="ts">
import type { GeoTask, ServiceMode, UserRole } from '../../data/geo-data'
import type { TaskBrief, TaskKnowledge, WorkflowAction, WorkflowPayload } from '../../workflows/task-workflow'
import type { DropdownSelectOption } from '../ui/ce/dropdown-select/types'
import type { KnowledgeUploadDraft } from './KnowledgeUploadDrawer.vue'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useGeoWorkbenchRouteContext } from '../../composables/workbench-route-context'
import { createRepairTask } from '../../services/geo-orchestration'
import { directRepairStatus, isDirectRepairTask } from '../../workflows/direct-repair'
import { taskFlowFor } from '../../workflows/task-flow'
import { advanceAutomatic, applyAction, briefGate, canPrepareBrief, ensureWorkflow, getTaskBucket, hasAutomaticStep, ignoredTaskFor, ignoreOwner, isTaskIgnored, knowledgeLibrary, reviewOwner, taskStageLabel } from '../../workflows/task-workflow'
import Button from '../ui/ce/button/Button.vue'
import Drawer from '../ui/ce/drawer/Drawer.vue'
import DropdownSelect from '../ui/ce/dropdown-select/DropdownSelect.vue'
import Tag from '../ui/ce/tag/Tag.vue'
import Toast from '../ui/ce/toast/Toast.vue'
import AppIcon from '../ui/icons/AppIcon.vue'
import KnowledgeUploadDrawer from './KnowledgeUploadDrawer.vue'
import TaskPermissionsDrawer from './TaskPermissionsDrawer.vue'
import TaskProgressTimeline from './TaskProgressTimeline.vue'
import TaskRepairDetail from './TaskRepairDetail.vue'
import TaskReviewInsights from './TaskReviewInsights.vue'
import TaskRichTextEditor from './TaskRichTextEditor.vue'
import TaskSiteCollaboration from './TaskSiteCollaboration.vue'

const props = defineProps<{ task: GeoTask, role: UserRole, serviceMode: ServiceMode, clientPreview: boolean }>()
const emit = defineEmits<{ back: [], change: [], setTestRole: [role: UserRole] }>()
const routeContext = useGeoWorkbenchRouteContext()
function completeVerification() {
  const task = props.task
  if (task.progress !== 'human' || !draft.body.trim() || !task.verificationOutcome) return
  const parent = routeContext.strategies.find(strategy => strategy.id === task.strategy)
  if (!parent) { error.value = '未找到关联策略，请先核对任务来源'; return }
  const outcome = task.verificationOutcome
  flow.value.output.body = draft.body
  if (outcome === 'business-gap') {
    parent.businessGapRecorded = true
    parent.reviewNote = draft.body
    parent.gapFacts = { verified: true, capability: false, contentExists: false, clear: true, readable: true, thirdParty: false }
  }
  else if (outcome === 'technical') {
    const id = `GAP-TECH-${parent.id}`
    let finding = routeContext.findings.find(item => item.id === id)
    if (!finding) {
      finding = { id, title: `读取修复：${parent.title}`, detail: draft.body, check: '抓取渲染', method: '读取障碍修复', priority: parent.priority, status: '待处理', checked: false, route: 'repair', routeReason: '原因核查确认存在技术读取障碍，进入直接处理。' }
      routeContext.findings.push(finding)
    }
    const repair = createRepairTask(routeContext.tasks, finding)
    if (!repair.relatedStrategies.includes(parent.id)) repair.relatedStrategies.push(parent.id)
    task.verificationFollowupId = repair.id
  }
  else {
    const id = `${parent.id}-CHECK-${task.id}`
    if (!routeContext.strategies.some(strategy => strategy.id === id)) routeContext.strategies.push({
      ...parent, id, title: `${outcome === 'external' ? '第三方内容建设' : outcome === 'add-content' ? '补充官网内容' : '修改官网内容'}：${parent.title}`,
      confirmed: false, ignored: false, businessGapRecorded: false, reviewNote: undefined,
      layer: outcome === 'external' ? '外部信源' : '内容', description: draft.body,
      evidence: `${parent.evidence}；核查记录 ${task.id}：${draft.body}`,
      methods: [outcome === 'external' ? '第三方内容建设' : outcome === 'add-content' ? '补充官网内容' : '修改官网内容'],
      gapFacts: { verified: true, capability: true, contentExists: outcome !== 'add-content', clear: outcome !== 'edit-content', readable: true, thirdParty: outcome === 'external' },
    })
    task.verificationFollowupId = id
  }
  flow.value.reviews.push({ time: new Date().toISOString(), actor: '客户', note: `核查完成：${draft.body}` })
  task.progress = 'done'
  emit('change')
}
function openVerificationFollowup() {
  const id = props.task.verificationFollowupId
  const task = routeContext.tasks.find(task => task.id === id)
  if (task) routeContext.openTask(task)
  else {
    const strategy = routeContext.strategies.find(strategy => strategy.id === id)
    if (strategy) { void routeContext.navigate('diagnosis'); routeContext.openStrategy(strategy) }
  }
}
const tab = shallowRef('brief')
const drawer = shallowRef<'brief' | 'knowledge' | 'upload' | 'output' | 'feedback' | 'retry' | 'ignore' | null>(null)
const error = shallowRef('')
const message = shallowRef('')
const publishPromptDismissed = shallowRef(false)
const ignoredReason = shallowRef('')
const ignoredExplanation = shallowRef('')
const note = shallowRef('')
const simulateFailure = shallowRef(false)
const customMethod = shallowRef('')
const permissionDrawerOpen = shallowRef(false)
const validationToastOpen = shallowRef(false)
const validationToastMessage = shallowRef('')
const validationToastMessageId = shallowRef(0)
const directInstruction = shallowRef('')
const webSupplement = shallowRef(false)
const draft = reactive<{ brief: TaskBrief, methods: string[], knowledge: TaskKnowledge[], title: string, body: string }>({ brief: {} as TaskBrief, methods: [], knowledge: [], title: '', body: '' })
const aiCallsRemaining = shallowRef(2)
function aiQuotaStorageKey(taskId: string, role: UserRole) {
  return `geo-task-ai-quota:${taskId}:${role}${props.serviceMode === 'agent' ? ':agent' : ''}`
}
function refreshAiQuota(taskId: string, role: UserRole) {
  try {
    const raw = window.localStorage.getItem(aiQuotaStorageKey(taskId, role))
    const stored = raw === null ? Number.NaN : Number(raw)
    aiCallsRemaining.value = Number.isInteger(stored) ? Math.max(0, Math.min(2, stored)) : 2
  }
  catch {
    aiCallsRemaining.value = 2
  }
}
function consumeAiCall() {
  if (aiCallsRemaining.value <= 0)
    return
  aiCallsRemaining.value -= 1
  try {
    window.localStorage.setItem(aiQuotaStorageKey(props.task.id, props.role), String(aiCallsRemaining.value))
  }
  catch {
    // Keep the quota for the current view even when browser storage is unavailable.
  }
}
const briefFields: Array<{ key: 'goal' | 'persona' | 'factor' | 'executionTarget', label: string }> = [{ key: 'goal', label: '任务目标' }, { key: 'persona', label: '目标人设' }, { key: 'factor', label: '决策因子' }, { key: 'executionTarget', label: '执行对象' }]
const auditContent = computed(() => props.task.sourceKind === 'geo-audit-content' ? props.task.auditContent : undefined)
const methodOptions = ['对比表', 'FAQ / Q&A', '统计数据注入', '专家观点', '案例证明', '定义框', 'JSON-LD', 'sameAs', '内容表达优化']
const ignoreReasonOptions: DropdownSelectOption[] = [
  { value: 'Agent 判断错误 / 策略不适用', label: 'Agent 判断错误 / 策略不适用' },
  { value: '事实 / 证据不足', label: '事实 / 证据不足' },
  { value: '重复策略 / 已有其他方案', label: '重复策略 / 已有其他方案' },
  { value: '时机不合适', label: '时机不合适' },
  { value: '执行成本过高', label: '执行成本过高' },
  { value: '不符合当前业务目标', label: '不符合当前业务目标' },
  { value: '其他', label: '其他' },
]
const supplementTopics = computed(() => /代理|服务|本地/.test(`${props.task.name} ${props.task.factor}`)
  ? ['交期与产能', '服务范围', 'SLA', '业务限制']
  : /交付|交期|产能/.test(`${props.task.name} ${props.task.factor}`)
    ? ['交期与产能', '产能规划', 'SLA', '业务限制']
    : ['常见问题', '标准答案', '限制条件'])
watch(() => props.task, (task) => {
  ensureWorkflow(task)
  tab.value = task.progress === 'brief' ? 'brief' : task.type === 'repair' ? 'website' : 'output'
  drawer.value = null
  error.value = ''
  message.value = ''
  publishPromptDismissed.value = false
  ignoredReason.value = ''
  ignoredExplanation.value = ''
  directInstruction.value = task.workflow?.brief.contentInstruction || ''
  webSupplement.value = task.workflow?.brief.webSupplement ?? true
  draft.title = task.workflow?.output.title || ''
  draft.body = task.workflow?.output.body || ''
}, { immediate: true })
watch(() => [props.task.id, props.role, props.serviceMode] as const, ([taskId, role]) => refreshAiQuota(taskId, role), { immediate: true })
const flow = computed(() => props.task.workflow!)
watch(() => props.task.progress, (progress, previous) => {
  if (previous === 'brief' && progress !== 'brief' && props.task.type !== 'repair')
    tab.value = 'output'
})
watch(() => props.task.workflow?.output.body, (body, previous) => {
  if (draft.body === previous || !draft.body)
    draft.body = body || ''
})
watch(() => props.task.workflow?.output.title, (title, previous) => {
  if (draft.title === previous || !draft.title)
    draft.title = title || ''
})

const ignoredTask = computed(() => ignoredTaskFor(props.task))
const canIgnoreCurrentStep = computed(() => ignoreOwner(props.task, props.serviceMode) === props.role)
const waitingForOperationsReview = computed(() => props.role === 'client' && props.task.progress === 'human' && reviewOwner(props.task, props.serviceMode) === 'ops' && !ignoredTask.value)
const operationsWaitingForClientReview = computed(() => props.serviceMode === 'managed' && props.role === 'ops' && props.task.progress === 'client_review')
const customerFinalReview = computed(() => props.role === 'client' && props.task.progress === 'client_review')
const flowSteps = computed(() => taskFlowFor(props.task, props.serviceMode))
const isContentPreparation = computed(() => ['todo', 'running', 'client_content_review', 'human', 'client_review'].includes(props.task.progress))
const siteStatus = computed(() => {
  if (isDirectRepairTask(props.task))
    return { label: directRepairStatus(props.task.progress === 'done'), tone: props.task.progress === 'done' ? 'green' as const : 'blue' as const }
  if (props.task.type === 'repair') {
    if (props.task.progress === 'site_failed')
      return { label: '官网已返回处理结果', tone: 'red' as const }
    if (['site_returned', 'site_verifying', 'site_publish', 'recheck', 'done'].includes(props.task.progress))
      return { label: '官网已返回处理结果', tone: 'green' as const }
    if (['site_submitted', 'site_running'].includes(props.task.progress))
      return { label: '等待官网处理结果', tone: 'blue' as const }
  }
  if (props.task.progress === 'brief')
    return { label: '尚未进入 AI 建站协同', tone: 'neutral' as const }
  if (props.task.progress === 'site_failed')
    return { label: '验证未通过', tone: 'red' as const }
  if (props.task.progress === 'site_publish')
    return { label: 'GEO 验证通过 · 待发布', tone: 'green' as const }
  if (props.task.progress === 'done')
    return { label: '任务已完成', tone: 'green' as const }
  if (['publish', 'recheck', 'done'].includes(props.task.progress))
    return { label: '已上线 · Re-check 中', tone: 'green' as const }
  if (props.task.progress === 'site_verifying')
    return { label: 'GEO 验证中', tone: 'blue' as const }
  if (['site_submitted', 'site_running'].includes(props.task.progress))
    return { label: 'AI 建站执行中', tone: 'blue' as const }
  return { label: taskStageLabel(props.task, props.serviceMode), tone: 'blue' as const }
})
const taskContextLabel = computed(() => {
  const strategy = props.task.strategy === '不经过候选策略' ? '未经过 GS 审核' : props.task.strategy
  return props.task.type === 'repair'
    ? `${props.task.destination} · ${strategy}`
    : `${props.task.destination} · ${props.task.source} · ${strategy}`
})
const briefTaskNumber = computed(() => Number(props.task.id.match(/(\d{2})$/)?.[1]) || props.task.methods.length)
const taskSubtitle = computed(() => props.task.progress === 'brief' && props.task.type !== 'repair'
  ? props.task.source
  : `${props.task.id}${props.task.type === 'repair' ? ' · 官网技术修复' : ''}`)
const editableBrief = computed(() => canPrepareBrief(props.task, props.role, props.serviceMode))
const reviewing = computed(() => ['client_content_review', 'human', 'client_review'].includes(props.task.progress) && reviewOwner(props.task, props.serviceMode) === props.role && !(props.serviceMode === 'agent' && props.role === 'ops'))
const contentReviewVisible = computed(() => ['todo', 'running', 'client_content_review', 'human', 'client_review'].includes(props.task.progress))
const operationsContentReview = computed(() => props.task.progress === 'human' && props.role === 'ops')
const canEditWebSupplement = computed(() => editableBrief.value || reviewing.value || (props.role === 'client' && ['todo', 'running'].includes(props.task.progress)))
const outputDirty = computed(() => draft.title !== flow.value.output.title || draft.body !== flow.value.output.body)
const siteOwner = computed(() => props.role === (props.serviceMode === 'managed' ? 'ops' : 'client'))
const gate = computed(() => briefGate(props.task, directInstruction.value, webSupplement.value))
const automatic = computed(() => hasAutomaticStep(props.task, props.serviceMode))
const tabs = computed(() => [
  { key: 'output', label: props.task.type === 'repair' ? '修复结果' : ['site_submit', 'site_submitted', 'site_running', 'site_verifying', 'site_failed', 'site_publish', 'publish', 'recheck', 'done'].includes(props.task.progress) ? '最终稿' : '生成内容' },
  { key: 'brief', label: 'Brief' },
  ...(props.task.type !== 'external' && (props.task.type === 'repair' || getTaskBucket(props.task) === 'website' || (props.serviceMode === 'agent' && !!flow.value.site.result)) ? [{ key: 'website', label: props.task.type === 'repair' ? '官网回传' : '执行与验证' }] : []),
  { key: 'versions', label: '版本 / Diff' },
  { key: 'records', label: '审核记录' },
].filter(item => props.task.progress !== 'brief' || item.key !== 'output'))
const knowledgeOptions = computed(() => [...knowledgeLibrary, ...flow.value.knowledge.filter(item => !knowledgeLibrary.some(known => known.id === item.id))])
const waitingFor = computed(() => {
  if (ignoredTask.value)
    return '本次审核事项已忽略，不会进入后续执行；来源诊断记录仍保留。'
  if (props.task.type === 'repair' && props.task.progress === 'site_running')
    return '技术修复已提交官网，等待官网返回处理结果；状态以官网服务回传为准。'
  if (automatic.value)
    return '本地模拟正在自动执行，无需人工推进。离开详情将暂停，重新进入后继续。'
  if (props.task.progress === 'done' && props.serviceMode === 'agent' && props.task.type !== 'external')
    return ''
  if (props.task.progress === 'done')
    return props.task.type === 'external' ? '外部成稿已完成交付，不跟踪外部发布 URL。' : '任务已形成闭环，可从来源策略查看效果回流。'
  if (props.task.progress === 'brief')
    return flow.value.briefStatus === 'changes_requested' ? '等待运营审核客户意见，再由 Agent 重整 Brief。' : '运营确认 Brief 后才启动执行；客户可查看任务目标与执行范围。'
  if (props.task.progress === 'client_content_review')
    return '请确认文案结果；需要修改时直接点击正文编辑，保存后再确认。'
  if (['human', 'client_review'].includes(props.task.progress))
    return reviewOwner(props.task, props.serviceMode) === 'ops' ? '等待运营完成修复专业审核，再交客户确认。' : '等待客户确认产物、业务事实与交付范围。'
  if (props.task.progress === 'site_publish')
    return props.role === 'ops' ? '验证已通过，等待客户确认发布上线。' : 'AI 建站修改与 GEO 验证均已通过，请确认发布上线。'
  if (props.task.progress === 'recheck')
    return '发布/交付已完成，正在等待新的监测轮次进行官网核验。'
  return ['publish'].includes(props.task.progress) ? '客户确认发布门禁，开始官网复测。' : `等待${props.serviceMode === 'managed' ? '运营' : '客户'}检查并提交 AI 建站执行包。`
})
const actionbarTitle = computed(() => {
  if (ignoredTask.value)
    return '本次审核事项已忽略'
  if (props.task.progress === 'site_submit')
    return '现在需要运营'
  if (props.task.progress === 'site_publish')
    return '现在需要客户'
  if (props.task.progress === 'recheck')
    return '现在需要监测 Agent'
  if (props.task.progress === 'done')
    return '本任务已完成'
  return taskStageLabel(props.task, props.serviceMode)
})
const actionbarDescription = computed(() => {
  if (ignoredTask.value)
    return `已忽略「${ignoredTask.value.stageLabel}」：${ignoredTask.value.reason}。本任务不再进入后续执行。`
  if (customerFinalReview.value)
    return '请确认文案结果；需要修改时直接点击正文编辑，保存后再确认。'
  if (operationsWaitingForClientReview.value)
    return '运营已审核通过，当前等待客户查看最新保存版本并确认最终稿。'
  if (operationsContentReview.value)
    return '请检查并修改内容；保存的版本会交接给客户。审核通过后，客户才能确认最终稿。'
  if (props.task.progress === 'client_content_review')
    return '请确认文案结果；需要修改时直接点击正文编辑，保存后再确认。'
  if (props.task.progress === 'site_submit')
    return props.role === 'ops' ? '执行包已经准备完成，请提交 AI 建站开始网站修改。' : '执行包已准备完成，等待运营提交 AI 建站开始网站修改。'
  if (props.task.progress === 'site_publish')
    return props.role === 'ops' ? '验证已通过，等待客户确认发布上线。' : 'AI 建站修改与 GEO 验证均已通过，请确认发布上线。'
  if (props.task.progress === 'recheck')
    return '发布/交付已完成，正在等待新的监测轮次进行官网核验。'
  if (props.task.progress === 'done' && props.serviceMode === 'agent' && props.task.type !== 'external')
    return '官网执行与验证模拟已完成，可查看处理结果。'
  if (props.task.progress === 'done')
    return '任务已形成闭环，可从来源策略查看效果回流。'
  return waitingFor.value
})
watch(() => [props.task, props.task.progress, props.task.workflow?.briefStatus, props.serviceMode] as const, ([task], _, onCleanup) => {
  if (isDirectRepairTask(task) || !hasAutomaticStep(task, props.serviceMode))
    return
  const timer = setTimeout(() => {
    if (advanceAutomatic(task, props.serviceMode))
      emit('change')
  }, 1600)
  onCleanup(() => clearTimeout(timer))
}, { immediate: true })

function act(action: WorkflowAction, payload: WorkflowPayload = {}) {
  const result = applyAction(props.task, props.role, props.serviceMode, action, payload)
  error.value = result || ''
  if (result)
    return false
  message.value = flow.value.reviews.at(-1)?.note || '已保存'
  drawer.value = null
  emit('change')
  return true
}
function closeDrawer() {
  drawer.value = null
  error.value = ''
  ignoredReason.value = ''
  ignoredExplanation.value = ''
}
function ignoreCurrentTask() {
  if (act('ignore_task', { ignoreReason: ignoredReason.value, note: ignoredExplanation.value })) {
    ignoredReason.value = ''
    ignoredExplanation.value = ''
  }
}
function confirmTask() {
  if (!editableBrief.value) {
    error.value = '当前角色不能确认待确认的 Brief。'
    return
  }
  if (!editableBrief.value) {
    error.value = '当前阶段不能确认任务。'
    return
  }
  if (gate.value.length) {
    if (gate.value.includes('选择知识资料、填写补充说明或勾选联网补充')) {
      validationToastMessage.value = '请选择知识资料、填写补充说明或勾选联网补充'
      validationToastMessageId.value += 1
      validationToastOpen.value = true
      return
    }
    openEditor('brief')
    return
  }
  const saved = act('save_brief', {
    brief: {
      ...flow.value.brief,
      contentInstruction: directInstruction.value,
      webSupplement: webSupplement.value,
    },
    methods: [...props.task.methods],
    knowledge: flow.value.knowledge.map(item => ({ ...item })),
  })
  if (saved && act('confirm_brief'))
    message.value = ''
}
function saveWebSupplementSetting() {
  if (editableBrief.value)
    return
  if (!act('update_web_supplement', { webSupplement: webSupplement.value }))
    webSupplement.value = flow.value.brief.webSupplement ?? true
}
function openKnowledgeUpload() {
  error.value = ''
  message.value = ''
  drawer.value = 'upload'
}
function handleUploadSubmitted(upload: KnowledgeUploadDraft) {
  message.value = `已登记「${upload.name}」的上传流程（本地演示）；请前往 AI 建站知识库上传并解析，再回到“调整已有资料”刷新选择。`
}
function openEditor(kind: Exclude<NonNullable<typeof drawer.value>, 'upload'>) {
  error.value = ''
  note.value = ''
  draft.brief = { ...flow.value.brief }
  draft.methods = [...props.task.methods]
  draft.knowledge = flow.value.knowledge.map(item => ({ ...item }))
  draft.title = flow.value.output.title
  draft.body = flow.value.output.body
  drawer.value = kind
}
function toggleMethod(method: string) {
  draft.methods = draft.methods.includes(method) ? draft.methods.filter(item => item !== method) : [...draft.methods, method]
}
function addMethod() {
  const value = customMethod.value.trim()
  if (value && !draft.methods.includes(value))
    draft.methods.push(value)
  customMethod.value = ''
}
function toggleKnowledge(item: TaskKnowledge) {
  draft.knowledge = draft.knowledge.some(known => known.id === item.id) ? draft.knowledge.filter(known => known.id !== item.id) : [...draft.knowledge, { ...item }]
}
function saveDrawer() {
  if (drawer.value === 'brief' || drawer.value === 'knowledge') {
    act('save_brief', { brief: draft.brief, methods: draft.methods, knowledge: draft.knowledge })
  }
  else if (drawer.value === 'output') {
    act('save_output', { title: draft.title, body: draft.body })
  }
  else if (drawer.value === 'retry') {
    act('retry_site', { note: note.value, simulateFailure: simulateFailure.value })
  }
  else {
    act(props.task.progress === 'brief' ? 'request_brief_changes' : 'request_output_changes', { note: note.value })
  }
}
function saveInlineOutput() {
  if (!outputDirty.value)
    return true
  return act('save_output', { title: draft.title, body: draft.body })
}
function submitOutputFeedback() {
  if (!saveInlineOutput()) return
  openEditor('feedback')
}
function approveReview() {
  if (!saveInlineOutput()) return
  act(props.role === 'ops' ? 'approve_ops' : 'approve_client')
}
function versionDiff(index: number) {
  const current = flow.value.versions[index]
  const previous = flow.value.versions[index - 1]
  if (!current || !previous)
    return '初始执行基线'
  const changes = briefFields.filter(field => current.brief[field.key] !== previous.brief[field.key]).map(field => field.label)
  if (current.methods.join('|') !== previous.methods.join('|'))
    changes.push('执行方法')
  if (JSON.stringify(current.knowledge) !== JSON.stringify(previous.knowledge))
    changes.push('知识资料')
  if (current.output !== previous.output)
    changes.push('产物正文')
  return changes.length ? `变更字段：${changes.join('、')}` : '执行基线未发生变化'
}
</script>

<template>
  <main class="task-workspace" :class="{ 'is-brief': task.progress === 'brief', 'is-repair': task.type === 'repair' }">
    <div class="tw-task-detail" :class="{ 'is-brief': task.progress === 'brief' }">
      <section class="tw-overview" aria-label="任务信息">
        <div class="tw-topline">
          <Button class="tw-back-button" variant="text" @click="emit('back')">
            <AppIcon name="arrowLeft" :size="14" aria-hidden="true" /> 返回优化中心
          </Button>
        </div>
        <header class="tw-header">
          <div class="tw-title-block">
            <div class="tw-title-line">
              <h1>{{ task.name }}</h1>
              <template v-if="task.type === 'repair'">
                <Tag :tone="siteStatus.tone" size="sm">
                  {{ siteStatus.label }}
                </Tag>
              </template>
              <template v-else>
                <span class="tw-count-badge" :aria-label="task.progress === 'brief' ? `任务序号 ${briefTaskNumber}` : `${task.methods.length} 项执行方法`">
                  {{ task.progress === 'brief' ? briefTaskNumber : task.methods.length }}
                </span>
                <Tag v-if="task.progress !== 'brief'" tone="blue" size="sm">
                  {{ taskContextLabel }}
                </Tag>
              </template>
            </div>
            <p class="tw-task-id">
              {{ taskSubtitle }}
            </p>
          </div>
          <div class="tw-header-actions">
            <div v-if="task.type !== 'repair' && serviceMode === 'managed'" class="tw-role-test" data-test="workflow-role-switch">
              <span class="tw-role-test__label">流程测试</span>
              <div class="tw-role-test__options" role="group" aria-label="切换测试角色">
                <Button
                  variant="secondary"
                  :aria-pressed="role === 'ops'"
                  data-test="workflow-role-ops"
                  @click="emit('setTestRole', 'ops')"
                >
                  运营
                </Button>
                <Button
                  variant="secondary"
                  :aria-pressed="role === 'client'"
                  data-test="workflow-role-client"
                  @click="emit('setTestRole', 'client')"
                >
                  客户
                </Button>
              </div>
            </div>
            <Button v-if="task.type !== 'repair'" class="tw-permission-help" variant="secondary" data-test="open-permissions" @click="permissionDrawerOpen = true">
              权限说明
            </Button>
          </div>
        </header>
        <TaskProgressTimeline :steps="flowSteps" :title="task.type === 'repair' ? undefined : task.type === 'external' ? '外部内容执行流程' : '官网任务执行流程'">
          <template v-if="task.type !== 'repair'" #action>
            <Button variant="text" data-test="open-full-flow" @click="routeContext.openFlow('optimization')">
              查看完整流程与角色分工 <AppIcon name="arrowRight" :size="14" aria-hidden="true" />
            </Button>
          </template>
        </TaskProgressTimeline>
      </section>
      <section class="tw-content-panel" aria-label="任务执行内容">
        <section v-if="task.executionKind === 'verification' && task.progress !== 'brief'" class="tw-card">
          <h2>原因核查</h2><p>核对原始回答、真实业务能力与现有资料，形成核查结论；此任务不生成文章或提交官网。</p>
          <label class="tw-field">核查结果<select v-model="task.verificationOutcome" :disabled="task.progress === 'done'">
            <option disabled :value="undefined">请选择已核实的原因</option>
            <option value="add-content">有能力，官网未介绍</option><option value="edit-content">已有介绍，表达不明确</option><option value="technical">内容完整，存在读取障碍</option><option value="external">需要补充第三方来源</option><option value="business-gap">实际不具备该能力</option>
          </select></label>
          <label class="tw-field">核查记录<textarea v-model="draft.body" :readonly="task.progress === 'done'" rows="7" placeholder="记录核查资料、发现的原因和后续处理建议" /></label>
          <Button :disabled="!draft.body.trim() || !task.verificationOutcome || task.progress === 'done'" @click="completeVerification">保存核查结论并完成</Button>
          <p v-if="task.progress === 'done'">核查已完成。内容类结论已进入后续策略审核；技术问题进入直接处理；业务能力缺口仅记录。</p>
          <Button v-if="task.verificationFollowupId" @click="openVerificationFollowup">查看后续处理</Button>
        </section>
        <p v-if="task.executionKind !== 'verification' && automatic && serviceMode === 'agent' && task.type !== 'repair'" class="tw-card" role="status">AI 正在处理，请稍候…</p>
        <template v-if="task.type === 'repair'">
          <TaskRepairDetail :task="task" :site="flow.site" :status-label="siteStatus.label" :status-tone="siteStatus.tone" />
          <section v-if="serviceMode === 'agent' && !isDirectRepairTask(task)" class="tw-card" aria-label="修复操作">
            <p v-if="error" class="tw-error" role="alert">{{ error }}</p>
            <p v-if="ignoredTask">本次修复已忽略，原因和说明已保存。</p>
            <div v-else-if="task.progress === 'human'" class="tw-actions">
              <Button variant="secondary" @click="drawer = 'ignore'">忽略</Button>
              <Button data-test="confirm-repair" @click="act('submit_site')">确认修复并提交官网</Button>
            </div>
            <div v-else-if="task.progress === 'site_failed'" class="tw-actions">
              <Button variant="secondary" @click="drawer = 'ignore'">忽略</Button>
              <Button data-test="retry-repair" @click="openEditor('retry')">补充要求并重试</Button>
            </div>
            <p v-else-if="automatic" role="status">AI 正在执行修复与验证（本地模拟）…</p>
            <p v-else-if="task.progress === 'done'" role="status">修复执行与验证模拟已完成。</p>
          </section>
        </template>
        <template v-else-if="task.executionKind !== 'verification' || task.progress === 'brief'">
          <TaskSiteCollaboration v-if="tab === 'website'" :task="task" :brief="flow.brief" :site="flow.site" :methods="task.methods" :status-label="siteStatus.label" :status-tone="siteStatus.tone" />
          <div class="tw-more-details" :class="{ 'tw-brief-workspace': task.progress === 'brief' }">
            <header v-if="task.progress === 'brief'" class="tw-brief-workspace__head">
              <h2>Task Brief 确认</h2>
              <Tag tone="blue" size="sm">
                V{{ flow.output.revision }}
              </Tag>
            </header>
            <header v-if="isContentPreparation && task.progress !== 'brief'" class="tw-workspace-head">
              <h2>内容审核工作区</h2>
              <Tag tone="blue" size="sm">
                V{{ flow.output.revision }}
              </Tag>
            </header>
            <nav class="tw-tabs" :class="{ 'tw-tabs--workspace': task.progress !== 'brief' }" aria-label="任务详情">
              <button v-for="item in tabs" :key="item.key" :data-guide-task-tab="item.key" type="button" :aria-current="tab === item.key ? 'page' : undefined" :class="{ active: tab === item.key }" @click="tab = item.key">
                {{ item.label }}
              </button>
            </nav>
            <section v-if="tab === 'brief'" class="tw-card" :class="{ 'tw-card--brief': task.progress === 'brief' }">
              <div v-if="task.progress !== 'brief'" class="tw-section-head">
                <div><h2>Task Brief</h2><p>明确执行范围、品牌事实与交付标准，确认后作为任务执行基线。</p></div><Button v-if="editableBrief && serviceMode === 'managed'" variant="secondary" @click="openEditor('brief')">
                  编辑 Brief
                </Button>
              </div>
              <div class="tw-brief-layout" :class="{ 'is-initial': task.progress === 'brief' }">
                <section class="tw-brief-summary" aria-labelledby="tw-brief-summary-title">
                  <h3 id="tw-brief-summary-title">
                    任务概要
                  </h3>
                  <dl class="tw-brief" :class="{ 'tw-brief--table': task.progress === 'brief', 'tw-brief--audit-content': auditContent }">
                    <template v-if="auditContent">
                      <template v-if="task.progress === 'brief'">
                        <div class="tw-brief-summary__item"><dt>异常说明</dt><dd>{{ auditContent.abnormality }}</dd></div>
                        <div class="tw-brief-summary__item"><dt>修改前的内容</dt><dd>{{ auditContent.originalContent || '尚未采集修改前的官网原文' }}</dd></div>
                      </template>
                      <template v-else>
                        <dt>异常说明</dt><dd>{{ auditContent.abnormality }}</dd>
                        <dt>修改前的内容</dt><dd>{{ auditContent.originalContent || '尚未采集修改前的官网原文' }}</dd>
                      </template>
                    </template>
                    <template v-for="field in auditContent ? [] : briefFields" :key="field.key">
                      <div v-if="task.progress === 'brief'" class="tw-brief-summary__item">
                        <dt>{{ field.label }}</dt>
                        <dd>{{ flow.brief[field.key] }}</dd>
                      </div>
                      <template v-else>
                        <dt>{{ field.label }}</dt><dd>{{ flow.brief[field.key] }}</dd>
                      </template>
                    </template>
                  </dl>
                </section>
                <section class="tw-content-basis" aria-labelledby="tw-content-basis-title">
                  <header class="tw-content-basis__head">
                    <div>
                      <h3 id="tw-content-basis-title">
                        内容依据
                      </h3><p>AI 优先使用已有知识，再补充缺少的信息。</p>
                    </div>
                    <span class="tw-content-basis__summary">AI 已匹配 {{ flow.knowledge.length }} 份知识{{ webSupplement ? ' + 联网补充' : '' }}</span>
                  </header>
                  <div class="tw-content-basis__body">
                    <div class="tw-content-basis__line">
                      <strong>AI 自动匹配</strong>
                      <div class="tw-chip-list">
                        <Tag v-for="item in flow.knowledge" :key="item.id" tone="blue">
                          {{ item.title }}
                        </Tag>
                        <span v-if="!flow.knowledge.length" class="tw-content-basis__empty">暂未匹配知识资料</span>
                      </div>
                    </div>
                    <div class="tw-content-basis__line">
                      <strong>建议再补充</strong>
                      <div class="tw-chip-list" aria-label="补充主题建议">
                        <span v-for="topic in supplementTopics" :key="topic" class="tw-suggestion-chip">
                          {{ topic }}
                        </span>
                      </div>
                    </div>
                    <label v-if="editableBrief" class="tw-content-basis__instruction">
                      <span><strong>直接告诉 AI</strong><small>写一句话也可以</small></span>
                      <textarea v-model="directInstruction" rows="3" placeholder="例如：重点介绍本地服务与代理支持；不要写未经确认的价格或交期。" />
                    </label>
                    <div v-else class="tw-content-basis__instruction">
                      <span><strong>任务补充说明</strong><small>{{ serviceMode === 'agent' ? '由客户补充' : '由运营维护' }}</small></span>
                      <p class="tw-content-basis__instruction-value">
                        {{ directInstruction || '暂无补充说明' }}
                      </p>
                    </div>
                    <label v-if="canEditWebSupplement" class="tw-web-supplement">
                      <span><strong>知识不足时联网补充</strong><small>{{ editableBrief ? '联网内容会在审核时标出' : '修改将记录为新版本' }}</small></span>
                      <input v-model="webSupplement" type="checkbox" @change="saveWebSupplementSetting">
                    </label>
                    <div v-else class="tw-web-supplement is-disabled">
                      <span><strong>知识不足时联网补充</strong><small>{{ serviceMode === 'agent' ? '请在审核阶段调整' : '该设置由运营维护' }}</small></span>
                      <span class="tw-web-supplement__value">{{ webSupplement ? '已开启' : '未开启' }}</span>
                    </div>
                    <div v-if="editableBrief" class="tw-content-basis__actions">
                      <Button variant="secondary" data-test="adjust-materials" @click="openEditor('knowledge')">
                        调整已有资料
                      </Button>
                      <Button variant="secondary" data-test="upload-material" @click="openKnowledgeUpload">
                        上传新资料
                      </Button>
                    </div>
                  </div>
                  <div v-if="task.progress === 'brief'" class="tw-gate" :class="{ ready: !gate.length }" role="status">
                    <span class="tw-gate__icon" aria-hidden="true"><AppIcon :name="gate.length ? 'warning' : 'check'" :size="16" /></span>
                    <strong>{{ gate.length ? 'Agent 暂不能执行' : '内容依据已准备完成' }}</strong><p>{{ gate.length ? `还需完成：${gate.join('；')}` : '确认 Brief 后，Agent 将优先使用已匹配知识，并按需联网补充。' }}</p>
                  </div>
                </section>
              </div>
              <p v-if="flow.feedback" class="tw-feedback">
                最新调整意见：{{ flow.feedback }}
              </p>
              <section v-if="task.progress === 'brief' && !isTaskIgnored(task)" class="tw-brief-confirm" :class="{ 'is-client-preview': clientPreview }" aria-label="当前阶段操作">
                <div class="tw-brief-confirm__copy">
                  <strong v-if="(role === 'client' && serviceMode === 'managed') || clientPreview || flow.briefStatus !== 'ready'" class="tw-brief-confirm__eyebrow">{{ role === 'client' || clientPreview ? '客户视图预览' : taskStageLabel(task, serviceMode) }}</strong>
                  <h3 v-if="flow.briefStatus === 'ready'">
                    Task 草稿 · Brief 确认
                  </h3>
                  <p v-if="role === 'client' || flow.briefStatus !== 'ready'">
                    {{ serviceMode === 'agent' ? '请补充资料或说明，确认后由 AI 生成内容。' : role === 'client' ? 'Brief 由运营维护并确认。此页面仅展示任务目标、范围与依据，不提供编辑操作。' : waitingFor }}
                  </p>
                  <p v-if="message" class="tw-success" role="status">
                    {{ message }}
                  </p>
                  <p v-if="error && !drawer" class="tw-error" role="alert">
                    {{ error }}
                  </p>
                </div>
                <div v-if="editableBrief && flow.briefStatus === 'ready'" class="tw-actions">
                  <Button class="tw-ignore-action" variant="secondary" data-test="ignore-task" :disabled="!canIgnoreCurrentStep" :title="canIgnoreCurrentStep ? undefined : `当前步骤由${ignoreOwner(task, serviceMode) === 'ops' ? '运营' : '客户'}负责`" @click="drawer = 'ignore'">
                    忽略
                  </Button>
                  <Button variant="primary" :disabled="!editableBrief" :title="gate.length ? `还需完成：${gate.join('；')}` : undefined" @click="confirmTask">
                    {{ serviceMode === 'agent' ? '确认并生成内容' : '运营审核通过并生成内容' }}
                  </Button>
                </div>
                <Button v-else-if="flow.briefStatus === 'changes_requested' && role === 'ops' && serviceMode === 'managed'" @click="act('rework_brief')">
                  审核意见并重整 Brief
                </Button>
              </section>
            </section>

            <section v-else-if="tab === 'output'" class="tw-card">
              <template v-if="flow.output.body">
                <div class="tw-output-review-layout">
                  <div class="tw-output-review-main">
                    <TaskRichTextEditor v-model="draft.body" :editable="reviewing" :ai-optimize="contentReviewVisible" :ai-calls-remaining="aiCallsRemaining" :full-width="true" :heading="flow.output.title" label="生成内容正文编辑器" @ai-call="consumeAiCall">
                      <template #supplement>
                        <section class="tw-internet-supplement" data-test="internet-supplement" aria-label="AI 联网内容状态">
                          <header class="tw-internet-supplement__head">
                            <div class="tw-internet-supplement__title">
                              <h3>AI 联网内容</h3>
                              <span class="tw-internet-supplement__count">2 处待确认</span>
                              <span class="tw-internet-supplement__help-wrap">
                                <button class="tw-internet-supplement__help" type="button" aria-label="联网内容说明" aria-describedby="internet-supplement-help">?</button>
                                <span id="internet-supplement-help" class="tw-internet-supplement__tooltip" role="tooltip">联网内容已在正文中标色。产品参数、认证、价格、交期等关键事实确认后才能发布。</span>
                              </span>
                            </div>
                            <div class="tw-internet-supplement__filters" aria-label="内容筛选预览">
                              <span class="is-active">全部 <b>2</b></span>
                              <span>AI 联网</span>
                              <span>待确认</span>
                            </div>
                          </header>
                          <ul class="tw-internet-supplement__items">
                            <li>
                              <span class="tw-internet-supplement__kind">关键事实</span>
                              <span class="tw-internet-supplement__text">日本本地服务覆盖区域与响应时效</span>
                              <span class="tw-internet-supplement__source">演示来源 · 待接入</span>
                              <span class="tw-internet-supplement__status">待确认</span>
                            </li>
                            <li>
                              <span class="tw-internet-supplement__kind">关键事实</span>
                              <span class="tw-internet-supplement__text">代理合作的适用范围、职责边界与服务内容</span>
                              <span class="tw-internet-supplement__source">演示来源 · 待接入</span>
                              <span class="tw-internet-supplement__status">待确认</span>
                            </li>
                          </ul>
                          <p class="tw-internet-supplement__demo-note">
                            样式预览：当前展示示例条目，尚未连接真实联网检索。
                          </p>
                        </section>
                      </template>
                    </TaskRichTextEditor>
                  </div>
                  <TaskReviewInsights v-if="contentReviewVisible" />
                </div>
              </template><p v-else class="tw-empty">
                确认 Brief 后，Agent 将自动生成本任务产物。
              </p>
            </section>

            <section v-else-if="tab === 'website'" class="tw-card">
              <div class="tw-section-head">
                <div><h2>AI 建站执行包</h2><p>客户终审 → 提交官网 → 模拟执行 → GEO 验证 → 发布门禁 → Re-check</p></div><Tag tone="blue">
                  第 {{ flow.site.attempts }} 次提交
                </Tag>
              </div>
              <dl class="tw-brief">
                <dt>执行目标</dt><dd>{{ flow.brief.scope }}</dd><dt>交付产物</dt><dd>{{ flow.output.title }} · V{{ flow.output.revision }}</dd><dt>执行要求</dt><dd>{{ flow.site.requirements || '客户确认产物后生成执行包。' }}</dd><dt>验收条件</dt><dd>{{ flow.brief.acceptance }}</dd><dt>预览版本</dt><dd>{{ flow.site.preview || '等待模拟建站回传' }}</dd><dt>验证结果</dt><dd>{{ flow.site.result || '尚未验证' }}</dd><dt>发布 URL</dt><dd><a v-if="flow.url" :href="flow.url" target="_blank" rel="noopener noreferrer">{{ flow.url }}</a><span v-else>待客户登记</span></dd>
              </dl>
              <details v-if="flow.site.preview" class="tw-resource">
                <summary>查看执行预览 / Diff（模拟）</summary><p>原执行对象：{{ flow.brief.scope }}</p><p>拟应用变更：{{ task.methods.join('、') }}</p><pre class="tw-output">{{ flow.output.body }}</pre>
              </details>
              <label v-if="siteOwner && ['site_submit', 'site_failed'].includes(task.progress)" class="tw-check"><input v-model="simulateFailure" type="checkbox"> 本次演示模拟验证失败（用于验证调整与重试流程）</label>
            </section>

            <section v-else-if="tab === 'versions'" class="tw-card">
              <h2>版本 / Diff</h2><p class="tw-muted">
                历史快照只读。确认后的执行基线不会被后续编辑覆盖。
              </p><details v-for="(version, index) in flow.versions" :key="version.version" class="tw-version">
                <summary>V{{ version.version }} · {{ version.note }}<small>{{ new Date(version.time).toLocaleString() }}</small></summary><p class="tw-feedback">
                  {{ versionDiff(index) }}
                </p><dl class="tw-brief">
                  <template v-for="field in auditContent ? [] : briefFields" :key="field.key">
                    <dt>{{ field.label }}</dt><dd>{{ version.brief[field.key] }}</dd>
                  </template><template v-if="auditContent"><dt>异常说明</dt><dd>{{ auditContent.abnormality }}</dd><dt>修改前的内容</dt><dd>{{ auditContent.originalContent || '尚未采集修改前的官网原文' }}</dd></template><dt>执行方法</dt><dd>{{ version.methods.join('、') || '未选择' }}</dd><dt>知识资料</dt><dd>{{ version.knowledge.map(item => item.title).join('、') || '未关联' }}</dd>
                </dl><pre v-if="version.output" class="tw-output">{{ version.output }}</pre>
              </details>
            </section>
            <section v-else class="tw-card">
              <h2>协作记录</h2><p v-if="!flow.reviews.length" class="tw-empty">
                暂无协作记录。确认、调整、审核与模拟执行都会留痕。
              </p><ol class="tw-timeline">
                <li v-for="(item, index) in flow.reviews" :key="index">
                  <strong>{{ item.actor }}</strong><time>{{ new Date(item.time).toLocaleString() }}</time><p>{{ item.note }}</p>
                </li>
              </ol>
            </section>
          </div>
        </template>
      </section>
    </div>

    <section v-if="task.executionKind !== 'verification' && task.type !== 'repair' && !automatic && (task.progress !== 'brief' || ignoredTask) && !waitingForOperationsReview" class="tw-actionbar" :class="{ 'is-complete': task.progress === 'done', 'is-ignored': Boolean(ignoredTask), 'is-client-content-review': task.progress === 'client_content_review', 'is-client-final-review': customerFinalReview, 'is-ops-content-review': operationsContentReview, 'is-ops-client-review': operationsWaitingForClientReview }" aria-label="当前阶段操作">
      <div>
        <strong v-if="task.progress !== 'client_content_review' && !customerFinalReview && !operationsContentReview && !operationsWaitingForClientReview">{{ actionbarTitle }}</strong><p v-if="actionbarDescription" :class="{ 'tw-running': automatic }">
          {{ actionbarDescription }}
        </p><p v-if="message && task.progress !== 'done' && !ignoredTask && !operationsWaitingForClientReview" class="tw-success" role="status">
          {{ message }}
        </p><p v-if="error && !drawer" class="tw-error" role="alert">
          {{ error }}
        </p>
      </div><div class="tw-actions">
        <Button v-if="operationsWaitingForClientReview" variant="secondary" disabled data-test="waiting-client-final-review">
          等待客户确认最终稿
        </Button>
        <Button v-else-if="!customerFinalReview && !ignoredTask && task.progress !== 'done'" class="tw-ignore-action" variant="secondary" data-test="ignore-task" :disabled="!canIgnoreCurrentStep" :title="canIgnoreCurrentStep ? undefined : `当前步骤由${ignoreOwner(task, serviceMode) === 'ops' ? '运营' : '客户'}负责`" @click="drawer = 'ignore'">
          忽略
        </Button>
        <template v-if="reviewing">
          <Button v-if="operationsContentReview" variant="secondary" data-test="save-inline-output" :disabled="!outputDirty" @click="saveInlineOutput">
            保存正文
          </Button>
          <Button v-if="serviceMode !== 'agent' && !operationsContentReview && !customerFinalReview" variant="secondary" :data-test="task.progress === 'client_content_review' ? 'request-output-feedback' : undefined" @click="submitOutputFeedback">
            提交修改意见
          </Button>
          <Button variant="primary" @click="approveReview">
            {{ operationsContentReview ? '运营审核通过，交客户确认' : role === 'ops' ? '审核通过，交客户确认' : '客户确认文案结果' }}
          </Button>
        </template>
        <Button v-if="siteOwner && task.progress === 'site_submit'" @click="act('submit_site', { simulateFailure })">
          提交 AI 建站
        </Button>
        <Button v-if="siteOwner && task.progress === 'site_failed'" @click="openEditor('retry')">
          补充要求并重新提交
        </Button>
        <Button v-if="role === 'ops' && task.progress === 'site_publish'" variant="secondary" disabled data-test="publish-waiting">
          等待客户发布确认
        </Button>
        <template v-if="role === 'client' && ['site_publish', 'publish'].includes(task.progress)">
          <template v-if="!publishPromptDismissed">
            <Button variant="secondary" data-test="dismiss-publish" @click="publishPromptDismissed = true">
              稍后确认
            </Button><Button data-test="confirm-publish" @click="act('publish')">
              确认发布上线
            </Button>
          </template>
          <span v-else class="tw-actionbar__dismissed" role="status">已暂缓，任务仍等待客户确认发布上线。</span>
        </template>
        <Button v-if="task.progress === 'recheck'" data-test="complete-recheck" @click="act('complete_recheck')">
          完成本次官网核验
        </Button>
        <Button v-if="task.progress === 'done' || ignoredTask" variant="primary" data-test="return-optimization" @click="emit('back')">
          返回优化中心
        </Button>
      </div>
    </section>

    <Drawer :open="drawer !== null && drawer !== 'upload'" :class="drawer === 'ignore' ? 'tw-ignore-drawer' : undefined" :eyebrow="drawer === 'ignore' ? `${task.name} · ${task.progress === 'brief' ? 'Task Brief 确认' : taskStageLabel(task, serviceMode)}` : undefined" :title="drawer === 'ignore' ? '忽略本次审核事项' : drawer === 'brief' ? '编辑 Brief 与执行方法' : drawer === 'knowledge' ? '知识资料准备' : drawer === 'output' ? '编辑任务产物' : drawer === 'retry' ? '补充要求并重新提交' : '提出调整意见'" :size="560" close-label="关闭编辑" @close="closeDrawer">
      <div v-if="drawer === 'ignore'" class="tw-ignore-form">
        <p class="tw-ignore-warning">
          忽略后，本次审核事项不再进入后续执行，也不会从待处理中重复出现；来源诊断仍保留，官网异常不会因此变为通过。提交后不可恢复。
        </p>
        <label class="tw-field tw-ignore-field">
          <span>忽略原因 <b aria-hidden="true">*</b></span>
          <DropdownSelect v-model="ignoredReason" :options="ignoreReasonOptions" v-bind="{ ariaLabel: '忽略原因' }" panel-width="100%" />
        </label>
        <label class="tw-field tw-ignore-field">
          <span>忽略说明 <b aria-hidden="true">*</b></span>
          <textarea v-model="ignoredExplanation" data-test="ignore-explanation" rows="5" placeholder="说明为什么不采纳本次审核事项，便于追溯和 Agent 学习。" />
        </label>
        <p v-if="error" role="alert" class="tw-error">
          {{ error }}
        </p>
      </div>
      <div v-else class="tw-editor">
        <template v-if="drawer === 'brief'">
          <template v-if="auditContent"><div class="tw-field"><strong>异常说明</strong><p>{{ auditContent.abnormality }}</p></div><div class="tw-field"><strong>修改前的内容</strong><p>{{ auditContent.originalContent || '尚未采集修改前的官网原文' }}</p></div></template>
          <label v-for="field in auditContent ? [] : briefFields" :key="field.key" class="tw-field">{{ field.label }}<textarea v-model="draft.brief[field.key]" rows="3" /></label><fieldset class="tw-methods">
            <legend>执行方法 · 至少选择一项</legend><label v-for="method in [...new Set([...methodOptions, ...draft.methods])]" :key="method" class="tw-check"><input type="checkbox" :checked="draft.methods.includes(method)" @change="toggleMethod(method)">{{ method }}</label>
          </fieldset><div class="tw-inline">
            <label class="tw-field">自定义执行方法<input v-model="customMethod" maxlength="60" @keydown.enter.prevent="addMethod"></label><Button variant="secondary" @click="addMethod">
              添加标签
            </Button>
          </div>
        </template>
        <template v-else-if="drawer === 'knowledge'">
          <p class="tw-demo">
            演示资料仅供流程展示。此处可选择已解析资料；新资料需先上传至 AI 建站知识库并完成解析。
          </p><label v-for="item in knowledgeOptions" :key="item.id" class="tw-knowledge tw-check"><input type="checkbox" :checked="draft.knowledge.some(known => known.id === item.id)" @change="toggleKnowledge(item)"><span><strong>{{ item.title }}</strong><small>{{ item.tag }} · {{ item.source }} · 解析成功</small></span></label><div v-if="draft.knowledge.length" class="tw-resource">
            <h3>已选 {{ draft.knowledge.length }} 项</h3><div v-for="item in draft.knowledge" :key="item.id" class="tw-knowledge">
              <span>{{ item.title }} · 解析成功</span><Button variant="text" @click="toggleKnowledge(item)">
                移除
              </Button>
            </div>
          </div>
        </template>
        <template v-else-if="drawer === 'output'">
          <label class="tw-field">产物标题<input v-model="draft.title"></label><label class="tw-field">产物正文<TaskRichTextEditor v-model="draft.body" label="编辑产物正文" /></label>
        </template>
        <template v-else>
          <p>原版本与调整记录会保留，可在版本 / Diff 和协作记录中追溯。</p><label class="tw-field">{{ drawer === 'retry' ? '补充要求与修正说明' : '调整意见' }}<textarea v-model="note" rows="8" placeholder="请说明范围、事实、内容或交付要求需要如何调整" /></label><label v-if="drawer === 'retry'" class="tw-check"><input v-model="simulateFailure" type="checkbox"> 本次演示继续模拟验证失败</label>
        </template>
        <p v-if="error" role="alert" class="tw-error">
          {{ error }}
        </p>
      </div>
      <template #footer>
        <Button variant="secondary" @click="closeDrawer">
          取消
        </Button><Button v-if="drawer === 'ignore'" variant="primary" data-test="confirm-ignore" :disabled="!ignoredReason || !ignoredExplanation.trim()" @click="ignoreCurrentTask">
          确认忽略
        </Button><Button v-else @click="saveDrawer">
          {{ drawer === 'feedback' ? '提交调整意见' : drawer === 'retry' ? '重新提交（模拟）' : '保存修改' }}
        </Button>
      </template>
    </Drawer>
    <KnowledgeUploadDrawer :open="drawer === 'upload'" :task-id="task.id" @close="drawer = null" @submitted="handleUploadSubmitted" />
    <TaskPermissionsDrawer :service-mode="serviceMode" :open="permissionDrawerOpen" @close="permissionDrawerOpen = false" />
    <Toast :open="validationToastOpen" :message-id="validationToastMessageId" variant="error" close-label="关闭提示" @close="validationToastOpen = false">
      {{ validationToastMessage }}
    </Toast>
  </main>
</template>

<style src="../../styles/task-workspace.css" />
