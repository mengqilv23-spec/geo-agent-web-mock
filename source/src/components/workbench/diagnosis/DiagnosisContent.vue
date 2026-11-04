<script setup lang="ts">
import { pendingReviewLabel, strategyReviewStatus } from '../../../workflows/review-status'
import { findingHasTask, findingRouteLabel, isAdviceFinding, isKnowledgeFinding, isReadOnlyFinding } from '../../../workflows/finding-treatment'
import { directRepairStatus, isDirectRepairFinding } from '../../../workflows/direct-repair'
import type { AuditCheck, AuditFinding, GeoTask, Persona, Strategy, StrategyLayer } from '../../../data/geo-data'
import type { DataListColumn } from '../../ui/ce/data-list/types'
import { storeToRefs } from 'pinia'
import { computed, h, shallowRef, watch } from 'vue'
import { auditChecks, displayObjectCodes } from '../../../data/geo-data'
import { useDiagnosisStore } from '../../../stores/diagnosis'
import Button from '../../ui/ce/button/Button.vue'
import Card from '../../ui/ce/card/Card.vue'
import DataList from '../../ui/ce/data-list/DataList.vue'
import Pagination from '../../ui/ce/pagination/Pagination.vue'
import Tag from '../../ui/ce/tag/Tag.vue'
import Tooltip from '../../ui/ce/tooltip/Tooltip.vue'
import AppIcon from '../../ui/icons/AppIcon.vue'
import GeoPageIntro from '../shared/GeoPageIntro.vue'
import DeferredGeoRadarChart from './DeferredGeoRadarChart.vue'
import ClientGapEvidence from './ClientGapEvidence.vue'
import { clientCheckResult, personaEvidence, platformGapBreakdown } from '../../../workflows/client-diagnosis'
import type { DiagnosisPlatform } from '../../../workflows/client-diagnosis'

const props = defineProps<{
  findings: AuditFinding[]
  personas: Persona[]
  activePersona: string
  strategies: Strategy[]
  allStrategies?: Strategy[]
  tasks?: GeoTask[]
  strategyLayer: StrategyLayer
  serviceMode: 'managed' | 'agent'
  role: 'ops' | 'client'
  highlightedStrategy?: string
}>()

const emit = defineEmits<{
  selectFinding: [id: string]
  selectAllFindings: [ids: string[]]
  approveSelectedFindings: []
  selectPersona: [id: string]
  setStrategyLayer: [layer: StrategyLayer]
  openStrategy: [strategy: Strategy]
  confirmStrategy: [strategy: Strategy]
  goOptimization: []
  openFlow: []
  openAudit: [finding: AuditFinding]
  openAuditCheck: [check: AuditCheck]
  openPending: []
}>()

