import type { AuditFinding } from '../data/geo-data'

export function isAdviceFinding(finding: AuditFinding) {
  return finding.route === 'advice'
}

export function isKnowledgeFinding(finding: AuditFinding) {
  return finding.route === 'knowledge'
}

export function isReadOnlyFinding(finding: AuditFinding) {
  return isAdviceFinding(finding) || isKnowledgeFinding(finding)
}

export function findingRouteLabel(finding: AuditFinding, _clientMode = false) {
  if (isKnowledgeFinding(finding)) return '官网内容 · 待补充知识'
  if (isAdviceFinding(finding))
    return `${finding.category === '官网结构' ? '官网技术与结构' : finding.category ?? '官网内容'} · 仅提供建议`
  if (finding.route === 'strategy')
    return '官网内容 · 需要审核'
  if (finding.id === 'F9')
    return '官网内容 · 需要审核'
  return '官网技术与结构 · 直接处理'
}

export function findingHasTask(finding: AuditFinding, strategies: readonly import('../data/geo-data').Strategy[], tasks: readonly import('../data/geo-data').GeoTask[], includeRepair = false) {
  if (finding.category === '官网内容' && finding.route === 'strategy')
    return tasks.some(task => task.sourceKind === 'geo-audit-content' && task.source === finding.id)
  if (includeRepair && finding.id === 'F9') return tasks.some(task => task.source.split(/[\s/·]+/).includes(finding.id))
  if (includeRepair && finding.route === 'strategy' && tasks.some(task => task.source.split(/[\s/·]+/).includes(finding.id))) return true
  if (finding.route !== 'strategy') return false
  const strategy = strategies.find(item => item.source.split(' / ').includes(finding.id) || (/专家|作者/.test(finding.title) && item.id === 'GS14'))
  return Boolean(strategy && tasks.some(task => task.strategy === strategy.id || task.relatedStrategies.includes(strategy.id)))
}

