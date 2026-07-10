<template>
  <div class="budget-meter">
    <!-- Barra principale -->
    <div class="budget-bar" ref="barRef">
      <!-- Pre-roll -->
      <div
        class="budget-segment pre-roll"
        :style="{ width: `${preRollPct}%` }"
        title="Pre-roll silence"
      />

      <!-- Segmenti pad -->
      <template v-for="(seg, i) in segments" :key="seg.slotId">
        <div
          class="budget-segment pad-segment"
          :style="{ width: `${seg.widthPct}%`, '--seg-color': seg.color }"
          :title="`Pad ${seg.slotId}: ${seg.duration.toFixed(2)}s`"
          @click="store.selectSlot(seg.slotId)"
        />
        <!-- Gap -->
        <div
          v-if="i < segments.length - 1"
          class="budget-segment gap"
          :style="{ width: `${gapPct}%` }"
          title="Gap"
        />
      </template>

      <!-- Free space -->
      <div class="budget-free" :style="{ flex: 1 }" />

      <!-- Overflow indicator -->
      <div v-if="store.isOverBudget" class="budget-overflow-indicator" />
    </div>

    <!-- Labels -->
    <div class="budget-labels">
      <div class="budget-used" :class="{ 'over-budget': store.isOverBudget }">
        <span class="used-value">{{ usedSeconds.toFixed(1) }}s</span>
        <span class="separator">/</span>
        <span class="total-value">40.0s</span>
      </div>

      <div class="budget-free-label">
        <span v-if="store.isOverBudget" class="over-label">
          ⚠ +{{ overSeconds.toFixed(1) }}s
        </span>
        <span v-else class="free-label">
          {{ freeSeconds.toFixed(1) }}s free
        </span>
      </div>
    </div>

    <!-- Per-pad breakdown mini-labels -->
    <div v-if="segments.length > 0" class="budget-breakdown">
      <div
        v-for="seg in segments"
        :key="seg.slotId"
        class="breakdown-item"
        :style="{ '--seg-color': seg.color }"
        @click="store.selectSlot(seg.slotId)"
      >
        <span class="breakdown-dot" />
        <span class="breakdown-text">P{{ seg.slotId }}: {{ seg.duration.toFixed(2) }}s</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSampleStore } from '@/stores/useSampleStore'

const store = useSampleStore()

const PO33_MAX_SECONDS = 40.0

const PAD_COLORS = [
  '#FF6B2B', '#FFD93D', '#00E5FF', '#00E676',
  '#FF5252', '#B388FF', '#FF80AB', '#69F0AE',
  '#40C4FF', '#FFAB40', '#E040FB', '#F50057',
  '#64FFDA', '#EEFF41', '#FF6D00', '#18FFFF',
]

// ── Computed ──────────────────────────────────────────────────────────────────

const preRollSec = computed(() => store.settings.prefixSilenceMs / 1000)
const gapSec = computed(() => store.settings.gapDurationMs / 1000)
const usedSeconds = computed(() => store.estimatedDurationSeconds)
const freeSeconds = computed(() => Math.max(0, PO33_MAX_SECONDS - usedSeconds.value))
const overSeconds = computed(() => Math.max(0, usedSeconds.value - PO33_MAX_SECONDS))

// Percentuali riferite al massimo
const preRollPct = computed(() => (preRollSec.value / PO33_MAX_SECONDS) * 100)
const gapPct = computed(() => (gapSec.value / PO33_MAX_SECONDS) * 100)

interface Segment {
  slotId: number
  duration: number
  widthPct: number
  color: string
}

const segments = computed<Segment[]>(() => {
  const maxSec = Math.max(PO33_MAX_SECONDS, usedSeconds.value)
  return store.assignedSlots.map(slot => ({
    slotId: slot.id,
    duration: slot.endMarker - slot.startMarker,
    widthPct: ((slot.endMarker - slot.startMarker) / maxSec) * 100,
    color: PAD_COLORS[(slot.id - 1) % PAD_COLORS.length],
  }))
})
</script>

<style scoped>
</style>
