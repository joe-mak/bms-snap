<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useToast } from '../composables/useToast'
import BaseHeader from '../components/ui/BaseHeader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { IconUser, IconChevronDown } from '../components/icons'

const router = useRouter()
const store = useAppStore()
const { showToast } = useToast()

// Load saved task lines from store's morningTemplate
const savedTasks = store.morningTemplate
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))
  .filter(Boolean)
  .join('\n')
const tasks = ref(savedTasks)

const currentDate = computed(() => {
  return new Date().toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
})

const fullName = computed(() => store.user.name || '')

const templatePreview = computed(() => {
  const lines = [fullName.value, `งานประจำวันที่ ${currentDate.value}`]
  const taskLines = tasks.value
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `- ${t}`)
  if (taskLines.length > 0) {
    lines.push(...taskLines)
  } else {
    lines.push('- ')
  }
  return lines.join('\n')
})

function saveTemplate() {
  store.setMorningTemplate(templatePreview.value)
  showToast('บันทึกเทมเพลตวันนี้แล้ว')
}

async function copyTemplate() {
  try {
    await navigator.clipboard.writeText(templatePreview.value)
    showToast('คัดลอกเทมเพลตแล้ว')
  } catch {
    showToast('ไม่สามารถคัดลอกได้')
  }
}

const previewLines = computed(() => {
  const lines = [
    fullName.value || 'ชื่อ-นามสกุล',
    `งานประจำวันที่ ${currentDate.value}`,
  ]
  const taskLines = tasks.value
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `• ${t}`)
  lines.push(...taskLines)
  return lines
})

// Green card expands left like a chat bubble — right edge stays fixed
const greenCardRightEdge = 698 // 16px from outer card right edge (714)
const greenCardWidth = computed(() => {
  const longest = previewLines.value.reduce((max, line) => Math.max(max, line.length), 0)
  return Math.max(235, longest * 9 + 32)
})
const greenCardX = computed(() => greenCardRightEdge - greenCardWidth.value)

// Dynamic green card height based on lines
const greenCardHeight = computed(() => {
  const lineCount = Math.max(previewLines.value.length, 2)
  return 36 + lineCount * 24
})

// Outer card and viewBox grow with the green card
const outerCardHeight = computed(() => {
  const greenBottom = 330 + greenCardHeight.value + 16 // green card y + height + padding
  return Math.max(445, greenBottom - 20) // subtract outer card y=20
})

const svgViewBoxHeight = computed(() => {
  return outerCardHeight.value + 20 + 12 // card y + card height + shadow offset
})

function goBack() {
  router.push({ name: 'app' })
}
</script>