const layers: StrategyLayer[] = ['全部', '内容', '实体与信任', '外部信源']
const diagnosisStore = useDiagnosisStore()
const { selectedGap } = storeToRefs(diagnosisStore)
const platformFilter = shallowRef<DiagnosisPlatform>('全部平台')
const tableLabels = {
  bulkActions: '异常批量操作',
  selectedCount: (count: number) => `已选择 ${count} 项`,
  clearSelection: '清除选择',
  table: (label: string) => `${label}表格`,
  selectAll: '选择全部异常',
  loading: '正在加载',
  retry: '重试',
  selectRow: (label: string) => `选择 ${label}`,
}
const findingColumns: DataListColumn<unknown>[] = [
  { key: 'id', title: '序号', width: '9%', minWidth: 96, className: 'geo-finding-id' },
  { key: 'finding', title: '问题 / 建议', width: '23%', minWidth: 225 },
  { key: 'route', title: '处理方式与类型', width: '17%', minWidth: 180 },
  { key: 'check', title: '所属检查项', width: '16%', minWidth: 160 },
  { key: 'priority', title: '优先级', width: '7%', minWidth: 64 },
  { key: 'status', title: '处理状态', width: '20%', minWidth: 190 },
  { key: 'actions', title: '操作', width: 120, minWidth: 120, className: 'geo-finding-action-column' },
]
const strategyColumns: DataListColumn<unknown>[] = [
  { key: 'id', title: '序号（问题编码）', width: '8%', minWidth: 108, className: 'geo-strategy-id' },
  { key: 'priority', title: '优先级', width: '5%', minWidth: 70, className: 'geo-strategy-priority' },
  { key: 'type', title: '策略类型', width: '9%', minWidth: 110, className: 'geo-strategy-type' },
  { key: 'description', title: '描述', width: '25%', minWidth: 300, className: 'geo-strategy-main' },
  { key: 'source', title: '来源', width: '6%', minWidth: 96, className: 'geo-strategy-source' },
  { key: 'factor', title: '人设·决策因子', width: '24%', minWidth: 320, className: 'geo-strategy-factor' },
  { key: 'status', title: '当前状态', width: '12%', minWidth: 150, className: 'geo-strategy-status' },
  { key: 'actions', title: '操作', width: 120, minWidth: 120, className: 'geo-strategy-actions' },
]
const aggregatePersonaEvidence = computed(() => {
  const persona = props.personas.find(item => item.id === props.activePersona) ?? props.personas[0]
  return persona ? personaEvidence(persona) : null
})
const activePersonaData = computed(() => {
  const persona = props.personas.find(persona => persona.id === props.activePersona) ?? props.personas[0]
  if (!persona) return persona
  const evidence = personaEvidence(persona, platformFilter.value)
  const actionable = evidence.topics.filter(topic => topic.gap !== null && topic.gap > 0 && linkedStrategyCount(topic.name) > 0)
  return { ...persona, factors: persona.factors.flatMap(factor => {
    const topic = evidence.topics.find(item => item.name === factor.name && item.denominator > 0)
    return topic ? [{ ...factor, coverage: topic.own!, competitor: topic.rival! }] : []
  }), gaps: actionable.map(topic => ({ name: topic.name, value: topic.gap! })) }
})
const queuePage = shallowRef(1)
const auditPage = shallowRef(1)
const pageSize = 5
const auditFilter = shallowRef('all')
const treatmentFilter = shallowRef('all')
const statusFilter = shallowRef('all')
const allStrategies = computed(() => props.allStrategies ?? props.strategies)
const canReview = computed(() => props.role === (props.serviceMode === 'agent' ? 'client' : 'ops'))
const gapAliases: Record<string, string[]> = {
  本地服务与培训: ['本地服务', '培训', '售后', '服务网络', '服务'],
  认证与合规: ['认证', '合规', 'sameAs', 'Organization', '实体与信任'],
  交期与产能: ['交期', '产能', 'SLA', '交付'],
  交付稳定性: ['交期', '交付', '产能', 'SLA', '稳定交付'],
  供应链风险: ['供应链', '备件', '服务网络', '停机', '交期'],
  本地服务: ['本地服务', '服务', '代理', '培训'],
  代理支持: ['代理', '本地服务', '服务'],
  交期稳定: ['交期', '交付', '产能'],
  维护难度: ['维护', 'FAQ', '选型问答', '分段改写'],
  停机风险: ['停机', '维护', '快速恢复', '稳定性'],
  培训成本: ['培训', '视频', 'YouTube', '支持机制'],
}
const layerCounts = computed(() => Object.fromEntries(layers.map(layer => [layer, layer === '全部' ? allStrategies.value.length : allStrategies.value.filter(strategy => strategy.layer === layer).length])))
function matchesGap(strategy: Strategy, name: string) {
  const aliases = [name, ...(gapAliases[name] ?? [])]
  const haystack = [strategy.title, strategy.factor, strategy.evidence, strategy.layer, strategy.persona, ...strategy.methods].join(' ').toLocaleLowerCase()
  return aliases.some(alias => haystack.includes(alias.toLocaleLowerCase()))
}
function belongsToActivePersona(strategy: Strategy) {
  const persona = props.personas.find(item => item.id === props.activePersona)
  return !!persona && (!!strategy.personaIds?.includes(persona.id) || strategy.persona.includes(persona.name))
}
function matchesPersona(strategy: Strategy) {
  const persona = activePersonaData.value
  return !!persona && (!!strategy.personaIds?.includes(persona.id) || strategy.persona.includes(persona.name))
}
function strategyGaps(strategy: Strategy) {
  const gaps = aggregatePersonaEvidence.value?.topics.filter(topic => topic.gap !== null && topic.gap > 0).map(topic => ({ name: topic.name, value: topic.gap! }))
  return belongsToActivePersona(strategy) ? gaps?.filter(gap => matchesGap(strategy, gap.name)) ?? [] : []
}
function personaScore(strategy: Strategy) {
  const matchedGaps = strategyGaps(strategy)
  const maxGap = matchedGaps.length ? Math.max(...matchedGaps.map(gap => gap.value)) : 0
  const priorityBase = (3 - Number(strategy.priority.slice(1))) * 100
  return priorityBase + maxGap * 1.6 + (matchesPersona(strategy) ? 28 : 0)
}
const sortedStrategies = computed(() => {
  const filtered = allStrategies.value.filter(strategy => (props.strategyLayer === '全部' || strategy.layer === props.strategyLayer) && (!selectedGap.value || (belongsToActivePersona(strategy) && matchesGap(strategy, selectedGap.value))))
  return [...filtered].sort((a, b) => {
    const gapOrder = selectedGap.value ? Number(matchesGap(b, selectedGap.value)) - Number(matchesGap(a, selectedGap.value)) : 0
    return gapOrder || personaScore(b) - personaScore(a) || a.priority.localeCompare(b.priority)
  })
})
const queuePages = computed(() => Math.max(1, Math.ceil(sortedStrategies.value.length / pageSize)))
const visibleStrategies = computed(() => sortedStrategies.value.slice((queuePage.value - 1) * pageSize, queuePage.value * pageSize))
const activeAuditCheck = computed(() => auditChecks.find(check => check.id === auditFilter.value))
const filteredFindings = computed(() => props.findings.filter(finding => {
  if (activeAuditCheck.value && finding.check !== activeAuditCheck.value.label) return false
  if (statusFilter.value === 'pending' && !['待处理', '待客户审核', '待官网运营审核'].includes(finding.status)) return false
  if (statusFilter.value === 'approved' && !['已生成策略', '已修复'].includes(finding.status)) return false
  if (statusFilter.value === 'no-review' && (!isDirectRepairFinding(finding) || isReadOnlyFinding(finding))) return false
  if (treatmentFilter.value === 'knowledge') return isKnowledgeFinding(finding)
  if (treatmentFilter.value === 'advice') return isAdviceFinding(finding)
  if (treatmentFilter.value === 'repair') return isDirectRepairFinding(finding)
  if (treatmentFilter.value === 'review') return !isReadOnlyFinding(finding) && !isDirectRepairFinding(finding)
  return true
}))
const auditPages = computed(() => Math.max(1, Math.ceil(filteredFindings.value.length / pageSize)))
const visibleFindings = computed(() => filteredFindings.value.slice((auditPage.value - 1) * pageSize, auditPage.value * pageSize))
function findingFromRow(item: unknown) {
  return item as AuditFinding
}
function strategyFromRow(item: unknown) {
  return item as Strategy
}
function findingActionLabel(finding: AuditFinding) {
  if (findingHasTask(finding, allStrategies.value, props.tasks ?? [], props.serviceMode === 'agent' || finding.id === 'F9')) return '查看详情'
  if (isKnowledgeFinding(finding)) return '查看补充要求'
  if (isAdviceFinding(finding)) return '查看建议'
  if (props.serviceMode === 'managed' && finding.status === '待客户审核') return props.role === 'client' ? '审核' : '查看详情'
  return canReview.value && !isDirectRepairFinding(finding) && ['待处理', '待官网运营审核'].includes(finding.status) ? '审核' : '查看详情'
}
function findingStatusLabel(finding: AuditFinding) {
  if (findingHasTask(finding, allStrategies.value, props.tasks ?? [], props.serviceMode === 'agent' || finding.id === 'F9')) return '已生成任务'
  if (isKnowledgeFinding(finding)) return '待补充知识'
  if (isAdviceFinding(finding)) return '无需处理'
  if (props.serviceMode === 'managed' && finding.status === '待客户审核') return '待客户审核'
  if (isDirectRepairFinding(finding))
    return directRepairStatus(finding.status === '已修复')
  if (finding.status === '已修复')
    return '已修复'
  if (finding.status === '暂不修复')
    return props.serviceMode === 'agent' ? '本轮已终止' : '暂不修复'
  if (finding.status === '已生成策略')
    return '已生成候选策略'
  return pendingReviewLabel(props.serviceMode)
}
function findingCheckLabel(finding: AuditFinding) {
  const index = auditChecks.findIndex(check => check.label === finding.check)
  return `${['①', '②', '③', '④', '⑤', '⑥', '⑦'][index] ?? ''} ${finding.check}`.trim()
}
function taskFor(strategy: Strategy) {
  return props.tasks?.find(task => task.strategy === strategy.id || task.relatedStrategies.includes(strategy.id))
}
function strategyCollaborationLabel(strategy: Strategy) {
  return strategyReviewStatus(strategy, props.tasks ?? [], props.serviceMode)
}
function strategyNeedsReview(strategy: Strategy) {
  return !strategy.businessGapRecorded && !strategy.ignored && !strategy.confirmed && !taskFor(strategy)
}
function canReviewStrategy(strategy: Strategy) {
  return strategyNeedsReview(strategy) && (props.serviceMode === 'agent' ? props.role === 'client' : strategy.reviewStage === 'customer' ? props.role === 'client' : props.role === 'ops')
}
function resultForCheck(check: AuditCheck) { return props.serviceMode === 'agent' ? clientCheckResult(check, props.findings, props.tasks ?? []) : { state: check.passed ? '通过' : '异常', errors: check.passed ? 0 : 1, unknown: 0 } }
const abnormalFindings = computed(() => props.findings.filter(finding => !isReadOnlyFinding(finding)))
const findingsRequiringReview = computed(() => abnormalFindings.value.filter(finding => !isDirectRepairFinding(finding)))
function findingHasApprovedReview(finding: AuditFinding) {
  return ['已生成策略', '已修复'].includes(finding.status)
    || findingHasTask(finding, allStrategies.value, props.tasks ?? [], true)
}
const auditPendingReviewCount = computed(() => findingsRequiringReview.value.filter(finding => (
  ['待处理', '待客户审核', '待官网运营审核'].includes(finding.status)
  && !findingHasApprovedReview(finding)
)).length)
const auditApprovedCount = computed(() => findingsRequiringReview.value.filter(findingHasApprovedReview).length)
const auditNoReviewCount = computed(() => abnormalFindings.value.filter(isDirectRepairFinding).length)
const showPassedOnly = computed(() => props.serviceMode === 'agent' && activeAuditCheck.value && resultForCheck(activeAuditCheck.value).state === '通过')

