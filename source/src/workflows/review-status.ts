import type { GeoTask, ServiceMode, Strategy } from '../data/geo-data'

export function pendingReviewLabel(mode: ServiceMode) {
  return mode === 'agent' ? '待客户确认' : '待专家审核'
}

export function strategyReviewStatus(strategy: Strategy, tasks: GeoTask[], mode: ServiceMode) {
  if (mode === 'agent' && strategy.businessGapRecorded) return '业务能力缺口'
  if (strategy.ignored) return mode === 'agent' ? '本轮已终止' : '已忽略'
  if (tasks.some(task => task.strategy === strategy.id || task.relatedStrategies.includes(strategy.id))) return '已生成任务'
  if (strategy.confirmed) return '已通过'
  return pendingReviewLabel(mode)
}
