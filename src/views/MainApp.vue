<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useToast } from '../composables/useToast'
import { useDateTime } from '../composables/useDateTime'
import { useImages } from '../composables/useImages'
import { useUtils } from '../composables/useUtils'
import { useAI } from '../composables/useAI'
import { useSupabase } from '../composables/useSupabase'
import { useTaiga } from '../composables/useTaiga'

import HeatmapCalendar from '../components/features/HeatmapCalendar.vue'
import SettingsModal from '../components/features/SettingsModal.vue'
import SummaryModal from '../components/features/SummaryModal.vue'
import ReportViewModal from '../components/features/ReportViewModal.vue'
import MorningTemplateModal from '../components/features/MorningTemplateModal.vue'
import TodayTemplate from '../components/features/TodayTemplate.vue'
import TaigaTaskPicker from '../components/features/TaigaTaskPicker.vue'
import BaseHeader from '../components/ui/BaseHeader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { IconUser, IconChevronDown, IconTemplate, IconSettings, IconStar, IconSpinner, IconImage, IconClose, IconCopy, IconCheck } from '../components/icons'
import TemplateCardIllustration from '../components/illustrations/TemplateCardIllustration.vue'
import SettingsCardIllustration from '../components/illustrations/SettingsCardIllustration.vue'

const router = useRouter()
const route = useRoute()
const store = useAppStore()
const { showToast } = useToast()
const { formattedDateTime, greeting, workdayProgress, todayFormatted } = useDateTime()
const { taskImages, processTaskImage, removeTaskImage, clearTaskImages, copyImageToClipboard } = useImages()
const { stripHtml, copyToClipboard } = useUtils()
const { isGenerating, generateReport } = useAI()
const { signOut } = useSupabase()
const { isAuthenticated: isTaigaAuthenticated } = useTaiga()

const hasTaiga = computed(() => isTaigaAuthenticated())

// Refs
const heatmapRef = ref(null)

// Modal states
const showSettings = ref(false)
const settingsInitialTab = ref('personal')
const showSummary = ref(false)
const showReportView = ref(false)
const showMorningTemplate = ref(false)
const reportViewDate = ref(null)

// Editor
const tasksContent = ref('')
const tasksContentHtml = ref('')
const isScrolled = ref(false)
const showConfetti = ref(false)
const showTaigaPicker = ref(false)

// Quill options
const toolbarOptions = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ 'list': 'ordered' }, { 'list': 'bullet' }],
  [{ 'indent': '-1' }, { 'indent': '+1' }],
  [{ 'color': [] }, { 'background': [] }],
  ['clean']
]

const canSubmit = computed(() => store.selectedProjects.length > 0)

// Mood face
const moodSliderValue = ref(null) // null = follow progress
const faceCase = computed(() => {
  const v = moodSliderValue.value !== null ? moodSliderValue.value : Math.ceil(workdayProgress.value.percent / 20)
  if (v <= 1) return 1
  if (v >= 5) return 5
  return v
})
const moodLabels = { 1: 'แย่มาก', 2: 'ไม่ค่อยดี', 3: 'ก็...โอเค', 4: 'ดีเลย!', 5: 'สุดยอด!' }
const moodLabel = computed(() => moodLabels[faceCase.value])
const moodCardColors = {
  1: { bg: '#eef5fc', border: '#c4ddf3', text: '#3b7cc2' },
  2: { bg: '#f3f2f0', border: '#d8d5d0', text: '#7a746d' },
  3: { bg: '#fdf5ec', border: '#f0d9b8', text: '#b87a3a' },
  4: { bg: '#fdf0ee', border: '#f5c4be', text: '#c9443a' },
  5: { bg: '#fef0f5', border: '#fdb4cf', text: '#e0256a' }
}
const moodCardStyle = computed(() => {
  const c = moodCardColors[faceCase.value]
  return {
    backgroundColor: c.bg,
    borderColor: c.border
  }
})
const moodTextColor = computed(() => moodCardColors[faceCase.value].text)

// Eye tracking
const faceRef = ref(null)
const eyeOffset = ref({ x: 0, y: 0 })

function onMouseTrack(e) {
  if (!faceRef.value) return
  const rect = faceRef.value.getBoundingClientRect()
  const faceCenterX = rect.left + rect.width / 2
  const faceCenterY = rect.top + rect.height / 2
  const dx = e.clientX - faceCenterX
  const dy = e.clientY - faceCenterY
  const dist = Math.sqrt(dx * dx + dy * dy)
  const maxMove = 4
  const factor = Math.min(dist / 200, 1)
  eyeOffset.value = {
    x: (dx / (dist || 1)) * maxMove * factor,
    y: (dy / (dist || 1)) * maxMove * factor
  }
}

