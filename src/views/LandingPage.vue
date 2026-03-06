<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTaiga } from '../composables/useTaiga'
import { useAI } from '../composables/useAI'
import { useToast } from '../composables/useToast'
import { useSupabase } from '../composables/useSupabase'
import { useAppStore } from '../stores/app'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import ImportModal from '../components/ImportModal.vue'

const { showToast } = useToast()
const { signIn, signUp, getProfile } = useSupabase()
const store = useAppStore()

const router = useRouter()
const showImportModal = ref(false)

const { login: taigaLogin, getUserProjects } = useTaiga()
const { getProxyUrl, setProxyUrl } = useAI()

const defaultProxyUrl = import.meta.env.VITE_PROXY_URL || getProxyUrl() || ''
const taigaBaseUrl = ref(import.meta.env.VITE_TAIGA_BASE_URL || '')
const savedUsername = localStorage.getItem('hurryup_remember_user') || ''
const taigaUsername = ref(savedUsername)
const taigaPassword = ref('')
const rememberMe = ref(!!savedUsername)
const loginState = ref('idle')
const loginError = ref('')

async function handleTaigaLogin() {
  const proxy = defaultProxyUrl
  const base = taigaBaseUrl.value.trim()
  const user = taigaUsername.value.trim()
  const pass = taigaPassword.value

  if (!proxy) {
    loginError.value = 'ยังไม่ได้ตั้งค่า Proxy URL'
    return
  }
  if (!user || !pass) {
    loginError.value = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'
    return
  }

  setProxyUrl(proxy)
  loginState.value = 'loading'
  loginError.value = ''

  if (rememberMe.value) {
    localStorage.setItem('hurryup_remember_user', user)
  } else {
    localStorage.removeItem('hurryup_remember_user')
  }

  const result = await taigaLogin(proxy, base, user, pass)
  if (!result.success) {
    loginState.value = 'idle'
    loginError.value = result.error || 'เชื่อมต่อไม่สำเร็จ'
    return
  }

  // Auto sign in/up to Supabase using Taiga credentials
  try {
    await signIn(user, pass)
  } catch {
    try {
      await signUp(user, pass)
      await signIn(user, pass)
    } catch (e) {
      console.warn('Supabase auth skipped:', e.message)
    }
  }

  // Check if returning user (already has profile in Supabase)
  try {
    const profile = await getProfile()
    if (profile && profile.name) {
      // Returning user — load data from Supabase and go straight to app
      await store.loadFromSupabase()
      store.onboardingComplete = true
      store.saveData()
      // Also sync any local data that might be newer
      await store.syncAllToSupabase()
      loginState.value = 'idle'
      showToast('ยินดีต้อนรับกลับ!', 3000, 'success')
      router.push('/app')
      return
    }
  } catch (e) {
    console.warn('Profile check skipped:', e.message)
  }

  // New user — sync existing local data, fetch Taiga projects, go to onboarding
  await store.syncAllToSupabase()

  try {
    const projectsData = await getUserProjects(proxy)
    sessionStorage.setItem('hurryup_fetched_projects', JSON.stringify(projectsData || []))
    sessionStorage.setItem('hurryup_login_name', result.fullName || '')
  } catch (err) {
    console.error('Failed to fetch projects:', err)
    sessionStorage.setItem('hurryup_fetched_projects', '[]')
    sessionStorage.setItem('hurryup_login_name', result.fullName || '')
  }

  loginState.value = 'idle'
  showToast('เข้าสู่ระบบสำเร็จ', 3000, 'success')
  router.push('/onboarding')
}
</script>

<template>
  <div class="min-h-screen flex bg-gray-50">

    <!-- Left Column: Login Form -->
    <div class="w-full lg:w-1/2 flex flex-col justify-center bg-white px-8 sm:px-16 lg:px-20 xl:px-28 py-12">
      <div
        class="w-full max-w-[480px] mx-auto animate-[landingSlideIn_0.5s_ease-out_0.1s_forwards] opacity-0 translate-y-[30px]">
        <h1 class="text-4xl sm:text-5xl font-bold text-[var(--primary-brand)] mb-3">ยินดีต้อนรับ</h1>
        <p class="text-[var(--secondary-text)] text-base mb-10">
          ทำให้การบันทึกรายงานประจำวันเป็นเรื่องง่ายด้วย <strong class="text-[var(--primary-brand)]">BMS Snap</strong>
          เข้าสู่ระบบโดยอีเมลบริษัท
        </p>

        <div class="space-y-5">
          <!-- Username -->
          <BaseInput v-model="taigaUsername" placeholder="username@bms-hosxp.com" :disabled="loginState === 'loading'" />

          <!-- Password -->
          <BaseInput v-model="taigaPassword" type="password" placeholder="รหัสผ่านอีเมลบริษัท" :disabled="loginState === 'loading'" @keydown.enter="handleTaigaLogin" />

          <!-- Remember me -->
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" v-model="rememberMe">
            <span class="text-sm text-[var(--secondary-text)]">จำฉันไว้</span>
          </label>

          <!-- Login error -->
          <p v-if="loginError" class="text-red-500 text-sm">{{ loginError }}</p>

          <!-- Login button -->
          <BaseButton variant="primary" size="lg" class="!w-full" :disabled="loginState === 'loading'" @click="handleTaigaLogin">
            <span v-if="loginState === 'loading'" class="loading loading-spinner loading-sm"></span>
            {{ loginState === 'loading' ? 'กำลังเชื่อมต่อ...' : 'Login' }}
          </BaseButton>

        </div>
      </div>
    </div>

    <!-- Right Column: Illustration -->
    <div class="hidden lg:flex w-1/2 p-6 bg-white">
      <div class="w-full h-full rounded-3xl flex items-center justify-center">
        <img src="../assets/landing-hero.svg" alt="BMS Snap Illustration" class="w-[80%] max-w-[480px] h-auto">
      </div>
    </div>

    <!-- Import Modal -->
    <ImportModal :show="showImportModal" @close="showImportModal = false" />
  </div>
</template>

<style>
@keyframes landingSlideIn {
  0% {
    opacity: 0;
    transform: translateY(30px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
