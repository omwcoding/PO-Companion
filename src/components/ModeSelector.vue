<template>
  <div class="mode-selector">
    <button
      class="mode-btn"
      :class="{ active: store.settings.slotMode === 'drum' }"
      @click="setMode('drum')"
    >
      🥁 Drum
    </button>
    <button
      class="mode-btn"
      :class="{ active: store.settings.slotMode === 'melodic' }"
      @click="setMode('melodic')"
    >
      🎹 Melodic
    </button>

    <!-- Info tooltip -->
    <div class="mode-info" :class="store.settings.slotMode">
      <span v-if="store.settings.slotMode === 'drum'">
        Auto-chop via silence gaps → 16 pad
      </span>
      <span v-else>
        Single sample across all keys at different pitches
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSampleStore } from '@/stores/useSampleStore'

const store = useSampleStore()

function setMode(mode: 'drum' | 'melodic') {
  store.updateSettings({ slotMode: mode })
}
</script>

<style scoped>
</style>