function onMoodHover(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const percent = x / rect.width
  const zone = Math.ceil(percent * 5)
  moodSliderValue.value = Math.max(1, Math.min(5, zone))
}
function onMoodLeave() {
  moodSliderValue.value = null // snap back to progress
}

const todayReport = computed(() => {
  return store.getReportByDate(new Date())
})

const taigaProjects = computed(() => {
  const report = todayReport.value
  if (!report) return []
  return (report.projects || [])
    .map(id => store.projects.find(p => p.id === id))
    .filter(p => p && p.taigaUrl)
    .map(p => ({ name: p.name, taigaUrl: p.taigaUrl }))
})

const combinedTemplate = computed(() => {
  if (store.selectedProjects.length === 0) return ''

  return store.selectedProjectObjects
    .map(project => {
      const template = project.template || store.DEFAULT_TEMPLATE
      return template.replace(/\{project\}/g, project.name)
    })
    .join('<p><br></p>')
})

// Watch for template changes when projects are selected
watch(combinedTemplate, (newTemplate) => {
  if (newTemplate) {
    tasksContentHtml.value = newTemplate
  } else {
    tasksContentHtml.value = ''
  }
})

function toggleProject(projectId) {
  store.toggleProject(projectId)
}

function openSettings(tab = 'personal') {
  settingsInitialTab.value = tab
  showSettings.value = true
  heatmapRef.value?.closeDock()
}

function scrollToEditor() {
  document.querySelector('.quill-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function handleLogout() {
  try {
    await signOut()
    store.deleteAllData()
    localStorage.clear()
    router.push('/')
  } catch (e) {
    showToast('ออกจากระบบไม่สำเร็จ: ' + e.message)
  }
}

function handleDataDeleted() {
  router.push('/')
}

function generateSummary() {
  showSummary.value = true
}

async function handleAIGenerate() {
  const plainText = stripHtml(tasksContentHtml.value)

  if (!plainText || plainText.trim().length < 3) {
    showToast('กรุณาพิมพ์ bullet points ก่อนสร้างรายงาน')
    return
  }

  if (store.selectedProjects.length === 0) {
    showToast('กรุณาเลือกโครงการก่อน')
    return
  }

  const projectName = store.selectedProjectObjects
    .map(p => p.name)
    .join(', ')

  const result = await generateReport({
    bulletPoints: plainText,
    projectName,
    userName: store.user.name,
    userRole: store.user.role,
  })

  if (result.success) {
    tasksContentHtml.value = result.html
    showToast('สร้างรายงานสำเร็จ')
  } else {
    showToast(result.error)
  }
}

function handleSaveSummary({ isUpdate }) {
  const contentHtml = tasksContentHtml.value
  const contentPlainText = stripHtml(contentHtml)
  const images = taskImages.value.map(img => img.data)

  if (isUpdate) {
    store.updateTodayReport({
      contentHtml,
      contentText: contentPlainText,
      images,
      projects: [...store.selectedProjects]
    })
  } else {
    store.addReport({
      projects: [...store.selectedProjects],
      contentHtml,
      contentText: contentPlainText,
      images
    })
  }

  store.clearSelectedProjects()
  clearTaskImages()
  tasksContentHtml.value = ''
  showSummary.value = false
}

function viewReportByDate(date) {
  reportViewDate.value = date
  showReportView.value = true
}

async function copyMorningTemplate() {
  const template = store.morningTemplate || '{name}\nงานประจำวันที่ {date}\n- '

  const text = template
    .replace(/\{name\}/g, store.user.name || '{ชื่อ-นามสกุล}')
    .replace(/\{date\}/g, todayFormatted.value)
    .replace(/\{role\}/g, store.user.role || '{ตำแหน่ง}')
    .replace(/\{workplace\}/g, store.user.workplace || '{สถานที่ปฏิบัติงาน}')

  await copyToClipboard(text)
  showToast('คัดลอกเทมเพลตแล้ว')
}

// Image handling
function handleImagePaste(e) {
  if (showSettings.value || showMorningTemplate.value) return

  const items = e.clipboardData?.items
  if (!items) return

  for (let item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      handleImageFile(file)
    }
  }
}

async function handleImageFile(file) {
  const result = await processTaskImage(file)
  showToast(result.message)
}

function handleImageSelect(event) {
  const files = event.target.files
  for (let file of files) {
    if (file.type.startsWith('image/')) {
      handleImageFile(file)
    }
  }
  event.target.value = ''
}

function handleImageDrop(event) {
  event.preventDefault()
  const files = event.dataTransfer.files
  for (let file of files) {
    if (file.type.startsWith('image/')) {
      handleImageFile(file)
    }
  }
}

