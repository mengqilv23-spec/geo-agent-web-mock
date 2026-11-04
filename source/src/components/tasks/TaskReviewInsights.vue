<template>
  <aside class="tw-review-insights" data-test="review-insights" aria-label="段落问题与自动质检">
    <section class="tw-review-insights__card" aria-labelledby="tw-review-issues-title">
      <header class="tw-review-insights__head">
        <h3 id="tw-review-issues-title">
          段落问题
        </h3>
        <span class="tw-review-insights__count">1</span>
      </header>
      <div class="tw-review-insights__issue">
        <strong>可读性与节奏</strong>
        <span>1处长句建议人工确认</span>
      </div>
    </section>

    <section class="tw-review-insights__card" aria-labelledby="tw-review-quality-title">
      <header class="tw-review-insights__head">
        <h3 id="tw-review-quality-title">
          七项自动质检
        </h3>
        <span class="tw-review-insights__score">6/7 通过</span>
      </header>
      <p class="tw-review-insights__note">
        问题段落已标色
      </p>
      <span class="tw-review-insights__flag">! 可读性与节奏</span>
    </section>
  </aside>
</template>

<style scoped>
.tw-review-insights { display:grid; align-content:start; gap:16px; min-width:0; }
.tw-review-insights__card { display:grid; gap:14px; padding:16px; border:1px solid var(--border-default); border-radius:12px; background:var(--background-primary); }
.tw-review-insights__head { display:flex; min-width:0; align-items:center; gap:8px; }
.tw-review-insights__head h3 { margin:0; color:var(--text-primary); font-size:16px; font-weight:650; line-height:24px; }
.tw-review-insights__count,.tw-review-insights__score { display:inline-flex; flex:none; align-items:center; padding:2px 8px; border-radius:999px; background:var(--status-warning-background); color:var(--status-warning-foreground); font-size:12px; font-weight:650; line-height:20px; }
.tw-review-insights__issue { display:grid; gap:6px; padding:12px; border:1px solid var(--status-warning-border); border-radius:9px; background:color-mix(in srgb,var(--status-warning-background) 46%,var(--background-primary)); color:var(--text-secondary); font-size:14px; line-height:21px; }
.tw-review-insights__issue strong { color:var(--status-warning-foreground); font-size:13px; }
.tw-review-insights__note { margin:0; color:var(--text-muted); font-size:12px; line-height:18px; }
.tw-review-insights__flag { overflow:hidden; padding:6px 9px; border-radius:7px; background:var(--status-warning-background); color:var(--status-warning-foreground); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
</style>
