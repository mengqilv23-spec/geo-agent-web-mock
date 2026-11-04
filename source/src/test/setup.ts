import { afterEach, vi } from 'vitest'

window.scrollTo = vi.fn()

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
}

if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
}

afterEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  document.documentElement.style.overflow = ''
  vi.useRealTimers()
})