// Scroll handling
const templateSectionRef = ref(null)
const parallaxTop = ref(0)
const parallaxBottom = ref(0)
const polaroidsVisible = ref(false)

function handleScroll() {
  isScrolled.value = window.scrollY > 10

  // Parallax for polaroid cards
  if (templateSectionRef.value) {
    const rect = templateSectionRef.value.getBoundingClientRect()
    const viewH = window.innerHeight
    if (rect.top < viewH && rect.bottom > 0) {
      const progress = (viewH - rect.top) / (viewH + rect.height)
      parallaxTop.value = (progress - 0.5) * -120
      parallaxBottom.value = (progress - 0.5) * 100
    }
  }
}

let polaroidObserver = null

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
  document.addEventListener('paste', handleImagePaste)

  // Fade in polaroids when template section enters viewport
  if (templateSectionRef.value) {
    polaroidObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          polaroidsVisible.value = true
          polaroidObserver.disconnect()
        }
      },
      { threshold: 0.2 }
    )
    polaroidObserver.observe(templateSectionRef.value)
  }

  // Auto-scroll to template + confetti after saving from daily flow
  if (route.query.saved === '1') {
    router.replace({ path: '/app', query: {} })
    nextTick(() => {
      setTimeout(() => {
        templateSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        showConfetti.value = true
        setTimeout(() => { showConfetti.value = false }, 4000)
      }, 300)
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  document.removeEventListener('paste', handleImagePaste)
  if (polaroidObserver) polaroidObserver.disconnect()
})
</script>

<template>
  <div class="bg-[#fafafa] min-h-screen">
    <!-- Sticky Header -->
    <BaseHeader sticky :is-scrolled="isScrolled" bg-color="bg-[#fafafa]">
      <template #actions>
        <div class="profile-dropdown-wrapper">
          <button
            class="flex items-center gap-2.5 py-1.5 pl-1.5 pr-3 bg-gray-50 border border-gray-200 rounded-full font-medium text-sm text-gray-700 cursor-pointer transition-all hover:bg-gray-100 hover:border-gray-300"
            @click="openSettings('personal')">
            <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center overflow-hidden flex-shrink-0">
              <img v-if="store.user.profileImage" :src="store.user.profileImage" alt="Profile"
                class="w-full h-full object-cover rounded-full">
              <IconUser v-else />
            </div>
            <span class="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{{ store.user.name?.split(' ')[0]
              || 'ผู้ใช้' }}</span>
            <IconChevronDown class="text-gray-500 flex-shrink-0 transition-transform" />
          </button>
          <div class="profile-dropdown">
            <button class="profile-dropdown-item" @click="openSettings('personal')">
              <IconSettings class="w-4 h-4 text-gray-500" />
              <span>ตั้งค่า</span>
            </button>
            <div class="border-t border-gray-100 my-1"></div>
            <button class="profile-dropdown-item text-red-600 hover:bg-red-50" @click="handleLogout">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1" /></svg>
              <span>ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </template>
    </BaseHeader>

    <div>
      <!-- Hero Section -->
      <div>
        <section class="relative bg-(--secondary-brand) pt-24 pb-32 px-8 md:px-16 lg:px-[240px] overflow-visible rounded-b-[40px]">
          <div
            class="absolute right-[240px] bottom-0 w-[27%] h-[78%] bg-[url('../assets/hero.svg')] bg-contain bg-no-repeat bg-right-bottom hidden lg:block">
          </div>
          <section class="relative z-10">
            <p class="text-sm text-gray-500 mb-1">{{ formattedDateTime }}</p>
            <h1 class="text-[32px] font-bold text-(--primary-brand) mb-1">{{ greeting }}คุณ, {{ store.user.name }}</h1>
            <p class="text-base text-gray-600">{{ store.user.role }}</p>
          </section>
        </section>
      </div>

      <div class="max-w-full mx-auto px-8 md:px-16 lg:px-[240px]">
        <!-- Stats Grid -->
        <section class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 -mt-16 relative z-10">
          <div class="relative bg-[#8b6bae] rounded-3xl p-6 shadow-none overflow-hidden min-h-[140px]">
            <p class="text-sm text-white/80 mb-1">โครงการทั้งหมด</p>
            <p class="text-[36px] font-bold text-white mt-4">{{ store.projects.length }}</p>
            <img src="../assets/all-project.svg" alt="" class="absolute -right-4 -bottom-4 w-36 h-36" />
          </div>
          <div class="relative bg-[#5bab7b] rounded-3xl p-6 shadow-none overflow-hidden min-h-[140px]">
            <p class="text-sm text-white/80 mb-1">รายงานแล้วในปีนี้ (ครั้ง)</p>
            <p class="text-[36px] font-bold text-white mt-4">{{ store.totalReportsThisYear }}</p>
            <img src="../assets/heatmap-count.svg" alt="" class="absolute -right-4 -bottom-4 w-36 h-36" />
          </div>
          <div class="relative bg-(--accent-3) rounded-3xl p-6 shadow-none overflow-hidden min-h-[140px]">
            <p class="text-sm text-white/80 mb-1">การอัปบล็อกวันนี้</p>
            <p class="text-[36px] font-bold text-white mt-4">{{ store.hasReportedToday ? 'เรียบร้อย ✓' : 'ยัง' }}</p>
            <img src="../assets/today-status.svg" alt="" class="absolute -right-4 -bottom-4 w-36 h-36" />
          </div>
        </section>

        <!-- Heatmap Calendar -->
        <HeatmapCalendar ref="heatmapRef" @view-report="viewReportByDate" />

        <!-- Action Cards Row -->
        <div class="action-cards-row">
          <!-- Create Template Card -->
          <div class="action-card action-card-blue" @click="router.push('/daily-flow')">
            <div class="action-card-content">
              <span class="action-card-badge action-card-badge-blue">
                <IconTemplate />
                สร้างเทมเพลต
              </span>
              <p class="action-card-desc">เขียนสิ่งที่คุณทุ่มเทไปกับงานของวันนี้</p>
            </div>
            <TemplateCardIllustration />
          </div>

          <!-- Settings Card -->
          <div class="action-card action-card-orange" @click="openSettings('projects')">
            <div class="action-card-content">
              <span class="action-card-badge action-card-badge-orange">
                <IconSettings />
                การตั้งค่า
              </span>
              <p class="action-card-desc">จัดการเทมเพลต</p>
            </div>
            <SettingsCardIllustration />
          </div>
        </div>

      </div>
    </div>

    <!-- Confetti overlay -->
    <div v-if="showConfetti" class="confetti-container">
      <div v-for="i in 60" :key="i" class="confetti-piece" :style="{
        left: Math.random() * 100 + '%',
        animationDelay: Math.random() * 2 + 's',
        animationDuration: (2 + Math.random() * 2) + 's',
        backgroundColor: ['#f472b6','#818cf8','#34d399','#fbbf24','#f87171','#60a5fa','#16A34A','#194987'][i % 8],
        width: (6 + Math.random() * 6) + 'px',
        height: (6 + Math.random() * 6) + 'px',
      }" />
    </div>

    <!-- Template Section Container (full width) -->
    <div class="template-section" ref="templateSectionRef">
      <!-- Saved report view — TodayTemplate has its own polaroids & decorations -->
      <TodayTemplate
        v-if="store.hasReportedToday && todayReport"
        :content-html="todayReport.contentHtml || ''"
        :images="(todayReport.images || []).map(img => typeof img === 'string' ? { data: img } : img)"
        :user-name="store.user.name || 'ผู้ใช้'"
        :user-role="store.user.role || ''"
        :user-workplace="store.user.workplace || ''"
        :project-label="store.user.projectLabel || ''"
        :report-saved="true"
        :is-saving="false"
        :has-taiga="hasTaiga"
        mode="readonly"
        @post-taiga="showTaigaPicker = true"
      />

      <!-- Empty state -->
      <template v-else>
        <img src="../assets/polaroid-top.svg" alt="" :class="['parallax-polaroid parallax-polaroid-top', { 'polaroid-visible': polaroidsVisible }]" :style="{ transform: `translateY(${parallaxTop}px) rotate(-12deg)` }" />
        <img src="../assets/polaroid-bottom.svg" alt="" :class="['parallax-polaroid parallax-polaroid-bottom', { 'polaroid-visible': polaroidsVisible }]" :style="{ transform: `translateY(${parallaxBottom}px) rotate(12deg)` }" />
        <div class="template-empty-state">
          <h2 class="template-empty-title">สร้างเทมเพลตของวันนี้</h2>
          <p class="template-empty-desc">ดูเหมือนว่าคุณยังไม่ได้บันทึกข้อมูลเทมเพลตของวันนี้</p>
          <BaseButton variant="primary" size="md" @click="router.push('/daily-flow')">สร้างเทมเพลต</BaseButton>
          <img src="../assets/empty-template.svg" alt="" class="template-empty-illustration" />
        </div>
      </template>
    </div>

    <div class="max-w-full mx-auto px-8 md:px-16 lg:px-[240px]" style="display:none">
        <section class="bg-white rounded-3xl p-8 shadow-sm mb-8">
          <h2 class="text-2xl font-bold text-gray-900 mb-2">วันนี้คุณทำอะไรไปแล้วบ้าง ?</h2>
          <p class="text-gray-500 mb-6">เลือกโครงการที่ทำในวันนี้ จากนั้นเพิ่มรายละเอียดงานที่ทำได้ในเทมเพลตด้านล่าง</p>

          <div class="text-sm font-medium text-gray-700 mb-3">เลือกโครงการที่ทำ</div>
          <div class="flex flex-wrap gap-2 mb-6">
            <button v-for="project in store.projects" :key="project.id"
              class="px-4 py-2 rounded-full text-sm font-medium transition-all border"
              :class="store.selectedProjects.includes(project.id) ? 'bg-[#194987] text-white border-[#194987]' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#194987] hover:text-[#194987]'"
              @click="toggleProject(project.id)">
              {{ project.name }}
            </button>
            <button
              class="px-4 py-2 rounded-full text-sm font-medium bg-white text-[#194987] border-2 border-dashed border-[#194987] hover:bg-blue-50 transition-colors"
              @click="openSettings('projects')">
              + เพิ่มโครงการ
            </button>
          </div>

          <div class="mb-6">
            <p class="text-sm font-medium text-gray-700 mb-3">เพิ่มรายละเอียดในเทมเพลต</p>
            <div class="quill-container">
              <QuillEditor v-model:content="tasksContentHtml" content-type="html" :toolbar="toolbarOptions"
                placeholder="เทมเพลตจะปรากฏเมื่อเลือกโครงการ..." theme="snow" />
            </div>

            <!-- AI Generate Button (disabled — uncomment when proxy is deployed)
            <div class="flex items-center gap-3 mt-3">
              <button
                class="ai-generate-btn"
                :disabled="isGenerating || store.selectedProjects.length === 0"
                @click="handleAIGenerate"
              >
                <IconStar v-if="!isGenerating" />
                <IconSpinner v-else />
                <span>{{ isGenerating ? 'กำลังสร้างรายงาน...' : 'AI สร้างรายงาน' }}</span>
              </button>
              <span v-if="!isGenerating" class="text-xs text-gray-400">พิมพ์ bullet points สั้นๆ แล้วกด AI สร้างรายงาน</span>
            </div>
            -->

            <!-- Image Attachment Section -->
            <div class="mt-6">
              <p class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <IconImage />
                แนบรูปภาพ (ไม่บังคับ)
              </p>
              <div class="flex flex-wrap gap-3 mb-3">
                <div v-for="(image, index) in taskImages" :key="image.id"
                  class="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group">
                  <img :src="image.data" :alt="`Image ${index + 1}`" class="w-full h-full object-cover">
                  <button
                    class="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="ลบรูปภาพ" @click="removeTaskImage(image.id)">
                    <IconClose />
                  </button>
                  <button
                    class="absolute bottom-1 right-1 w-6 h-6 bg-gray-800/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="คัดลอกรูปภาพ" @click="copyImageToClipboard(image.id)">
                    <IconCopy />
                  </button>
                </div>
              </div>
              <div
                class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#194987] hover:bg-blue-50/30 transition-all"
                @click="$refs.imageInput.click()" @dragover.prevent @drop="handleImageDrop">
                <div class="flex flex-col items-center gap-2 text-gray-500">
                  <IconImage :size="32" color="#999" :stroke-width="1.5" />
                  <p>คลิกเพื่อเลือกรูป หรือ วางรูปภาพที่นี่ (Ctrl+V)</p>
                  <p class="text-xs text-gray-400">รองรับ JPG, PNG ขนาดไม่เกิน 2MB ต่อรูป (เพิ่มได้หลายรูป)</p>
                </div>
              </div>
              <input ref="imageInput" type="file" accept="image/*" multiple class="hidden" @change="handleImageSelect">
            </div>
          </div>

          <button
            class="w-full py-4 bg-[#194987] text-white rounded-xl text-base font-semibold flex items-center justify-center gap-2 hover:bg-[#0f3260] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canSubmit" @click="generateSummary">
            สรุปผลของวันนี้
            <IconCheck class="w-5 h-5" />
          </button>
        </section>
    </div>

    <footer class="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
      <img src="../assets/favicon.svg" alt="HurryUp Logo" class="w-5 h-5 opacity-60">
      <span>HurryUp</span>
    </footer>

    <!-- Modals -->
    <SettingsModal :show="showSettings" :initial-tab="settingsInitialTab" @close="showSettings = false"
      @data-deleted="handleDataDeleted" />

    <SummaryModal :show="showSummary" :content-html="tasksContentHtml" :content-plain-text="stripHtml(tasksContentHtml)"
      :images="taskImages" @close="showSummary = false" @save="handleSaveSummary" />

    <ReportViewModal :show="showReportView" :date="reportViewDate" @close="showReportView = false" />

    <MorningTemplateModal :show="showMorningTemplate" @close="showMorningTemplate = false" />

    <TaigaTaskPicker
      :show="showTaigaPicker"
      :report-html="todayReport?.contentHtml || ''"
      :projects="taigaProjects"
      :images="(todayReport?.images || []).map(img => typeof img === 'string' ? { data: img } : img)"
      @close="showTaigaPicker = false"
      @posted="showToast('โพสต์ไปยัง Taiga สำเร็จ')"
    />
  </div>
