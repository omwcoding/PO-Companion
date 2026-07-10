<template>
  <div class="pad-grid">
    <PadCell
      v-for="slot in store.slots"
      :key="slot.id"
      :slot="slot"
      :isSelected="slot.id === store.selectedSlotId"
      :isPlaying="playingSlotId === slot.id"
      @tap="onPadTap"
      @longPress="onPadLongPress"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PadCell from './PadCell.vue'
import { useSampleStore } from '@/stores/useSampleStore'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useWaveformState } from '@/composables/useWaveformState'

const store = useSampleStore()
const engine = useAudioEngine()
const waveform = useWaveformState()

const playingSlotId = ref(0)

const emit = defineEmits<{
  (e: 'longPress', slotId: number): void
  (e: 'padSelected', slotId: number): void
}>()

async function onPadTap(slotId: number) {
  const slot = store.slots.find(s => s.id === slotId)
  if (!slot) return

  // Se il pad è già selezionato e assegnato → riproduce il preview
  if (slot.id === store.selectedSlotId && slot.isAssigned) {
    await previewPad(slot)
    return
  }

  // Seleziona il pad
  store.selectSlot(slotId)
  emit('padSelected', slotId)

  // Se il pad ha un sample, centra la waveform su di esso
  if (slot.isAssigned) {
    waveform.centerViewOn((slot.startMarker + slot.endMarker) / 2)
  }
}

function onPadLongPress(slotId: number) {
  store.selectSlot(slotId)
  emit('longPress', slotId)
}

async function previewPad(slot: typeof store.slots[0]) {
  if (!slot.isAssigned || !slot.sourceBufferId) return
  const audioBuffer = store.audioBuffers.get(slot.sourceBufferId)
  if (!audioBuffer) return

  playingSlotId.value = slot.id

  try {
    await engine.previewSlice(
      audioBuffer,
      slot.startMarker,
      slot.endMarker,
      slot.volume,
      slot.reversed
    )
  } finally {
    playingSlotId.value = 0
  }
}
</script>

<style scoped>
</style>
