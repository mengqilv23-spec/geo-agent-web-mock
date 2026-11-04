<script setup lang="ts">
import { Color, TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  editable?: boolean
  label?: string
  heading?: string
  fullWidth?: boolean
  aiOptimize?: boolean
  aiCallsRemaining?: number
}>(), {
  editable: true,
  label: '内容正文',
  heading: '',
  fullWidth: false,
  aiOptimize: false,
  aiCallsRemaining: 2,
})
const emit = defineEmits<{ 'update:modelValue': [value: string], 'ai-call': [] }>()
defineSlots<{ supplement?: () => any }>()

function editorContent(value: string) {
  if (!value)
    return '<p></p>'
  if (/<(?:p|h[1-6]|ul|ol|blockquote|div)\b/i.test(value))
    return value
  return value.split('\n').map(line => `<p>${line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') || '<br>'}</p>`).join('')
}

const editor = useEditor({
  content: editorContent(props.modelValue),
  editable: props.editable,
  extensions: [StarterKit.configure({ link: false, italic: { HTMLAttributes: { class: 'task-rich-italic' } } }), TextStyle, Color.configure({ types: ['textStyle'] })],
  onUpdate: ({ editor: currentEditor }) => emit('update:modelValue', currentEditor.getHTML()),
})

const aiPanelOpen = ref(false)
const aiPreviewOpen = ref(false)
const aiInstruction = ref('')
const selectedText = ref('')
const previewText = ref('')
const selectionRange = ref<{ from: number, to: number } | null>(null)
const optimizationScope = ref<'paragraph' | 'article'>('paragraph')
const aiError = ref('')

watch(() => props.modelValue, (value) => {
  if (editor.value && value !== editor.value.getHTML())
    editor.value.commands.setContent(editorContent(value), { emitUpdate: false })
})
watch(() => props.editable, value => editor.value?.setEditable(value))

function run(command: 'bold' | 'italic' | 'underline' | 'bulletList' | 'orderedList' | 'blockquote' | 'undo' | 'redo' | 'heading' | 'paragraph') {
  if (!editor.value)
    return
  const chain = editor.value.chain().focus()
  if (command === 'heading')
    chain.toggleHeading({ level: 2 }).run()
  else if (command === 'paragraph')
    chain.setParagraph().run()
  else if (command === 'bold')
    chain.toggleBold().run()
  else if (command === 'italic')
    chain.toggleItalic().run()
  else if (command === 'underline')
    chain.toggleUnderline().run()
  else if (command === 'bulletList')
    chain.toggleBulletList().run()
  else if (command === 'orderedList')
    chain.toggleOrderedList().run()
  else if (command === 'blockquote')
    chain.toggleBlockquote().run()
  else if (command === 'undo')
    chain.undo().run()
  else
    chain.redo().run()
}

const controls = [
  { label: '加粗', command: 'bold', mark: 'bold' },
  { label: '斜体', command: 'italic', mark: 'italic' },
  { label: '下划线', command: 'underline', mark: 'underline' },
  { label: '二级标题', command: 'heading', mark: 'heading' },
  { label: '正文', command: 'paragraph', mark: 'paragraph' },
  { label: '项目符号列表', command: 'bulletList', mark: 'bulletList' },
  { label: '编号列表', command: 'orderedList', mark: 'orderedList' },
  { label: '引用', command: 'blockquote', mark: 'blockquote' },
] as const

function setTextColor(event: Event) {
  const color = (event.target as HTMLInputElement).value
  editor.value?.chain().focus().setColor(color).run()
}

function focusEditor() {
  editor.value?.commands.focus()
}

function openAiOptimize(scope: 'paragraph' | 'article' = 'paragraph') {
  const current = editor.value
  if (!current)
    return
  const selection = current.state.selection
  if (scope === 'article') {
    selectionRange.value = { from: 0, to: current.state.doc.content.size }
    selectedText.value = current.getText({ blockSeparator: '\n\n' })
  }
  else if (!selection.empty) {
    selectionRange.value = { from: selection.from, to: selection.to }
    selectedText.value = current.state.doc.textBetween(selection.from, selection.to, '\n')
  }
  else if (selection.$from.parent.isTextblock) {
    selectionRange.value = { from: selection.$from.start(), to: selection.$from.end() }
    selectedText.value = selection.$from.parent.textContent
  }
  else {
    aiError.value = '请先选中需要优化的段落或文字。'
    aiPanelOpen.value = true
    return
  }
  aiError.value = ''
  optimizationScope.value = scope
  aiInstruction.value = ''
  previewText.value = selectedText.value
  aiPreviewOpen.value = false
  aiPanelOpen.value = true
}