</template>

<style>
/* Confetti */
.confetti-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
}

.confetti-piece {
  position: absolute;
  top: -10px;
  border-radius: 2px;
  animation: confetti-fall linear forwards;
}

@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}

.template-section {
  position: relative;
  min-height: 100vh;
}

/* Profile Dropdown */
.profile-dropdown-wrapper {
  position: relative;
}

.profile-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
  z-index: 200;
}

.profile-dropdown-wrapper:hover .profile-dropdown {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.profile-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.profile-dropdown-item:hover {
  background: #f3f4f6;
}

/* ===== Mood Face (adapted from CodePen nolakat/bqExQd) ===== */
.mood-face-wrapper {
  border: 3px solid #e5e7eb;
  border-radius: 100%;
  width: 140px;
  height: 140px;
  overflow: hidden;
  z-index: 3;
  position: relative;
  animation: face-idle 6.5s infinite ease-in-out;
}

.mood-face-wrapper div {
  position: absolute;
  transition: all 0.8s ease-in-out;
}

.left {
  left: 0;
}

.right {
  right: 0;
}

/* Face BG */
.mood-face-bg {
  width: 160px;
  height: 160px;
  top: -10px;
  left: -10px;
  z-index: 1;
  background-color: #db9553;
}

.mood-face-light {
  height: 100%;
  width: 100%;
  left: 0;
  border-radius: 100%;
  background-color: #E5B384;
}

.mood-face-bg.case1 {
  background-color: #5399db;
}

.mood-face-bg.case1 .mood-face-light {
  background: #84b6e5;
  border-radius: 100%;
  height: 140px;
  width: 140px;
  top: 25px;
  left: 6px;
}

.mood-face-bg.case2 {
  background-color: #948d86;
}

.mood-face-bg.case2 .mood-face-light {
  background: #A9B5C0;
  border-radius: 100%;
  height: 140px;
  width: 140px;
  top: 0;
  left: -12px;
}

.mood-face-bg.case3 {
  background-color: #db9553;
}

.mood-face-bg.case3 .mood-face-light {
  background: #E5B384;
}

.mood-face-bg.case4 {
  background-color: #e85b51;
}

.mood-face-bg.case4 .mood-face-light {
  background: #ECA58F;
  border-radius: 100%;
  height: 140px;
  width: 140px;
  top: 0;
  left: 12px;
}

.mood-face-bg.case5 {
  background-color: #ff3279;
}

.mood-face-bg.case5 .mood-face-light {
  background: #FF80AC;
  border-radius: 100%;
  height: 140px;
  width: 140px;
  bottom: 25px;
  left: 6px;
}

/* Eyes */
.mood-eyes {
  width: 50%;
  height: 20px;
  z-index: 2;
  top: 30%;
  left: calc(50% - 1.5em);
}

.mood-eyebrow {
  top: -5px;
  width: 20px;
  height: 7px;
  position: absolute;
  border-radius: 10px 10px 20px 20px;
  background: #db9553;
}

.mood-eyebrow.left {
  left: -0.13em;
}

.mood-eyebrow.right {
  right: -0.13em;
}

.mood-eye {
  background: #f0f0f0;
  height: 26px;
  width: 14px;
  border-radius: 50px;
  overflow: hidden;
  position: relative;
}

.mood-pupil {
  width: 10px;
  height: 14px;
  border-radius: 50%;
  background: #343838;
  position: absolute !important;
  top: 50%;
  left: 50%;
  margin-top: -7px;
  margin-left: -5px;
  z-index: 1;
  transition: transform 0.1s ease-out !important;
}

.mood-eyelid {
  background: #db9553;
  width: 18px;
  top: -2px;
  left: -2px;
  height: 0%;
  border-radius: 100% 100% 0% 0%;
  animation: blink 10s ease-in 2s infinite;
}

.mood-bottomlid {
  width: 14px;
  height: 0;
}

/* Eyes case1 - very sad */
.mood-eyes.case1 {
  transform: translateX(0) translateY(25px);
}

.mood-eyes.case1 .mood-eyebrow {
  background: #5399db;
  border-radius: 0 0 100px 100px;
  z-index: 4;
  transform: rotate(-60deg);
}

.mood-eyes.case1 .mood-eyebrow.right {
  transform: rotate(60deg);
}

.mood-eyes.case1 .mood-eyelid {
  background: #5399db;
}

.mood-eyes.case1 .mood-bottomlid {
  height: 14px;
  background: #84b6e5;
}

/* Eyes case2 - sad */
.mood-eyes.case2 {
  transform: translateX(-25px) translateY(12px);
}

.mood-eyes.case2 .mood-eyebrow {
  background: #948d86;
  height: 14px;
  border-radius: 50px 50px 60px 60px;
  transform: rotate(-20deg);
}

.mood-eyes.case2 .mood-eyebrow.right {
  transform: rotate(20deg);
}

.mood-eyes.case2 .mood-eyelid {
  background: #948d86;
}

/* Eyes case3 - neutral (default) */
.mood-eyes.case3 .mood-eyebrow {
  background: #db9553;
}

.mood-eyes.case3 .mood-eyelid {
  background: #db9553;
}

/* Eyes case4 - happy */
.mood-eyes.case4 {
  transform: translateX(12px) translateY(-6px);
}

.mood-eyes.case4 .mood-eyebrow {
  background: #e85b51;
  height: 14px;
  border-radius: 80px 80px 60px 60px;
  transform: rotate(-20deg);
}

.mood-eyes.case4 .mood-eyebrow.right {
  transform: rotate(20deg);
}

.mood-eyes.case4 .mood-eyelid {
  background: #e85b51;
}

/* Eyes case5 - very happy */
.mood-eyes.case5 {
  transform: translateX(3px) translateY(-12px);
}

.mood-eyes.case5 .mood-eyebrow {
  background: #ff3279;
  height: 14px;
  border-radius: 80px 80px 60px 60px;
  transform: rotate(-40deg);
}

.mood-eyes.case5 .mood-eyebrow.right {
  transform: rotate(40deg);
}

.mood-eyes.case5 .mood-eyelid {
  background: #ff3279;
}

.mood-eyes.case5 .mood-bottomlid {
  background: #FF80AC;
  width: 18px;
  height: 16px;
  border-radius: 50px;
  top: 14px;
  z-index: 2;
}

/* Mouth */
.mood-mouth {
  width: 80px;
  height: 3px;
  z-index: 3;
  top: 70%;
  left: calc(50% - 1.5em);
  background: #db9553;
}

.mood-mouth-open {
  width: 60px;
  height: 60px;
  bottom: -12px;
}

/* Mouth case1 - crying */
.mood-mouth.case1 {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #343838;
  transform: translateX(0) translateY(12px);
}

.mood-mouth.case1 .mood-mouth-open {
  width: 80px;
  height: 80px;
  display: block;
  top: 3px;
  left: -8px;
  border-radius: 50%;
  background: #84b6e5;
}

/* Mouth case2 - frown */
.mood-mouth.case2 {
  width: 32px;
  height: 3px;
  border-radius: 50px;
  background: #343838;
  transform: translateX(-12px) rotate(20deg);
}

.mood-mouth.case2 .mood-mouth-open {
  display: none;
}

/* Mouth case3 - neutral */
.mood-mouth.case3 .mood-mouth-open {
  display: none;
}

/* Mouth case4 - smile */
.mood-mouth.case4 {
  width: 20px;
  height: 3px;
  border-radius: 50px;
  background: #343838;
  transform: rotate(20deg) translateY(-25px) translateX(25px) scale(0.8);
}

.mood-mouth.case4 .mood-mouth-open {
  width: 0;
  height: 0;
  display: block;
  border-top: 14px solid #343838;
  border-left: 26px solid transparent;
  border-right: 26px solid transparent;
  top: 0;
  left: -8px;
  border-radius: 10%;
}

/* Mouth case5 - big grin */
.mood-mouth.case5 {
  top: 62%;
  left: calc(50% - 25px);
  width: 50px;
  height: 30px;
  border-radius: 0 0 50px 50px;
  background: #343838;
  transform: none;
  overflow: hidden;
}

.mood-mouth.case5 .mood-mouth-open {
  display: block;
  width: 36px;
  height: 14px;
  border-radius: 50%;
  background: #e85670;
  bottom: 3px;
  left: 7px;
  top: auto;
}

/* Animations */
@keyframes blink {
  0% {
    height: 0%;
  }

  5% {
    height: 100%;
  }

  8% {
    height: 0%;
  }

  100% {
    height: 0%;
  }
}

@keyframes face-idle {
  0% {
    transform: rotate(0deg);
  }

  10% {
    transform: rotate(-5deg);
  }

  40% {
    transform: rotate(10deg);
  }

  80% {
    transform: rotate(-10deg);
  }

  90% {
    transform: rotate(5deg);
  }

  100% {
    transform: rotate(0deg);
  }
}

/* ===== Mood Card ===== */
.mood-card {
  transition: background-color 0.6s ease, border-color 0.6s ease;
}

/* ===== Mood Face Container (aura + confetti) ===== */
.mood-face-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Aura */
.mood-aura {
  position: absolute;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 50, 121, 0.3) 0%, transparent 70%);
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.6s ease;
  pointer-events: none;
}