watch(() => props.strategyLayer, () => queuePage.value = 1)
watch(() => props.activePersona, () => {
  diagnosisStore.clearFocusedGap()
  queuePage.value = 1
})
watch(platformFilter, () => {
  diagnosisStore.clearFocusedGap()
  queuePage.value = 1
})
watch(queuePages, pages => queuePage.value = Math.min(queuePage.value, pages))
watch([treatmentFilter, statusFilter], () => auditPage.value = 1)
watch(auditPages, pages => auditPage.value = Math.min(auditPage.value, pages))
function openCheck(check: AuditCheck) {
  auditFilter.value = props.serviceMode === 'agent' && auditFilter.value === check.id ? 'all' : check.id
  auditPage.value = 1
}
function clearAuditFilter() {
  auditFilter.value = 'all'
  auditPage.value = 1
}
function focusGap(name: string) {
  diagnosisStore.focusGap(name)
  if (props.strategyLayer !== '全部') emit('setStrategyLayer', '全部')
  queuePage.value = 1
  const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  document.getElementById('strategy-title')?.scrollIntoView({ behavior, block: 'start' })
}
function linkedStrategyCount(name: string) {
  if (!aggregatePersonaEvidence.value?.topics.some(topic => topic.name === name && topic.gap !== null && topic.gap > 0)) return 0
  return allStrategies.value.filter(strategy => matchesGap(strategy, name) && belongsToActivePersona(strategy)).length
}
function platformGapTooltip(name: string) {
  const persona = props.personas.find(item => item.id === props.activePersona)
  if (!persona) return ''
  return h('div', { class: 'geo-platform-gap-tooltip' }, [
    h('strong', '各平台覆盖差距'),
    ...platformGapBreakdown(persona, name).map(item => h('div', { class: 'geo-platform-gap-tooltip__row' }, [
      h('span', item.platform),
      h('b', item.gap === null ? '暂无数据' : `${item.gap > 0 ? '+' : ''}${item.gap} 个百分点`),
      h('small', item.denominator ? `我方 ${item.own}% · Flow ${item.rival}% · ${item.denominator} 条` : '无有效回答'),
    ])),
  ])
}
function summaryText({ total, page, pages }: { total: number, page: number, pages: number }) {
  return `共 ${total} 条 · 第 ${page} / ${pages} 页`
}
</script>

