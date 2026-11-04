import type { GeoTask, ServiceMode, Strategy } from '../data/geo-data'

export function pendingReviewLabel(mode: ServiceMode) {
  const reviewer = mode === 'agent' ? '客户' : '专家'
  return `待${reviewer}审核`
}

export function strategyReviewStatus(strategy: Strategy, tasks: GeoTask[], mode: ServiceMode) {
  if (mode === 'agent' && strategy.businessGapRecorded) return '业务能力缺口'
  if (strategy.ignored) return mode === 'agent' ? '本轮已终止' : '已忽略'
  if (tasks.some(task => task.strategy === strategy.id || task.relatedStrategies.includes(strategy.id))) return '已生成任务'
  if (strategy.confirmed) return '已通过'
  if (mode === 'managed' && strategy.reviewStage === 'customer') return '待客户审核'
  return pendingReviewLabel(mode)
}

