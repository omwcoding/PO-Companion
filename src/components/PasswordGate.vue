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
            <span class="warning-text">[PRIVATE DEVELOPMENT BUILD]</span>
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
              {{ loading ? 'VERIFYING...' : 'ENTER' }}
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

// SHA-256 hash generated for the password
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
</style>
