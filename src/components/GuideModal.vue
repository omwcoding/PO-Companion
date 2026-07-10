<template>
  <transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content guide-modal">
        <!-- Header -->
        <div class="modal-header">
          <h2 class="modal-title">📖 Pocket Operator PO-33 Cheat Sheet</h2>
          <button class="close-btn" @click="$emit('close')">×</button>
        </div>

        <!-- Body -->
        <div class="modal-body scrollable-body">
          
          <!-- Category 1: Recording -->
          <div class="guide-section">
            <h3 class="section-title">🎙️ Campionamento & Memoria</h3>
            <ul class="shortcuts-list">
              <li>
                <span class="keys">RECORD + (1 - 16)</span>
                <span class="desc">Registra da microfono o Line-In nel pad corrispondente (Max 40s totali).</span>
              </li>
              <li>
                <span class="keys">RECORD + SOUND</span>
                <span class="desc">Elimina il suono o il kit correntemente selezionato.</span>
              </li>
              <li>
                <span class="keys">SOUND + BPM</span>
                <span class="desc">Mostra la percentuale di batteria residua sul display.</span>
              </li>
            </ul>
          </div>

          <!-- Category 2: Editing -->
          <div class="guide-section">
            <h3 class="section-title">🎚️ Parametri & Copia</h3>
            <ul class="shortcuts-list">
              <li>
                <span class="keys">FX (Premere)</span>
                <span class="desc">Cicla i controlli Knob A/B: TONE (Pitch/Vol) ➔ FILTER (Cut/Res) ➔ TRIM (Start/Len).</span>
              </li>
              <li>
                <span class="keys">WRITE + SOUND + (1 - 16)</span>
                <span class="desc">Copia il suono o il kit selezionato in un altro slot.</span>
              </li>
              <li>
                <span class="keys">WRITE + SOUND + (9 - 16)</span>
                <span class="desc">Copia l'ultimo slice suonato (da Drum bank) in un altro slot (Melodic o Drum).</span>
              </li>
              <li>
                <span class="keys">SOUND (Hold) [Durante Play]</span>
                <span class="desc"><strong>Faux Mute</strong>: Muta temporaneamente il rispettivo canale/slot finché lo tieni premuto.</span>
              </li>
            </ul>
          </div>

          <!-- Category 3: Sequencer -->
          <div class="guide-section">
            <h3 class="section-title">🎹 Sequencer & Canzoni</h3>
            <ul class="shortcuts-list">
              <li>
                <span class="keys">PATTERN + (1 - 16)</span>
                <span class="desc">Seleziona il pattern attivo.</span>
              </li>
              <li>
                <span class="keys">PATTERN (Hold) + (1 - 16)</span>
                <span class="desc">Concatena i pattern in sequenza (es. 1➔1➔1➔2) fino a 128 pattern.</span>
              </li>
              <li>
                <span class="keys">WRITE + PATTERN + (1 - 16)</span>
                <span class="desc">Copia il pattern attivo in uno slot vuoto.</span>
              </li>
              <li>
                <span class="keys">RECORD + PATTERN</span>
                <span class="desc">Cancella tutte le note del pattern attivo.</span>
              </li>
              <li>
                <span class="keys">WRITE (Hold) + Knob A/B</span>
                <span class="desc"><strong>Parameter Lock</strong>: Registra i movimenti delle manopole su uno step specifico del sequencer.</span>
              </li>
            </ul>
          </div>

          <!-- Category 4: Performance & FX -->
          <div class="guide-section">
            <h3 class="section-title">⚡ Performance & Tempo</h3>
            <ul class="shortcuts-list">
              <li>
                <span class="keys">BPM (Hold) + Knob B</span>
                <span class="desc">Regola di fino il tempo di riproduzione (da 60 a 240 BPM).</span>
              </li>
              <li>
                <span class="keys">BPM (Hold) + Knob A</span>
                <span class="desc">Regola lo Swing ritmico.</span>
              </li>
              <li>
                <span class="keys">BPM (Hold) + (1 - 16)</span>
                <span class="desc">Regola il volume principale dell'hardware (default 5, da 1 a 16).</span>
              </li>
              <li>
                <span class="keys">FX + (1 - 15) [Durante Play]</span>
                <span class="desc">Applica effetti punch-in dal vivo (stutter, scratch, loops).</span>
              </li>
              <li>
                <span class="keys">FX + 16 [In Write mode]</span>
                <span class="desc">Ripulisce tutti gli effetti registrati sul pattern.</span>
              </li>
            </ul>
          </div>

          <!-- Category 5: Utility & Sync -->
          <div class="guide-section">
            <h3 class="section-title">🔌 Sync, Backup & Reset</h3>
            <ul class="shortcuts-list">
              <li>
                <span class="keys">RECORD + BPM</span>
                <span class="desc">Cicla le modalità di sincronizzazione (SY0 ➔ SY1 ➔ SY2 ➔ SY3 ➔ SY4 ➔ SY5).</span>
              </li>
              <li>
                <span class="keys">WRITE + SOUND + PLAY</span>
                <span class="desc"><strong>Backup</strong>: Esporta l'intera memoria come segnale audio modem (registrare in Stereo!).</span>
              </li>
              <li>
                <span class="keys">WRITE + SOUND + RECORD</span>
                <span class="desc"><strong>Restore</strong>: Mette il PO-33 in ascolto per ripristinare un backup inviato da Line-In.</span>
              </li>
              <li>
                <span class="keys">PATTERN + WRITE [Inserendo pile]</span>
                <span class="desc"><strong>Factory Reset</strong>: Ripristina il campionatore allo stato di fabbrica (cancella tutto).</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-note">Informazioni estratte dalla guida ufficiale Teenage Engineering.</div>
          <button class="footer-btn btn-close" @click="$emit('close')">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
defineProps<{
  isOpen: boolean
}>()

defineEmits<{
  (e: 'close'): void
}>()
</script>

<style scoped>
.guide-modal {
  max-width: 620px;
}

.scrollable-body {
  max-height: 440px;
  overflow-y: auto;
  padding-right: 8px;
}

.guide-intro {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 20px;
  border-left: 3px solid #00E5FF;
  padding-left: 10px;
}

.guide-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 11px;
  text-transform: uppercase;
  color: #00E5FF;
  margin: 0 0 10px 0;
  letter-spacing: 0.8px;
  font-weight: 700;
  border-bottom: 1px solid rgba(0, 229, 255, 0.15);
  padding-bottom: 4px;
}

.shortcuts-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcuts-list li {
  display: grid;
  grid-template-columns: 190px 1fr;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 0;
}

.keys {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #FFD93D;
  padding: 3px 8px;
  border-radius: 4px;
  text-align: center;
  white-space: nowrap;
  box-shadow: 0 2px 0 rgba(0,0,0,0.4);
}

.desc {
  color: rgba(255, 255, 255, 0.85);
}

.footer-note {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}

.btn-close {
  background: rgba(255, 255, 255, 0.04);
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

@media (max-width: 580px) {
  .shortcuts-list li {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .keys {
    display: inline-block;
    align-self: flex-start;
  }
}
</style>