.mood-aura-2 {
  background: radial-gradient(circle, rgba(255, 128, 172, 0.2) 0%, transparent 70%);
}

.is-ecstatic .mood-aura {
  opacity: 1;
  transform: scale(1.6);
  animation: aura-pulse 2s ease-in-out infinite;
}

.is-ecstatic .mood-aura-2 {
  opacity: 1;
  transform: scale(1.9);
  animation: aura-pulse 2s ease-in-out 0.5s infinite;
}

@keyframes aura-pulse {

  0%,
  100% {
    transform: scale(1.6);
    opacity: 0.8;
  }

  50% {
    transform: scale(1.8);
    opacity: 1;
  }
}

/* Confetti */
.mood-confetti {
  position: absolute;
  width: 140px;
  height: 140px;
  pointer-events: none;
}

.mood-confetti span {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 2px;
  top: 50%;
  left: 50%;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0);
  transition: opacity 0.3s;
}

.mood-confetti span:nth-child(1) {
  background: #ff3279;
}

.mood-confetti span:nth-child(2) {
  background: #ffb347;
}

.mood-confetti span:nth-child(3) {
  background: #84b6e5;
}

.mood-confetti span:nth-child(4) {
  background: #ff6b9d;
}

.mood-confetti span:nth-child(5) {
  background: #ffd700;
}

