<script setup lang="ts">
import type { GeoTask } from '../data/geo-data'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkbenchTasksStore } from '../stores/workbench-tasks'

const route = useRoute()
const taskId = String(route.params.taskId || '')
const taskStore = useWorkbenchTasksStore()

function storedTask(): GeoTask | undefined {
  if (typeof window === 'undefined') return undefined
  for (const mode of ['managed', 'agent']) {
    try {
      const snapshot = JSON.parse(window.localStorage.getItem(`geo-workbench:${mode}`) || '{}') as { tasks?: GeoTask[] }
      const match = snapshot.tasks?.find(item => item.id === taskId)
      if (match) return match
    }
    catch { /* Fall back to the in-memory task. */ }
  }
}

const task = computed(() => taskStore.findTask(taskId) ?? storedTask())
const title = computed(() => task.value?.workflow?.output.title || task.value?.name || '发布内容预览')
const body = computed(() => task.value?.workflow?.output.body || '预览内容尚未生成。')
const paragraphs = computed(() => body.value.split(/\n{2,}/).map(value => value.trim()).filter(Boolean))
const version = computed(() => task.value?.workflow?.output.revision ?? 1)
</script>

<template>
  <div class="task-preview-page">
    <header class="task-preview-bar">
      <div><strong>APW Waterjet</strong><span>发布内容预览 · {{ taskId }} · V{{ version }}</span></div>
      <button type="button" @click="$router.back()">关闭预览</button>
    </header>
    <main v-if="task" class="task-preview-document">
      <span class="task-preview-badge">预览环境 · 尚未发布</span>
      <h1>{{ title }}</h1>
      <p class="task-preview-meta">此链接用于客户核对官网即将发布的内容，确认发布前不会影响线上内容。</p>
      <article>
        <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
      </article>
    </main>
    <main v-else class="task-preview-document"><h1>预览内容不可用</h1><p>请返回任务详情，等待官网重新生成预览链接。</p></main>
  </div>
</template>

<style scoped>
.task-preview-page { min-height:100vh; background:#f5f7fb; color:#1d2433; font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif; }
.task-preview-bar { display:flex; min-height:64px; align-items:center; justify-content:space-between; gap:20px; padding:0 32px; border-bottom:1px solid #e2e6ee; background:#fff; }
.task-preview-bar div { display:flex; align-items:baseline; gap:14px; }
.task-preview-bar strong { font-size:18px; }
.task-preview-bar span { color:#7b879b; font-size:13px; }
.task-preview-bar button { padding:8px 14px; border:1px solid #d8deea; border-radius:8px; background:#fff; color:#4053ff; font:inherit; cursor:pointer; }
.task-preview-document { box-sizing:border-box; width:min(920px,calc(100% - 32px)); margin:32px auto; padding:48px 56px 64px; border:1px solid #e1e6ef; border-radius:14px; background:#fff; box-shadow:0 10px 34px rgb(35 48 83 / 7%); }
.task-preview-badge { display:inline-flex; padding:5px 9px; border-radius:6px; background:#eef1ff; color:#4053ff; font-size:12px; font-weight:650; }
h1 { margin:20px 0 10px; font-size:34px; line-height:1.35; }
.task-preview-meta { margin:0 0 34px; padding-bottom:24px; border-bottom:1px solid #e6eaf1; color:#7b879b; font-size:14px; }
article { color:#384457; font-size:16px; line-height:1.9; }
article p { margin:0 0 20px; white-space:pre-wrap; }
@media(max-width:640px) { .task-preview-bar { padding:0 16px; }.task-preview-bar div { display:grid; gap:1px; }.task-preview-document { margin:16px auto; padding:28px 22px 40px; }h1 { font-size:26px; } }
</style>
