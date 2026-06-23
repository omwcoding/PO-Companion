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
.mode-selector {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mode-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1.5px solid rgba(255,255,255,0.1);
  background: transparent;
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.mode-btn:hover {
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.7);
}

.mode-btn.active {
  background: rgba(255, 107, 43, 0.15);
  border-color: #FF6B2B;
  color: #FF6B2B;
}

.mode-info {
  font-size: 10px;
  color: rgba(255,255,255,0.3);
  padding: 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 480px) {
  .mode-info { display: none; }
}
</style>