.mood-confetti span:nth-child(6) {
  background: #7dd3fc;
}

.mood-confetti span:nth-child(7) {
  background: #f472b6;
}

.mood-confetti span:nth-child(8) {
  background: #fb923c;
}

.mood-confetti span:nth-child(9) {
  background: #60a5fa;
}

.mood-confetti span:nth-child(10) {
  background: #ff3279;
}

.mood-confetti span:nth-child(11) {
  background: #fbbf24;
}

.mood-confetti span:nth-child(12) {
  background: #a78bfa;
}

.is-ecstatic .mood-confetti span {
  opacity: 1;
  animation: confetti-burst 1.8s ease-out infinite;
  animation-delay: calc(var(--i) * 0.12s);
}

.mood-confetti span:nth-child(1) {
  --angle: 0deg;
}

.mood-confetti span:nth-child(2) {
  --angle: 30deg;
}

.mood-confetti span:nth-child(3) {
  --angle: 60deg;
}

.mood-confetti span:nth-child(4) {
  --angle: 90deg;
}

.mood-confetti span:nth-child(5) {
  --angle: 120deg;
}

.mood-confetti span:nth-child(6) {
  --angle: 150deg;
}

.mood-confetti span:nth-child(7) {
  --angle: 180deg;
}

.mood-confetti span:nth-child(8) {
  --angle: 210deg;
}

.mood-confetti span:nth-child(9) {
  --angle: 240deg;
}

.mood-confetti span:nth-child(10) {
  --angle: 270deg;
}

.mood-confetti span:nth-child(11) {
  --angle: 300deg;
}

.mood-confetti span:nth-child(12) {
  --angle: 330deg;
}

@keyframes confetti-burst {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0) scale(1);
  }

  50% {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-90px) scale(1) rotate(180deg);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-110px) scale(0.5) rotate(360deg);
  }
}

/* ===== Mood Hover Track ===== */
.mood-track {
  position: relative;
  width: 100%;
  height: 8px;
  border-radius: 50px;
  background: linear-gradient(90deg, #84b6e5, #A9B5C0 25%, #E5B384 50%, #ECA58F 75%, #FF80AC);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  overflow: visible;
}

.mood-track-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 50px;
  background: rgba(255, 255, 255, 0.3);
  transition: width 0.4s ease;
  pointer-events: none;
}

.mood-track-thumb {
  position: absolute;
  top: 50%;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transform: translate(-50%, -50%);
  transition: left 0.4s ease, transform 0.2s;
  pointer-events: none;
}

.mood-track:hover .mood-track-thumb {
  transform: translate(-50%, -50%) scale(1.15);
}
</style>
