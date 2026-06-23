/**
 * useTouchGestures.ts
 * ───────────────────
 * Composable per la gestione unificata dei gesture touch/mouse su un canvas.
 * Supporta: drag (pan / marker drag), pinch (zoom), long press.
 */

import { ref, onUnmounted } from 'vue'

export interface GestureHandlers {
  /** Single touch/mouse drag — delta in pixel */
  onDrag?: (deltaX: number, deltaY: number, currentX: number, currentY: number) => void
  /** Drag iniziato — restituisce true se il punto tocca qualcosa di "draggable" */
  onDragStart?: (x: number, y: number) => boolean
  /** Drag terminato */
  onDragEnd?: (x: number, y: number) => void
  /** Tap / click singolo */
  onTap?: (x: number, y: number) => void
  /** Long press (> 500ms) */
  onLongPress?: (x: number, y: number) => void
  /** Pinch: factor > 1 = zoom out, < 1 = zoom in. centerX in pixel */
  onPinch?: (factor: number, centerX: number) => void
}

interface TouchState {
  startX: number
  startY: number
  lastX: number
  lastY: number
  moved: boolean
  longPressTimer: ReturnType<typeof setTimeout> | null
  isDragging: boolean
}

const LONG_PRESS_DURATION = 500
const MOVE_THRESHOLD = 5 // pixel prima di considerare un movimento

/**
 * Attacca i listener gesture a un elemento HTML (tipicamente un canvas).
 * Pulisce automaticamente quando il componente viene smontato.
 */
export function useTouchGestures(
  getElement: () => HTMLElement | null,
  handlers: GestureHandlers
) {
  const isActive = ref(false)

  // ── Touch state ────────────────────────────────────────────────────────────
  const touch1 = ref<TouchState | null>(null)
  const touch2Start = ref<{ x: number; y: number; dist: number } | null>(null)

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getElementOffset(el: HTMLElement, clientX: number, clientY: number) {
    const rect = el.getBoundingClientRect()
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  function getTouchDist(t1: Touch, t2: Touch) {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  function clearLongPress(state: TouchState) {
    if (state.longPressTimer !== null) {
      clearTimeout(state.longPressTimer)
      state.longPressTimer = null
    }
  }

  // ── Touch Handlers ─────────────────────────────────────────────────────────

  function onTouchStart(e: TouchEvent) {
    e.preventDefault()
    const el = getElement()
    if (!el) return

    if (e.touches.length === 1) {
      const t = e.touches[0]
      const { x, y } = getElementOffset(el, t.clientX, t.clientY)

      // Tenta un drag start — se l'handler conferma, entriamo in drag mode
      const draggable = handlers.onDragStart?.(x, y) ?? false

      const state: TouchState = {
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        moved: false,
        isDragging: draggable,
        longPressTimer: null,
      }

      // Avvia il timer per il long press solo se non siamo già in drag
      if (!draggable) {
        state.longPressTimer = setTimeout(() => {
          handlers.onLongPress?.(x, y)
          state.longPressTimer = null
        }, LONG_PRESS_DURATION)
      }

      touch1.value = state
      touch2Start.value = null

    } else if (e.touches.length === 2 && touch1.value) {
      // Inizia il pinch
      clearLongPress(touch1.value)
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dist = getTouchDist(t1, t2)
      const cx = (t1.clientX + t2.clientX) / 2
      const el2 = getElement()
      const centerX = el2 ? cx - el2.getBoundingClientRect().left : cx
      touch2Start.value = { x: centerX, y: 0, dist }
    }
  }

  function onTouchMove(e: TouchEvent) {
    e.preventDefault()
    const el = getElement()
    if (!el || !touch1.value) return

    if (e.touches.length === 2 && touch2Start.value) {
      // Pinch zoom
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const newDist = getTouchDist(t1, t2)
      const factor = touch2Start.value.dist / newDist // > 1 = zoom out
      const cx = (t1.clientX + t2.clientX) / 2
      const centerX = cx - el.getBoundingClientRect().left
      handlers.onPinch?.(factor, centerX)
      touch2Start.value.dist = newDist
      return
    }

    if (e.touches.length === 1) {
      const t = e.touches[0]
      const { x, y } = getElementOffset(el, t.clientX, t.clientY)
      const state = touch1.value
      const dx = x - state.lastX
      const dy = y - state.lastY
      const totalDx = Math.abs(x - state.startX)
      const totalDy = Math.abs(y - state.startY)

      if (!state.moved && (totalDx > MOVE_THRESHOLD || totalDy > MOVE_THRESHOLD)) {
        state.moved = true
        clearLongPress(state)
      }

      if (state.moved || state.isDragging) {
        handlers.onDrag?.(dx, dy, x, y)
      }

      state.lastX = x
      state.lastY = y
    }
  }

  function onTouchEnd(e: TouchEvent) {
    e.preventDefault()
    const state = touch1.value
    if (!state) return

    clearLongPress(state)

    if (e.touches.length === 0) {
      const { x, y } = { x: state.lastX, y: state.lastY }
      handlers.onDragEnd?.(x, y)

      if (!state.moved && !state.isDragging) {
        handlers.onTap?.(state.startX, state.startY)
      }
      touch1.value = null
      touch2Start.value = null
    }
  }

  // ── Mouse Handlers (Desktop) ───────────────────────────────────────────────

  let mouseState: TouchState | null = null

  function onMouseDown(e: MouseEvent) {
    const el = getElement()
    if (!el) return
    const { x, y } = getElementOffset(el, e.clientX, e.clientY)

    const draggable = handlers.onDragStart?.(x, y) ?? false

    mouseState = {
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      moved: false,
      isDragging: draggable,
      longPressTimer: null,
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent) {
    if (!mouseState) return
    const el = getElement()
    if (!el) return
    const { x, y } = getElementOffset(el, e.clientX, e.clientY)
    const dx = x - mouseState.lastX
    const dy = y - mouseState.lastY
    const totalDx = Math.abs(x - mouseState.startX)
    const totalDy = Math.abs(y - mouseState.startY)

    if (!mouseState.moved && (totalDx > MOVE_THRESHOLD || totalDy > MOVE_THRESHOLD)) {
      mouseState.moved = true
    }

    if (mouseState.moved || mouseState.isDragging) {
      handlers.onDrag?.(dx, dy, x, y)
    }

    mouseState.lastX = x
    mouseState.lastY = y
  }

  function onMouseUp() {
    if (!mouseState) return
    const x = mouseState.lastX
    const y = mouseState.lastY

    handlers.onDragEnd?.(x, y)

    if (!mouseState.moved && !mouseState.isDragging) {
      handlers.onTap?.(mouseState.startX, mouseState.startY)
    }

    mouseState = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const el = getElement()
    if (!el) return
    const { x } = getElementOffset(el, e.clientX, e.clientY)
    // deltaY > 0 = scroll down = zoom out
    const factor = e.deltaY > 0 ? 1.15 : 0.87
    handlers.onPinch?.(factor, x)
  }

  // ── Attach / Detach ────────────────────────────────────────────────────────

  function attach() {
    const el = getElement()
    if (!el || isActive.value) return

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: false })
    el.addEventListener('touchcancel', onTouchEnd, { passive: false })
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('wheel', onWheel, { passive: false })

    isActive.value = true
  }

  function detach() {
    const el = getElement()
    if (el) {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('wheel', onWheel)
    }
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    isActive.value = false
  }

  onUnmounted(detach)

  return { attach, detach, isActive }
}
