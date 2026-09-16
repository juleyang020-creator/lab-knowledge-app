<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { LibraryBook } from '../domain/library'
import ErrorPanel from './ErrorPanel.vue'
const props = defineProps<{ book: LibraryBook; page: number }>()
GlobalWorkerOptions.workerSrc = workerUrl
const host = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const busy = ref(true)
const error = ref('')
const renderedPage = ref<number | null>(null)
const zoom = ref(1)
let task: PDFDocumentLoadingTask | undefined
let pdf: PDFDocumentProxy | undefined
let rendering: RenderTask | undefined
let observer: ResizeObserver | undefined
let loadEpoch = 0
let renderEpoch = 0
let lastWidth = 0

async function renderPage(): Promise<void> {
  const epoch = ++renderEpoch
  rendering?.cancel()
  await rendering?.promise.catch(() => undefined)
  const document = pdf
  if (!document || !canvas.value || !host.value || epoch !== renderEpoch) return
  busy.value = true
  error.value = ''
  renderedPage.value = null
  try {
    const requestedPage = props.page
    const page = await document.getPage(requestedPage)
    if (epoch !== renderEpoch || !canvas.value || !host.value) return
    const natural = page.getViewport({ scale: 1 })
    const width = Math.max(240, host.value.clientWidth)
    const scale = (width / natural.width) * zoom.value
    const display = page.getViewport({ scale })
    const pixels = page.getViewport({ scale: scale * Math.min(2, window.devicePixelRatio || 1) })
    canvas.value.width = Math.ceil(pixels.width)
    canvas.value.height = Math.ceil(pixels.height)
    canvas.value.style.width = `${display.width}px`
    canvas.value.style.height = `${display.height}px`
    rendering = page.render({ canvas: canvas.value, viewport: pixels })
    await rendering.promise
    if (epoch === renderEpoch) renderedPage.value = requestedPage
  } catch {
    if (epoch === renderEpoch) error.value = '这一页未能显示，请重试，或使用“打开原始PDF”。'
  } finally {
    if (epoch === renderEpoch) busy.value = false
  }
}
async function load(): Promise<void> {
  const epoch = ++loadEpoch
  ++renderEpoch
  rendering?.cancel()
  pdf = undefined
  busy.value = true
  error.value = ''
  renderedPage.value = null
  await task?.destroy().catch(() => undefined)
  if (epoch !== loadEpoch) return
  try {
    const base = import.meta.env.BASE_URL
    task = getDocument({
      url: `${base}${props.book.asset}`,
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 256 * 1024,
      cMapUrl: `${base}pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
      wasmUrl: `${base}pdfjs/wasm/`,
    })
    const loaded = await task.promise
    if (epoch !== loadEpoch) return
    if (loaded.numPages !== props.book.pages) throw new Error('PDF page count mismatch')
    pdf = loaded
    await nextTick()
    await renderPage()
  } catch {
    if (epoch === loadEpoch) {
      error.value = '原文件读取失败或页数与目录不符，请重试。'
      busy.value = false
    }
  }
}
watch(
  () => [props.page, zoom.value],
  () => {
    void renderPage()
  },
)
onMounted(() => {
  void load()
  observer = new ResizeObserver(() => {
    const width = host.value?.clientWidth ?? 0
    if (width && Math.abs(width - lastWidth) > 1) {
      lastWidth = width
      if (pdf) void renderPage()
    }
  })
  if (host.value) observer.observe(host.value)
})
onBeforeUnmount(() => {
  ++loadEpoch
  ++renderEpoch
  observer?.disconnect()
  rendering?.cancel()
  void task?.destroy().catch(() => undefined)
})
</script>
<template>
  <div class="pdf-page">
    <div class="pdf-page-toolbar">
      <label
        >缩放
        <select v-model.number="zoom" aria-label="页面缩放">
          <option :value="1">适合屏幕</option>
          <option :value="1.5">150%</option>
          <option :value="2">200%</option>
        </select></label
      >
      <span v-if="busy" role="status">正在读取第{{ page }}页…</span>
    </div>
    <ErrorPanel v-if="error" :message="error" @retry="load" />
    <div ref="host" class="pdf-canvas-scroll" :aria-busy="busy">
      <canvas
        ref="canvas"
        v-show="renderedPage !== null && !error"
        :data-rendered-page="renderedPage"
        role="img"
        :aria-label="`${book.title} · PDF第${renderedPage ?? page}页原文`"
      />
    </div>
  </div>
</template>