<template>
  <div class="geo-content geo-diagnosis">
    <GeoPageIntro variant="workbench" title="诊断与策略" help-label="诊断与策略说明" description="需要处理的问题按类型进入修复或策略流程；仅提供建议的条目保留依据与参考建议，无需审核或生成任务。">
      <template #actions>
        <div class="geo-page-head__actions">
          <span class="geo-stage">当前阶段 · 确认问题与处理方向</span>
          <Button variant="text" size="sm" type="button" @click="emit('openFlow')">
            查看流程 <AppIcon name="arrowRight" :size="14" />
          </Button>
        </div>
      </template>
    </GeoPageIntro>

    <section class="geo-diagnosis-summary" aria-label="本轮监测概览">
      <header class="geo-diagnosis-summary__header">
        <div class="geo-diagnosis-summary__title">
          <span class="geo-diagnosis-summary__icon" aria-hidden="true">✦</span>
          <h2>本轮监测</h2>
          <span class="geo-diagnosis-summary__status">进行中</span>
        </div>
      </header>
      <div class="geo-diagnosis-summary__metrics">
        <div><span>监测时间 / 轮次</span><b>2026-10-02 · 第 5 轮</b></div>
        <div><span>市场 / 语言</span><b>德国 / 德语</b></div>
        <div><span>买家人设</span><b>3 类</b></div>
        <div><span>意图</span><b>4 类</b></div>
        <div><span>关键词</span><b>4 个</b></div>
        <div><span>采样总数</span><b>1138</b></div>
        <div><span>AI 平台</span><b>3 个</b></div>
        <div class="geo-diagnosis-summary__confidence">
          <span>可信度</span><b>中 · 趋势级</b>
        </div>
      </div>
    </section>

    <section class="geo-panel geo-audit-panel" aria-labelledby="audit-title">
      <header class="geo-panel__head">
        <div>
          <h2 id="audit-title">
            <span class="geo-section-heading__number" aria-hidden="true">1</span>
            <span>官网 GEO 体检</span>
            <Tooltip content="确定性技术问题由 AI 建站直接处理，完成后自动更新结果。" placement="right">
              <button type="button" class="geo-help" aria-label="官网 GEO 体检说明">?</button>
            </Tooltip>
          </h2>
        </div><div class="geo-inline-tags">
          <Tag tone="red" variant="soft" size="sm">{{ abnormalFindings.length }} 异常</Tag>
          <Tag tone="orange" variant="soft" size="sm">待审核 {{ auditPendingReviewCount }}</Tag>
          <Tag tone="green" variant="soft" size="sm">已通过 {{ auditApprovedCount }}</Tag>
          <Tag tone="neutral" variant="soft" size="sm">无需审核 {{ auditNoReviewCount }}</Tag>
        </div>
      </header>
      <div class="geo-check-grid" role="tablist" aria-label="官网 GEO 检查项">
        <button v-for="(check, index) in auditChecks" :key="check.id" type="button" role="tab" class="geo-check" :class="{ 'is-alert': resultForCheck(check).state === '异常', 'is-active': auditFilter === check.id }" :aria-selected="auditFilter === check.id" @click="openCheck(check)">
          <span class="geo-check-no">{{ ['①', '②', '③', '④', '⑤', '⑥', '⑦'][index] }}</span><span class="geo-check-name">{{ check.label }}</span><strong aria-hidden="true"><AppIcon :name="resultForCheck(check).state === '通过' ? 'check' : 'warning'" :size="16" /></strong><span class="geo-check-tooltip"><b>{{ resultForCheck(check).state }} · {{ check.label }}</b><small>{{ serviceMode === 'agent' ? resultForCheck(check).state === '通过' ? `本轮${check.label}检查通过，未发现需要处理的问题。` : `已确认问题 ${resultForCheck(check).errors} 项，待核对 ${resultForCheck(check).unknown} 项。` : check.note }}</small></span>
        </button>
      </div>
      <div v-if="showPassedOnly" class="geo-check-pass-result"><Tooltip :content="`本轮${activeAuditCheck?.label}检查通过，未发现需要处理的问题。`"><span tabindex="0">通过</span></Tooltip></div>
      <template v-else>
      <div class="geo-audit-filter">
        <select v-model="treatmentFilter" class="geo-treatment-filter" aria-label="处理方式筛选">
          <option value="all">全部处理方式</option>
          <option value="repair">直接处理</option>
          <option value="review">需要审核</option>
          <option value="knowledge">待补充知识</option>
          <option value="advice">仅提供建议</option>
        </select>
        <select v-model="statusFilter" class="geo-treatment-filter" aria-label="处理状态筛选">
          <option value="all">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="no-review">无需审核</option>
        </select>
        <Button v-if="auditFilter !== 'all'" variant="text" size="sm" @click="clearAuditFilter">
          取消筛选
        </Button>
        <span class="geo-audit-current"><b>当前查看：</b>{{ activeAuditCheck ? `${['①', '②', '③', '④', '⑤', '⑥', '⑦'][Number(activeAuditCheck.id) - 1]} ${activeAuditCheck.label}` : '全部问题与建议' }}</span>
      </div>
      <div class="geo-finding-table-frame">
        <div class="geo-diagnosis-table-scroll">
          <DataList
            class="geo-finding-table"
            :items="visibleFindings"
            :columns="findingColumns"
            :get-row-id="item => findingFromRow(item).id"
            :is-row-activatable="() => false"
            label="诊断问题与建议"
            :labels="tableLabels"
            empty-message="当前筛选下没有问题或建议"
            error-message="异常数据加载失败"
            density="compact"
          >
            <template #cell-id="{ item: finding }">
              {{ displayObjectCodes(findingFromRow(finding).id) }}
            </template>
            <template #cell-finding="{ item: finding }">
              <div class="geo-finding-copy"><Tooltip :content="findingFromRow(finding).title" :overflow-only="true"><strong>{{ findingFromRow(finding).title }}</strong></Tooltip></div>
            </template>
            <template #cell-route="{ item: finding }">
              <span class="geo-chip geo-route-badge" :class="findingFromRow(finding).route">{{ findingRouteLabel(findingFromRow(finding), serviceMode === 'agent') }}</span>
            </template>
            <template #cell-check="{ item: finding }">
              <span class="geo-chip">{{ findingCheckLabel(findingFromRow(finding)) }}</span>
            </template>
            <template #cell-priority="{ item: finding }">
              <span class="geo-chip" :class="findingFromRow(finding).priority === 'P0' ? 'geo-chip--danger' : ''">{{ findingFromRow(finding).priority }}</span>
            </template>
            <template #cell-status="{ item: finding }">
              <span class="geo-finding-status" :class="{ 'is-advice': isAdviceFinding(findingFromRow(finding)), 'is-review': findingActionLabel(findingFromRow(finding)) === '审核', 'is-done': findingStatusLabel(findingFromRow(finding)) === '已生成任务' || findingStatusLabel(findingFromRow(finding)) === '已生成候选策略' || findingStatusLabel(findingFromRow(finding)) === '已修复' || findingStatusLabel(findingFromRow(finding)) === '已完成处理', 'is-deferred': findingStatusLabel(findingFromRow(finding)) === '暂不修复' }">{{ findingStatusLabel(findingFromRow(finding)) }}</span>
            </template>
            <template #cell-actions="{ item: finding }">
              <Button class="geo-finding-detail-button geo-table-detail-button" :class="{ 'geo-review-button': findingActionLabel(findingFromRow(finding)) === '审核' }" variant="secondary" size="md" type="button" @click="emit('openAudit', findingFromRow(finding))">
                {{ findingActionLabel(findingFromRow(finding)) }}
              </Button>
            </template>
            <template #empty>
              <div class="geo-empty-state">
                <strong>当前筛选下没有问题或建议</strong><span>可调整检查项或处理方式筛选。</span>
              </div>
            </template>
          </DataList>
        </div>
        <footer class="geo-diagnosis-pagination">
          <Pagination v-model="auditPage" :total="filteredFindings.length" :page-size="pageSize" size="sm" label="诊断问题与建议分页" previous-label="问题上一页" next-label="问题下一页" :page-label="page => `问题第 ${page} 页`" :summary-text="summaryText" :format-value="String" />
        </footer>
      </div>
      </template>
    </section>

    <section class="geo-panel geo-persona-panel" aria-labelledby="persona-title">
      <header class="geo-panel__head">
        <div>
          <h2 id="persona-title">
            <span class="geo-section-heading__number" aria-hidden="true">2</span>
            <span>买家人设 × 决策因子：认知 GAP</span>
            <span class="geo-persona-panel__subtitle">买家看重的因素与 AI 回答中呈现的内容之间的差距分析</span>
          </h2>
        </div>
      </header>
      <div class="geo-personas" role="tablist" aria-label="买家人设">
        <button v-for="persona in personas" :key="persona.id" type="button" role="tab" :aria-selected="activePersona === persona.id" :class="{ 'is-active': activePersona === persona.id }" @click="emit('selectPersona', persona.id)">
          <strong>{{ persona.name }}</strong><small>{{ persona.gaps.length }} Gap</small>
        </button>
      </div>
      <div v-if="activePersonaData" class="geo-persona-body">
        <Card class="geo-radar-card">
          <div class="geo-card-head">
            <strong>{{ activePersonaData.name }} · 买家决策因子对比</strong><span>我方正向覆盖率 / 竞品正向覆盖率</span>
          </div><DeferredGeoRadarChart :factors="activePersonaData.factors" :title="activePersonaData.name" client-mode />
        </Card><ClientGapEvidence :persona="personas.find(persona => persona.id === activePersona) || personas[0]!" :linked-count="linkedStrategyCount" :platform="platformFilter" @set-platform="platformFilter = $event" @focus="focusGap" />
      </div>
    </section>

    <section class="geo-panel geo-strategy-panel" aria-labelledby="strategy-title">
      <header class="geo-panel__head geo-panel__head--stacked">
        <div>
          <h2 id="strategy-title">
            <span class="geo-section-heading__number" aria-hidden="true">3</span>
            <span>决策因子驱动的候选策略</span>
            <Tooltip :content="serviceMode === 'agent' ? '候选策略依据人设认知 GAP、回答证据与原因核查结果提出。客户审核通过后生成任务；不处理时请填写原因。' : '候选策略依据人设认知 GAP、回答证据与原因核查结果提出。运营审核后交客户确认；客户审核通过后生成任务。'" placement="right">
              <button type="button" class="geo-help" aria-label="候选策略说明">?</button>
            </Tooltip>
          </h2>
        </div>
      </header>
      <div class="geo-strategy-context" role="status">
        <span>当前人设：{{ activePersonaData?.name ?? '全部' }}</span>
        <Tag v-if="selectedGap" tone="blue" variant="soft">
          聚焦：{{ selectedGap }}
        </Tag>
        <Button v-if="selectedGap" variant="text" size="xs" @click="diagnosisStore.clearFocusedGap()">查看全部策略</Button>
      </div>
      <div class="geo-strategy-toolbar">
        <div class="geo-tabs" role="tablist" aria-label="策略类型">
          <button v-for="layer in layers" :key="layer" type="button" role="tab" :aria-selected="strategyLayer === layer" :class="{ 'is-active': strategyLayer === layer }" @click="emit('setStrategyLayer', layer)">
            <span>{{ layer }}</span><small>{{ ` · ${layerCounts[layer]}` }}</small>
          </button>
        </div>
      </div>
      <div class="geo-strategy-table-scroll">
        <DataList
          class="geo-strategy-table"
          :items="visibleStrategies"
          :columns="strategyColumns"
          :get-row-id="item => strategyFromRow(item).id"
          :active-row-id="highlightedStrategy"
          :is-row-activatable="() => false"
          label="候选策略"
          :labels="tableLabels"
          :empty-message="selectedGap ? '当前主题暂无关联策略' : '当前分类暂无策略'"
          error-message="候选策略加载失败"
          density="compact"
        >
          <template #cell-id="{ item: strategy }">
            {{ strategyFromRow(strategy).id }}
          </template>
          <template #cell-priority="{ item: strategy }">
            <span class="geo-chip" :class="strategyFromRow(strategy).priority === 'P0' ? 'geo-chip--danger' : ''">{{ strategyFromRow(strategy).priority }}</span>
          </template>
          <template #cell-type="{ item: strategy }">
            <span class="geo-chip">{{ strategyFromRow(strategy).layer }}</span>
          </template>
          <template #cell-description="{ item: strategy }">
            <Tooltip :content="strategyFromRow(strategy).title" :overflow-only="true">
              <strong>{{ strategyFromRow(strategy).title }}</strong>
            </Tooltip>
          </template>
          <template #cell-source="{ item: strategy }">
            {{ strategyFromRow(strategy).source }}
          </template>
          <template #cell-factor="{ item: strategy }">
            <template v-if="strategyGaps(strategyFromRow(strategy)).length">
              <Tooltip v-for="gap in strategyGaps(strategyFromRow(strategy))" :key="gap.name" :content="platformGapTooltip(gap.name)" placement="top">
                <Button class="geo-gap-link" variant="text" size="sm" :aria-pressed="selectedGap === gap.name" @click="focusGap(gap.name)">
                  {{ gap.name }} · Gap {{ gap.value }}<AppIcon name="openExternal" :size="14" aria-hidden="true" />
                </Button>
              </Tooltip>
            </template>
            <span v-else>当前人设不直接加权，仍按基础优先级保留</span>
          </template>
          <template #cell-status="{ item: strategy }">
            <Tag :class="{ 'geo-review-status': canReviewStrategy(strategyFromRow(strategy)) }" :tone="(strategyFromRow(strategy).ignored || strategyFromRow(strategy).businessGapRecorded) ? 'neutral' : strategyNeedsReview(strategyFromRow(strategy)) ? 'orange' : 'green'" variant="soft" size="sm">
              {{ strategyCollaborationLabel(strategyFromRow(strategy)) }}
            </Tag>
          </template>
          <template #cell-actions="{ item: strategy }">
            <Button v-if="canReviewStrategy(strategyFromRow(strategy))" class="geo-table-detail-button geo-review-button" variant="secondary" size="md" type="button" @click="emit('openStrategy', strategyFromRow(strategy))">
              审核
            </Button><Button v-else-if="taskFor(strategyFromRow(strategy))" class="geo-table-detail-button" variant="secondary" size="md" type="button" @click="emit('confirmStrategy', strategyFromRow(strategy))">
              查看任务
            </Button>
          </template>
          <template #empty>
            <div class="geo-empty-state">
              <strong>{{ selectedGap ? '当前主题暂无关联策略' : '当前分类暂无策略' }}</strong><span>{{ selectedGap ? '可以查看其他主题，或清除主题筛选。' : '切换其他策略分层查看。' }}</span>
            </div>
          </template>
        </DataList>
      </div>
      <footer class="geo-panel__foot">
        <Pagination v-model="queuePage" :total="sortedStrategies.length" :page-size="pageSize" size="sm" label="候选策略分页" previous-label="策略上一页" next-label="策略下一页" :page-label="page => `策略第 ${page} 页`" :summary-text="summaryText" :format-value="String" />
      </footer>
    </section>
  </div>
</template>

<style scoped>
</style>

<style src="../../../styles/diagnosis-ui.css"></style>

