(() => {
  const checks = [
    ['通过', '一手来源核查', '关键事实均关联到一手来源（Mock 检查）'],
    ['通过', '品牌声音一致性', '语气与品牌表达规范一致（Mock 检查）'],
    ['通过', 'AI 特征短语清除', '未发现常见模板化表达（Mock 检查）'],
    ['通过', '原创视角检查', '内容包含独立观点（Mock 检查）'],
    ['通过', '链接有效性', '链接有效性检查通过（Mock 检查）'],
    ['通过', '无依据最高级表达', '未发现缺少依据的最高级表述（Mock 检查）'],
    ['未通过', '节奏与可读性', '检测到 1 处长句，建议拆分后重新检查（Mock 检查）'],
  ]

  const style = document.createElement('style')
  style.textContent = `
    .tw-review-insights__checks { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
    .tw-review-insights__check { display:grid; grid-template-columns:58px minmax(0,1fr); align-items:start; gap:10px; padding:10px 12px; border:1px solid var(--border-default); border-radius:9px; }
    .tw-review-insights__check > div { display:grid; gap:3px; min-width:0; }
    .tw-review-insights__check strong { color:var(--text-primary); font-size:13px; line-height:19px; }
    .tw-review-insights__check small { color:var(--text-secondary); font-size:12px; line-height:18px; }
    .tw-review-insights__status { display:inline-flex; justify-content:center; padding:2px 6px; border-radius:999px; font-size:11px; font-weight:650; line-height:18px; }
    .tw-review-insights__check.is-passed .tw-review-insights__status { background:var(--status-success-background); color:var(--status-success-foreground); }
    .tw-review-insights__check.is-failed { border-color:var(--status-warning-border); background:color-mix(in srgb,var(--status-warning-background) 30%,var(--background-primary)); }
    .tw-review-insights__check.is-failed .tw-review-insights__status { background:var(--status-warning-background); color:var(--status-warning-foreground); }
  `
  document.head.append(style)

  function apply() {
    document.querySelectorAll('.knowledge-notice .ce-alert__body').forEach((body) => {
      if (body.textContent.includes('请先确认摘要')) {
        body.textContent = ''
        body.style.display = 'none'
      }
    })

    document.querySelectorAll('.tw-review-insights__card').forEach((card) => {
      if (!card.querySelector('#tw-review-quality-title') || card.querySelector('.tw-review-insights__checks'))
        return

      const note = card.querySelector('.tw-review-insights__note')
      if (note)
        note.textContent = 'Mock 演示结果 · 6 项通过，1 项未通过'
      card.querySelector('.tw-review-insights__flag')?.remove()

      const list = document.createElement('ol')
      list.className = 'tw-review-insights__checks'
      list.setAttribute('aria-label', '七项质检结果')
      checks.forEach(([status, title, description]) => {
        const item = document.createElement('li')
        item.className = `tw-review-insights__check ${status === '通过' ? 'is-passed' : 'is-failed'}`
        const badge = document.createElement('span')
        badge.className = 'tw-review-insights__status'
        badge.textContent = status
        const detail = document.createElement('div')
        const heading = document.createElement('strong')
        heading.textContent = title
        const subtext = document.createElement('small')
        subtext.textContent = description
        detail.append(heading, subtext)
        item.append(badge, detail)
        list.append(item)
      })
      card.append(list)
    })
  }

  function start() {
    apply()
    new MutationObserver(apply).observe(document.body, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true })
  else
    start()
})()