function useSuggestion(value: string) {
  aiInstruction.value = aiInstruction.value ? `${aiInstruction.value}；${value}` : value
}

function generatePreview() {
  if (props.aiCallsRemaining <= 0) {
    aiError.value = '本篇内容在当前角色下的 AI 优化次数已用完。'
    aiPreviewOpen.value = false
    return
  }
  if (!aiInstruction.value.trim()) {
    aiError.value = '请先填写希望 AI 如何调整。'
    return
  }
  emit('ai-call')
  // This prototype exposes the complete review flow without invoking a generation service.
  previewText.value = selectedText.value
  aiError.value = ''
  aiPreviewOpen.value = true
}

function replaceSelectedText() {
  const current = editor.value
  const range = selectionRange.value
  if (!current || !range || !previewText.value.trim())
    return
  if (optimizationScope.value === 'article') {
    current.commands.setContent(editorContent(previewText.value))
  }
  else {
    current.chain().focus().insertContentAt(range, previewText.value).run()
  }
  aiPanelOpen.value = false
  aiPreviewOpen.value = false
  selectionRange.value = null
}

defineExpose({ focusEditor })
</script>

<template>
  <section class="task-rich-editor" :class="{ 'is-editable': editable }" :aria-label="label">
    <div v-if="editable" class="task-rich-editor__toolbar" role="toolbar" aria-label="正文格式">
      <button
        v-for="control in controls"
        :key="control.command"
        type="button"
        :aria-label="control.label"
        :aria-pressed="editor?.isActive(control.mark) ?? false"
        :title="control.label"
        :aria-keyshortcuts="control.command === 'bold' ? 'Control+B Meta+B' : control.command === 'italic' ? 'Control+I Meta+I' : control.command === 'underline' ? 'Control+U Meta+U' : undefined"
        @mousedown.prevent
        @click="run(control.command)"
      >
        {{ control.command === 'heading' ? '标题' : control.command === 'paragraph' ? '正文' : control.command === 'bold' ? 'B' : control.command === 'italic' ? 'I' : control.command === 'underline' ? 'U' : control.command === 'bulletList' ? '• 列表' : control.command === 'orderedList' ? '1. 列表' : '引用' }}
      </button>
      <span class="task-rich-editor__divider" aria-hidden="true" />
      <button type="button" aria-label="撤销" title="撤销（⌘/Ctrl+Z）" aria-keyshortcuts="Control+Z Meta+Z" @mousedown.prevent @click="run('undo')">
        ↶
      </button>
      <button type="button" aria-label="重做" title="重做（⌘/Ctrl+Shift+Z）" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" @mousedown.prevent @click="run('redo')">
        ↷
      </button>
      <label class="task-rich-editor__color" title="选择文字颜色">
        <span aria-hidden="true">A</span>
        <input type="color" aria-label="文字颜色" value="#1D2129" @input="setTextColor">
      </label>
      <span v-if="aiOptimize" class="task-rich-editor__divider" aria-hidden="true" />
      <button v-if="aiOptimize" type="button" class="task-rich-editor__ai-trigger" data-test="open-ai-optimize" @mousedown.prevent @click="openAiOptimize('paragraph')">
        <span aria-hidden="true">✦</span> AI 优化选中段落
      </button>
      <button v-if="aiOptimize" type="button" class="task-rich-editor__ai-regenerate" data-test="regenerate-article" @mousedown.prevent @click="openAiOptimize('article')">
        重新生成文章
      </button>
      <span v-if="aiOptimize" class="task-rich-editor__ai-quota" data-test="ai-quota" aria-live="polite">剩余 {{ aiCallsRemaining }}/2 次</span>
      <span class="task-rich-editor__shortcut-hint" data-test="editor-shortcuts">快捷键：⌘/Ctrl+B 加粗 · ⌘/Ctrl+I 斜体 · ⌘/Ctrl+U 下划线 · ⌘/Ctrl+Z 撤销</span>
    </div>
    <section v-if="aiPanelOpen" class="task-rich-editor__ai-panel" data-test="ai-optimize-panel" aria-label="段落 AI 优化">
      <header class="task-rich-editor__ai-head">
        <div><strong>{{ optimizationScope === 'article' ? '重新生成文章' : '优化选中内容' }}</strong><span>{{ optimizationScope === 'article' ? '沿用当前任务策略、Brief 和已确认事实生成新稿' : '保留原意和事实，仅调整选中段落' }}</span></div>
        <button type="button" aria-label="关闭 AI 优化" @click="aiPanelOpen = false">×</button>
      </header>
      <p v-if="aiError" class="task-rich-editor__ai-error" role="alert">{{ aiError }}</p>
      <template v-else>
        <div class="task-rich-editor__ai-source"><span>{{ optimizationScope === 'article' ? '当前文章' : '当前段落' }}</span><p>{{ selectedText }}</p></div>
        <label class="task-rich-editor__ai-label" for="task-ai-instruction">优化要求</label>
        <textarea id="task-ai-instruction" v-model="aiInstruction" rows="2" placeholder="写下希望如何调整；请只补充已确认的事实。" />
        <div class="task-rich-editor__ai-suggestions" aria-label="常用优化方向">
          <button type="button" @click="useSuggestion('表达更专业')">表达更专业</button>
          <button type="button" @click="useSuggestion('突出产品优势')">突出产品优势</button>
          <button type="button" @click="useSuggestion('补充专家视角')">补充专家视角</button>
        </div>
        <div class="task-rich-editor__ai-foot">
          <small>本次优化会计入内容生成额度</small>
          <button type="button" class="task-rich-editor__ai-generate" data-test="generate-ai-preview" :disabled="aiCallsRemaining <= 0" @click="generatePreview">生成优化稿 · 剩余 {{ aiCallsRemaining }} 次</button>
        </div>
        <div v-if="aiPreviewOpen" class="task-rich-editor__ai-preview" data-test="ai-optimize-preview">
          <div class="task-rich-editor__ai-preview-head"><strong>优化稿预览</strong><span>交互原型 · 生成服务待接入</span></div>
          <textarea v-model="previewText" rows="4" aria-label="优化稿预览内容" />
          <div class="task-rich-editor__ai-preview-actions">
            <button type="button" @click="aiPanelOpen = false">保留原文</button>
            <button type="button" class="task-rich-editor__ai-generate" data-test="replace-selected-text" :disabled="!previewText.trim()" @click="replaceSelectedText">替换选中内容</button>
          </div>
        </div>
      </template>
    </section>
    <slot v-if="$slots.supplement" name="supplement" />
    <article class="task-rich-editor__page" :class="{ 'is-full-width': fullWidth }">
      <h1 v-if="heading">
        {{ heading }}
      </h1>
      <EditorContent :editor="editor" class="task-rich-editor__content" />
    </article>
  </section>
