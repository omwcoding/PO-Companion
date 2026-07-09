<template>
  <div class="password-gate">
    <!-- CRT scanlines and flicker effect for theme depth -->
    <div class="crt-overlay" />
    
    <div class="gate-container">
      <div class="terminal-card">
        <div class="terminal-header">
          <span class="terminal-dot red"></span>
          <span class="terminal-dot yellow"></span>
          <span class="terminal-dot green"></span>
          <span class="terminal-title">SECURITY ACCESS TERMINAL</span>
        </div>
        
        <div class="terminal-body">
          <div class="prompt-text">
            <span class="accent-text">PO-COMPANION v0.1.0</span><br />
            <span>INITIALIZING ENCRYPTED INTERFACE...</span><br />
            <span class="warning-text">[SYSTEM ENCRYPTED: PRIVATE DEVELOPMENT BUILD]</span>
          </div>

          <form @submit.prevent="handleSubmit" class="input-area">
            <div class="input-prompt">
              <span class="prompt-symbol">ENTER ACCESS KEY:</span>
              <div class="password-wrapper">
                <input
                  ref="passwordInput"
                  v-model="password"
                  type="password"
                  class="terminal-input"
                  placeholder="••••••••"
                  :disabled="loading"
                  autocomplete="current-password"
                />
                <span class="custom-cursor" v-if="!password">█</span>
              </div>
            </div>
            
            <div v-if="error" class="error-msg">
              >> [ACCESS DENIED]: INVALID CREDENTIALS
            </div>
            
            <button type="submit" class="terminal-btn" :disabled="loading">
              {{ loading ? 'VERIFYING...' : 'DECRYPT SYSTEM' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const emit = defineEmits<{
  (e: 'authorized'): void
}>()

const password = ref('')
const error = ref(false)
const loading = ref(false)
const passwordInput = ref<HTMLInputElement | null>(null)

// SHA-256 hash generated for the password "omie"
const CORRECT_HASH = 'eb4ea9f4ce7e68df84f44c72b9649df8e6a2a7b0e738dd622211c3f907b40773'

onMounted(() => {
  // Focus the input automatically
  passwordInput.value?.focus()
})

// Native SHA-256 hashing using the Web Crypto API
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

async function handleSubmit() {
  if (!password.value) return
  
  error.value = false
  loading.value = true
  
  try {
    const inputHash = await sha256(password.value)
    
    // Artificial slight delay for dramatic retro terminal decoding effect
    await new Promise(resolve => setTimeout(resolve, 600))
    
    if (inputHash === CORRECT_HASH) {
      // Save authorization hash to localstorage
      localStorage.setItem('po_companion_auth_hash', CORRECT_HASH)
      emit('authorized')
    } else {
      error.value = true
      password.value = ''
      passwordInput.value?.focus()
    }
  } catch (err) {
    console.error('Hashing error:', err)
    error.value = true
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.password-gate {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #030903;
  color: #39FF14;
  font-family: 'Courier New', Courier, monospace;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
  overflow: hidden;
}

.crt-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
  background-size: 100% 4px, 6px 100%;
  pointer-events: none;
  z-index: 10;
}

.gate-container {
  width: 100%;
  max-width: 480px;
  padding: 20px;
  position: relative;
  z-index: 5;
}

.terminal-card {
  background-color: #0b170b;
  border: 2px solid #142b14;
  border-radius: 8px;
  box-shadow: 0 0 20px rgba(57, 255, 20, 0.15);
  overflow: hidden;
}

.terminal-header {
  background-color: #142b14;
  padding: 10px 15px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 2px solid #142b14;
}

.terminal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.terminal-dot.red { background-color: #ff3333; }
.terminal-dot.yellow { background-color: #ffd93d; }
.terminal-dot.green { background-color: #39FF14; }

.terminal-title {
  color: #5e8a5e;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  margin-left: 10px;
}

.terminal-body {
  padding: 25px;
}

.prompt-text {
  font-size: 13px;
  line-height: 1.8;
  margin-bottom: 30px;
}

.accent-text {
  color: #00ff66;
  font-weight: bold;
}

.warning-text {
  color: #ff3333;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-prompt {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-symbol {
  font-size: 12px;
  color: #5e8a5e;
  font-weight: bold;
}

.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.terminal-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 2px solid #142b14;
  color: #39FF14;
  font-family: inherit;
  font-size: 18px;
  padding: 6px 0;
  outline: none;
  letter-spacing: 0.2em;
}

.terminal-input:focus {
  border-bottom-color: #39FF14;
}

.custom-cursor {
  position: absolute;
  left: 0;
  color: #39FF14;
  animation: blink 1s step-end infinite;
  pointer-events: none;
}

.error-msg {
  color: #ff3333;
  font-size: 12px;
  font-weight: bold;
  animation: shake 0.3s ease;
}

.terminal-btn {
  background-color: transparent;
  border: 2px solid #39FF14;
  color: #39FF14;
  padding: 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 4px;
}

.terminal-btn:hover:not(:disabled) {
  background-color: #39FF14;
  color: #030903;
  box-shadow: 0 0 10px rgba(57, 255, 20, 0.4);
}

.terminal-btn:disabled {
  border-color: #142b14;
  color: #142b14;
  cursor: not-allowed;
}

@keyframes blink {
  from, to { color: transparent; }
  50% { color: #39FF14; }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}
</style>