<template>
  <div class="h-screen flex flex-col bg-white overflow-hidden">
    <!-- Header -->
    <BaseHeader :show-border="false">
      <template #actions>
        <button
          class="flex items-center gap-2.5 py-1.5 pl-1.5 pr-3 bg-gray-50 border border-gray-200 rounded-full font-medium text-sm text-gray-700 cursor-pointer transition-all hover:bg-gray-100 hover:border-gray-300"
          @click="goBack">
          <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img v-if="store.user.profileImage" :src="store.user.profileImage" alt="Profile"
              class="w-full h-full object-cover rounded-full">
            <IconUser v-else />
          </div>
          <span class="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{{ store.user.name?.split(' ')[0] || 'ผู้ใช้' }}</span>
          <IconChevronDown class="text-gray-500 flex-shrink-0" />
        </button>
      </template>
    </BaseHeader>

    <!-- Content area (relative so layers can overlap) -->
    <div class="flex-1 relative animate-[slideIn_0.5s_ease-out_0.1s_forwards] opacity-0 translate-y-[30px]">

      <!-- Layer 1: Illustration — pinned to right edge, behind form -->
      <div class="hidden lg:block absolute top-0 right-0 bottom-0 w-[55%] overflow-hidden pt-12">
        <div class="morning-illustration-wrapper h-full flex items-start justify-end">
          <svg
            class="action-card-illustration settings-illustration"
            :viewBox="`0 0 738 ${svgViewBoxHeight}`"
            overflow="visible"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g filter="url(#filter0_mt)">
              <!-- Main card bg -->
              <rect x="23" y="20" width="691" :height="outerCardHeight" rx="24" fill="white" shape-rendering="geometricPrecision"/>
              <rect x="22" y="19" width="693" :height="outerCardHeight + 2" rx="25" stroke="#D9D9D9" stroke-width="1" fill="none" shape-rendering="geometricPrecision"/>


              <!-- Header bar -->
              <g filter="url(#filter1_mt)">
                <path d="M24 44C24 30.7452 34.7452 20 48 20H690C703.255 20 714 30.7452 714 44V159H24V44Z" fill="white" shape-rendering="crispEdges"/>
                <circle cx="54" cy="48" r="12" fill="#FF5F57"/>
                <circle cx="86" cy="48" r="12" fill="#FEBC2E"/>
                <circle cx="118" cy="48" r="12" fill="#28C840"/>
                <circle cx="74" cy="108" r="32" fill="#EBAA28"/>
                <rect x="122" y="96" width="145" height="24" rx="12" fill="#D9D9D9"/>
              </g>

              <!-- Avatar -->
              <circle cx="72" cy="207" r="32" fill="#F4F4F4"/>

              <!-- Name bar -->
              <rect x="112" y="175" width="75" height="16" rx="8" fill="#D9D9D9"/>

              <!-- Content card -->
              <rect x="112" y="199" width="226" height="112" rx="16" fill="#EFEFEF"/>
              <rect x="124" y="211" width="75" height="11" rx="5.5" fill="#D9D9D9"/>
              <rect x="124" y="230" width="178" height="11" rx="5.5" fill="#D9D9D9"/>
              <rect x="124" y="249" width="118" height="11" rx="5.5" fill="#D9D9D9"/>
              <rect x="124" y="268" width="148" height="11" rx="5.5" fill="#D9D9D9"/>
              <rect x="124" y="287" width="81" height="11" rx="5.5" fill="#D9D9D9"/>

              <!-- Green card (dynamic height) -->
              <rect :x="greenCardX" y="330" :width="greenCardWidth" :height="greenCardHeight" rx="16" fill="#A1FA85"/>
              <!-- Live preview text -->
              <text
                v-for="(line, i) in previewLines"
                :key="i"
                :x="greenCardX + 16"
                :y="354 + i * 24"
                font-size="16"
                font-family="system-ui, sans-serif"
                font-weight="600"
                fill="#333"
              >{{ line }}</text>
            </g>

            <defs>
              <filter id="filter0_mt" x="23" y="20" width="699" :height="outerCardHeight + 12" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                <feOffset dx="8" dy="12"/>
                <feComposite in2="hardAlpha" operator="out"/>
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.12 0"/>
                <feBlend mode="normal" in2="BackgroundImageFix" result="effect1"/>
                <feBlend mode="normal" in="SourceGraphic" in2="effect1" result="shape"/>
              </filter>
              <filter id="filter1_mt" x="0" y="0" width="738" height="187" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                <feOffset dy="4"/>
                <feGaussianBlur stdDeviation="12"/>
                <feComposite in2="hardAlpha" operator="out"/>
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0"/>
                <feBlend mode="normal" in2="BackgroundImageFix" result="effect1"/>
                <feBlend mode="normal" in="SourceGraphic" in2="effect1" result="shape"/>
              </filter>
            </defs>
          </svg>
        </div>
      </div>

      <!-- Layer 2: Form — exact onboarding layout, on top -->
      <div class="relative z-10 flex-1 flex justify-center px-8 lg:px-16 pb-32 h-full">
        <div class="w-full max-w-[1200px] flex-1">
          <div class="flex h-full">
            <div class="flex-1 min-w-0 flex flex-col pl-8 pr-8 lg:pr-12 max-w-[600px]">
              <div class="space-y-7">
                <div class="flex items-center justify-between">
                  <div class="">
                    <h2 class="text-2xl font-bold text-[var(--primary-brand)]">สิ่งที่จะทำวันนี้</h2>
                    <p class="text-sm text-[var(--secondary-text)]">ระบุและคัดลอกสิ่งที่คุณจะทำของวันนี้</p>
                  </div>
                  <BaseButton variant="outlined" @click="saveTemplate" size="sm">
                    บันทึกเทมเพลตนี้
                  </BaseButton>
                </div>

                <!-- Task input -->
                <textarea
                  v-model="tasks"
                  placeholder="พิมพ์งานที่จะทำ (บรรทัดละ 1 รายการ)"
                  class="w-full h-40 border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--primary-text)] placeholder:text-[var(--secondary-text)] bg-white resize-none focus:border-[var(--primary-brand)] focus:outline-2 focus:outline-[var(--primary-brand)] focus:outline-offset-2 transition-colors"
                />

                <!-- Action buttons -->
                <div class="flex justify-end items-center gap-3">
                  <BaseButton variant="outline" @click="goBack" size="lg">
                    กลับหน้าหลัก
                  </BaseButton>
                  <BaseButton variant="primary" @click="copyTemplate" size="lg">
                    คัดลอกเทมเพลต
                  </BaseButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style>
@keyframes slideIn {
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

<style scoped>
.morning-illustration-wrapper {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}

.morning-illustration-wrapper :deep(.action-card-illustration) {
  position: relative !important;
  right: auto !important;
  bottom: auto !important;
  width: 700px !important;
  min-width: 700px;
  max-width: none;
}

.morning-illustration-wrapper :deep(.settings-illustration) {
  transform: none !important;
}
</style>