</template>

<style scoped>
.task-rich-editor {
  overflow: hidden;
  border: 1px solid var(--border, #dce3ef);
  border-radius: 10px;
  background: #fff;
}

.task-rich-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e4e9f1);
  background: #f8faff;
}

.task-rich-editor__toolbar button {
  display: inline-grid;
  min-width: 32px;
  min-height: 32px;
  padding: 0 8px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #4c5a70;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
}

.task-rich-editor__toolbar button:hover,
.task-rich-editor__toolbar button[aria-pressed="true"] {
  background: var(--action-subtle-background, #f2f3fd);
  color: var(--action-accent);
}

.task-rich-editor__toolbar button:focus-visible {
  outline: 2px solid var(--action-accent);
  outline-offset: 1px;
}

.task-rich-editor__divider {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: #dce3ef;
}

.task-rich-editor__toolbar button.task-rich-editor__ai-trigger, .task-rich-editor__toolbar button.task-rich-editor__ai-regenerate { display: inline-flex; min-height: 30px; align-items: center; gap: 6px; padding: 0 10px; border: 1px solid #d8ddff; background: #fff; color: var(--action-accent); font-size: 12px; font-weight: 600; }
.task-rich-editor__toolbar button.task-rich-editor__ai-regenerate { border-color: var(--action-accent); background: var(--action-accent); color: #fff; }
.task-rich-editor__ai-quota { margin-left: 2px; color: #77849a; font-size: 11px; white-space: nowrap; }
.task-rich-editor__ai-panel { display: grid; gap: 10px; margin: 12px 14px; padding: 14px; border: 1px solid #dce2f0; border-radius: 10px; background: #fbfcff; }
.task-rich-editor__ai-head, .task-rich-editor__ai-foot, .task-rich-editor__ai-preview-head, .task-rich-editor__ai-preview-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.task-rich-editor__ai-head > div { display: grid; gap: 2px; }
.task-rich-editor__ai-head strong, .task-rich-editor__ai-preview-head strong { color: #1d2129; font-size: 13px; }
.task-rich-editor__ai-head span, .task-rich-editor__ai-preview-head span, .task-rich-editor__ai-foot small { color: #77849a; font-size: 11px; }
.task-rich-editor__ai-head > button { border: 0; background: transparent; color: #77849a; font-size: 20px; cursor: pointer; }
.task-rich-editor__ai-source { padding: 9px 10px; border-radius: 7px; background: #f1f3f8; }
.task-rich-editor__ai-source span, .task-rich-editor__ai-label { color: #77849a; font-size: 11px; font-weight: 600; }
.task-rich-editor__ai-source p { max-height: 54px; margin: 3px 0 0; overflow: auto; color: #46546a; font-size: 12px; line-height: 18px; white-space: pre-wrap; }
.task-rich-editor__ai-label { margin-bottom: -6px; }
.task-rich-editor__ai-panel textarea { box-sizing: border-box; width: 100%; resize: vertical; padding: 8px 10px; border: 1px solid #dce3ef; border-radius: 7px; background: white; color: #1d2129; font: inherit; font-size: 12px; line-height: 18px; }
.task-rich-editor__ai-suggestions { display: flex; flex-wrap: wrap; gap: 6px; }
.task-rich-editor__ai-suggestions button, .task-rich-editor__ai-preview-actions > button:first-child { min-height: 27px; padding: 3px 9px; border: 1px solid #dce3ef; border-radius: 999px; background: white; color: #53627a; font: inherit; font-size: 11px; cursor: pointer; }
.task-rich-editor__ai-generate { min-height: 30px; padding: 4px 11px; border: 1px solid var(--action-accent); border-radius: 7px; background: var(--action-accent); color: white; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.task-rich-editor__ai-generate:disabled { opacity: .45; cursor: not-allowed; }
.task-rich-editor__ai-error { margin: 0; color: #c34539; font-size: 12px; }
.task-rich-editor__ai-preview { display: grid; gap: 8px; padding-top: 10px; border-top: 1px solid #e6eaf2; }
.task-rich-editor__ai-preview-actions { justify-content: flex-end; }

.task-rich-editor__color {
  position: relative;
  display: inline-flex;
  width: 34px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-primary, #1d2129);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.task-rich-editor__color::after {
  position: absolute;
  right: 8px;
  bottom: 4px;
  left: 8px;
  height: 3px;
  border-radius: 2px;
  background: var(--action-accent, #4152f6);
  content: '';
}

.task-rich-editor__color:hover { background: var(--action-subtle-background, #f2f3fd); }
.task-rich-editor__color input { position: absolute; width: 1px; height: 1px; opacity: 0; }

.task-rich-editor__shortcut-hint {
  margin-left: auto;
  color: var(--text-muted, #86909c);
  font-size: 12px;
  line-height: 1.5;
}

.task-rich-editor__content :deep(.ProseMirror) {
  min-height: 240px;
  margin: 0;
  padding: 12px 56px 48px;
  background: transparent;
  color: var(--text, #29364b);
  font-size: 16px;
  line-height: 1.8;
  outline: none;
}

.task-rich-editor__page { max-width: 880px; margin: 24px auto; border: 1px solid var(--border, #e5e6eb); border-radius: 12px; background:#fff; box-shadow:0 1px 3px rgb(29 33 41 / 5%); }
.task-rich-editor__page.is-full-width { width:100%; max-width:none; margin:16px 0 0; }
.task-rich-editor__page:has(.ProseMirror:focus-visible) { border-color:var(--focus-ring, #4152f6); box-shadow:0 0 0 2px rgb(65 82 246 / 12%); }
.task-rich-editor__page > h1 { margin:0; padding:40px 56px 8px; color:var(--text-primary, #1d2129); font-size:26px; line-height:1.35; }
.task-rich-editor__content :deep(.ProseMirror h1) { font-size: 1.7em; line-height: 1.3; }
.task-rich-editor__content :deep(.ProseMirror h2) { font-size: 1.35em; line-height: 1.4; }
.task-rich-editor__content :deep(.ProseMirror em.task-rich-italic) { font-style: italic; font-style: oblique 12deg; font-synthesis: style; }

.task-rich-editor__content :deep(.ProseMirror > :first-child) {
  margin-top: 0;
}

.task-rich-editor__content :deep(.ProseMirror > :last-child) {
  margin-bottom: 0;
}

.task-rich-editor__content :deep(.ProseMirror h2) {
  margin: 1.2em 0 0.5em;
  font-size: 1.15em;
}

.task-rich-editor__content :deep(.ProseMirror ul),
.task-rich-editor__content :deep(.ProseMirror ol) {
  padding-left: 1.5em;
}

.task-rich-editor__content :deep(.ProseMirror blockquote) {
  margin-left: 0;
  padding-left: 12px;
  border-left: 3px solid #b9c8fb;
  color: #687790;
}

@media (max-width: 760px) {
  .task-rich-editor__page { margin:12px; }
  .task-rich-editor__page > h1 { padding:24px 20px 8px; font-size:22px; }
  .task-rich-editor__content :deep(.ProseMirror) { padding:8px 20px 24px; }
  .task-rich-editor__shortcut-hint { width: 100%; margin-left: 0; }
}
</style>
