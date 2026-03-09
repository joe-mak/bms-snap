<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useToast } from '../composables/useToast'
import BaseHeader from '../components/ui/BaseHeader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { IconUser, IconChevronDown } from '../components/icons'
import PhysicsPills from '../components/features/PhysicsPills.vue'
import FloatingPolaroids from '../components/features/FloatingPolaroids.vue'
import FallingLetters from '../components/features/FallingLetters.vue'
import emptyTemplateSvg from '../assets/empty-template.svg'
import polaroidTopSvg from '../assets/polaroid-top.svg'
import polaroidBottomSvg from '../assets/polaroid-bottom.svg'

const router = useRouter()
const store = useAppStore()
const { showToast } = useToast()

const currentStep = ref(1)
const selectedProjectIds = ref([])

// Editor
const MAX_EDITOR_CHARS = 1000
const editorContentHtml = ref('')
const editorTextLength = ref(0)
const toolbarOptions = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ 'list': 'ordered' }, { 'list': 'bullet' }],
  [{ 'indent': '-1' }, { 'indent': '+1' }],
  [{ 'color': [] }],
]

const combinedTemplate = computed(() => {
  if (selectedProjectIds.value.length === 0) return ''

  return selectedProjectIds.value
    .map(id => {
      const project = store.projects.find(p => p.id === id)
      if (!project) return ''
      const template = project.template || store.DEFAULT_TEMPLATE
      return template.replace(/\{project\}/g, project.name)
    })
    .filter(Boolean)
    .join('<hr>')
})

watch(combinedTemplate, (newTemplate) => {
  if (newTemplate) {
    editorContentHtml.value = newTemplate
  } else {
    editorContentHtml.value = ''
  }
})

function toggleProject(id) {
  const idx = selectedProjectIds.value.indexOf(id)
  if (idx === -1) {
    selectedProjectIds.value.push(id)
  } else {
    selectedProjectIds.value.splice(idx, 1)
  }
}

function isSelected(id) {
  return selectedProjectIds.value.includes(id)
}

const selectedProjectPills = computed(() => {
  return selectedProjectIds.value.map(id => {
    const project = store.projects.find(p => p.id === id)
    return project ? { id: project.id, name: project.name } : null
  }).filter(Boolean)
})

function handleBack() {
  if (currentStep.value === 1) {
    router.push('/app')
  } else {
    currentStep.value--
  }
}

async function handleNext() {
  if (currentStep.value === 2) {
    // Save report immediately
    if (isSaving.value || reportSaved.value) return
    isSaving.value = true
    try {
      const selectedNames = selectedProjectIds.value
        .map(id => store.projects.find(p => p.id === id)?.name)
        .filter(Boolean)
      store.addReport({
        projects: [...selectedProjectIds.value],
        projectNames: selectedNames,
        contentHtml: editorContentHtml.value,
        images: pastedImages.value.map(img => img.data),
      })
      reportSaved.value = true
    } catch {
      showToast('เกิดข้อผิดพลาดในการบันทึก')
      isSaving.value = false
      return
    }
    isSaving.value = false

    // Play convergence animation then redirect
    isConverging.value = true
    await nextTick()
    const body = document.querySelector('.daily-flow-body')
    if (body) {
      convergeTarget.value = { x: body.offsetWidth / 2, y: body.offsetHeight * 0.4 }
    }
    generatingVisible.value = true
    await new Promise(r => setTimeout(r, 600))
    isConverging.value = false
    convergeTarget.value = null
    await new Promise(r => setTimeout(r, 1500))
    router.push('/app?saved=1')
  } else if (currentStep.value < 2) {
    currentStep.value++
  }
}

// Auto-focus editor when entering step 2
watch(currentStep, async (step) => {
  if (step === 2) {
    await nextTick()
    setTimeout(() => {
      const editor = document.querySelector('#dailyEditorContainer .ql-editor')
      if (editor) {
        editor.focus()
        const sel = window.getSelection()
        if (sel) {
          sel.selectAllChildren(editor)
          sel.collapseToEnd()
        }
      }
    }, 350)
  }

})

// Falling letters
const droppedLetters = ref([])
const MAX_DROPPED_LETTERS = 1000
let keydownRemoveCount = 0

function handleKeyDown(e) {
  if (currentStep.value !== 2) return
  if (e.ctrlKey || e.metaKey || e.altKey) return

  if ((e.key === 'Backspace' || e.key === 'Delete') && droppedLetters.value.length > 0) {
    droppedLetters.value.pop()
    keydownRemoveCount++
    return
  }

  if (e.key.length === 1 && editorTextLength.value < MAX_EDITOR_CHARS && droppedLetters.value.length < MAX_DROPPED_LETTERS) {
    droppedLetters.value.push({ id: Date.now() + Math.random(), char: e.key })
  }
}

// Sync bulk deletions (select-all + delete, cut, etc.)
let lastEditorTextLength = 0

watch(editorContentHtml, (newHtml) => {
  const div = document.createElement('div')
  div.innerHTML = newHtml
  const currentLength = (div.textContent || '').length
  editorTextLength.value = currentLength

  // Enforce character limit — trim excess from Quill
  if (currentLength > MAX_EDITOR_CHARS) {
    nextTick(() => {
      const editor = document.querySelector('#dailyEditorContainer .ql-editor')
      if (editor && editor.__quill) {
        editor.__quill.deleteText(MAX_EDITOR_CHARS, currentLength - MAX_EDITOR_CHARS)
      }
    })
  }

  if (currentStep.value === 2 && currentLength < lastEditorTextLength && droppedLetters.value.length > 0) {
    const charsDeleted = lastEditorTextLength - currentLength
    // Subtract chars already handled by keydown to avoid double-removal
    const extra = Math.max(0, charsDeleted - keydownRemoveCount)
    keydownRemoveCount = Math.max(0, keydownRemoveCount - charsDeleted)
    if (extra > 0) {
      const toRemove = Math.min(extra, droppedLetters.value.length)
      droppedLetters.value.splice(droppedLetters.value.length - toRemove, toRemove)
    }
  } else {
    keydownRemoveCount = 0
  }

  lastEditorTextLength = Math.min(currentLength, MAX_EDITOR_CHARS)
})

// Paste screenshots
const pastedImages = ref([])

function compressImage(dataUrl, maxWidth = 600, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      // Check if image has transparency (PNG) — preserve alpha
      const isPng = dataUrl.startsWith('data:image/png')
      if (!isPng) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

function handleImagePaste(e) {
  if (currentStep.value !== 2) return
  const items = e.clipboardData?.items
  if (!items) return

  let hasImage = false
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      hasImage = true
      const file = item.getAsFile()
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const compressed = await compressImage(ev.target.result)
        pastedImages.value.push({ id: Date.now() + Math.random(), data: compressed })
        showToast('เพิ่มภาพหน้าจอแล้ว')
      }
      reader.readAsDataURL(file)
    }
  }

  if (hasImage) {
    e.preventDefault()
    e.stopPropagation()
  } else {
    // Text paste — create falling letters for each character (respect char limit)
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      const remaining = MAX_EDITOR_CHARS - editorTextLength.value
      const allowed = text.slice(0, Math.max(0, remaining))
      for (const char of allowed) {
        if (droppedLetters.value.length >= MAX_DROPPED_LETTERS) break
        if (char.trim()) {
          droppedLetters.value.push({ id: Date.now() + Math.random(), char })
        }
      }
    }
  }
}

const fileInputRef = ref(null)

function triggerUpload() {
  fileInputRef.value?.click()
}

function handleFileUpload(e) {
  const files = e.target.files
  if (!files) return
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const compressed = await compressImage(ev.target.result)
      pastedImages.value.push({ id: Date.now() + Math.random(), data: compressed })
      showToast('เพิ่มภาพหน้าจอแล้ว')
    }
    reader.readAsDataURL(file)
  }
  e.target.value = ''
}

function removeImage(id) {
  pastedImages.value = pastedImages.value.filter(img => img.id !== id)
}

// Step 3 state
const isConverging = ref(false)
const convergeTarget = ref(null)
const generatingVisible = ref(false)
const isSaving = ref(false)
const reportSaved = ref(false)



onMounted(() => {
  document.addEventListener('paste', handleImagePaste, true)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('paste', handleImagePaste, true)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="daily-flow-wrapper" :class="{ 'step3-bg': generatingVisible }">
    <BaseHeader :show-border="false">
      <template #actions>
        <button
          class="flex items-center gap-2.5 py-1.5 pl-1.5 pr-3 bg-gray-50 border border-gray-200 rounded-full font-medium text-sm text-gray-700 cursor-pointer transition-all hover:bg-gray-100 hover:border-gray-300"
          @click="router.push('/app')"
        >
          <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img v-if="store.user.profileImage" :src="store.user.profileImage" alt="Profile" class="w-full h-full object-cover rounded-full">
            <IconUser v-else />
          </div>
          <span class="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{{ store.user.name?.split(' ')[0] || 'ผู้ใช้' }}</span>
          <IconChevronDown class="text-gray-500 flex-shrink-0" />
        </button>
      </template>
    </BaseHeader>

    <div class="daily-flow-body">
      <!-- Physics pills background layer -->
      <div class="daily-flow-pills-bg">
        <PhysicsPills :active="true" :frozen="isConverging" :converge-target="convergeTarget" :extra-pills="selectedProjectPills" />
      </div>

      <!-- Falling letters layer -->
      <div v-show="currentStep <= 2 || isConverging" class="daily-flow-letters-bg">
        <FallingLetters
          :letters="droppedLetters"
          :active="(currentStep <= 2 || isConverging) "
          :frozen="isConverging"
          :converge-target="convergeTarget"
        />
      </div>

      <!-- Floating polaroids layer (physics-driven, step 2) -->
      <div v-show="(currentStep === 2 || isConverging) " class="daily-flow-polaroids-bg">
        <FloatingPolaroids
          :images="pastedImages"
          :active="(currentStep === 2 || isConverging) "
          :frozen="isConverging"
          :converge-target="convergeTarget"
          :exclude-center-width="580"
          @remove="removeImage"
        />
      </div>

      <!-- Centered content -->
      <div class="daily-flow-center" :class="{ 'step3-center': generatingVisible, 'converging-fade': isConverging && !generatingVisible }">
        <!-- Steps indicator (hide during generating animation) -->
        <ul v-show="!generatingVisible" class="steps steps-horizontal mb-6">
          <li class="step" :class="currentStep >= 1 ? 'step-primary' : ''">
            <span class="step-icon">1</span>
          </li>
          <li class="step" :class="currentStep >= 2 ? 'step-primary' : ''">
            <span class="step-icon">2</span>
          </li>
        </ul>

        <!-- Steps 1 & 2 content -->
        <Transition v-if="!generatingVisible" name="step-fade" mode="out-in">
          <div :key="currentStep" class="daily-flow-step-inner">
            <h2 class="daily-flow-title">{{ currentStep === 2 ? 'รายละเอียดงานที่คุณทำวันนี้' : 'เลือกโครงการที่คุณทำวันนี้' }}</h2>

            <!-- Step 1: Select Projects -->
            <div v-if="currentStep === 1" class="daily-flow-content daily-flow-content-scroll">
              <p class="daily-flow-subtitle">เลือกได้มากกว่า 1 รายการ</p>

              <div class="daily-flow-chips">
                <button
                  v-for="project in store.projects"
                  :key="project.id"
                  class="daily-flow-chip"
                  :class="{ 'is-selected': isSelected(project.id) }"
                  :title="project.name"
                  @click="toggleProject(project.id)"
                >
                  {{ project.name }}
                </button>
              </div>
            </div>

            <!-- Step 2: Editor -->
            <div v-else-if="currentStep === 2" class="daily-flow-content">
              <p class="daily-flow-subtitle">เพิ่มรายละเอียดในเทมเพลต · วางภาพหน้าจอ (Ctrl+V)</p>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                multiple
                class="hidden"
                @change="handleFileUpload"
              />
              <div id="dailyEditorContainer" class="w-full">
                <QuillEditor
                  v-model:content="editorContentHtml"
                  content-type="html"
                  :toolbar="toolbarOptions"
                  placeholder="เทมเพลตจะปรากฏเมื่อเลือกโครงการ..."
                  theme="snow"
                />
                <button class="editor-upload-btn" @click="triggerUpload" title="อัปโหลดรูปภาพ">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
                  <span>อัปโหลดรูป</span>
                </button>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Generating Template Interstitial -->
        <Transition name="generating-reveal">
          <div v-if="generatingVisible" class="generating-wrapper">
            <h2 class="generating-title">กำลังสร้างเทมเพลต...</h2>
            <p class="generating-subtitle">รวบรวมข้อมูลของคุณ</p>

            <div class="generating-scene">
              <img :src="polaroidTopSvg" alt="" class="generating-polaroid generating-polaroid-1" />
              <img :src="polaroidBottomSvg" alt="" class="generating-polaroid generating-polaroid-2" />

              <div class="generating-template-img">
                <img :src="emptyTemplateSvg" alt="" />
                <div class="generating-shimmer"></div>
              </div>
            </div>

            <div class="generating-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </Transition>

        <!-- Navigation -->
        <div v-show="!generatingVisible" class="daily-flow-nav">
          <BaseButton variant="outline" size="lg" class="bg-white!" @click="handleBack">
            {{ currentStep === 1 ? 'กลับสู่หน้าหลัก' : 'ย้อนกลับ' }}
          </BaseButton>
          <BaseButton
            variant="primary"
            size="lg"
            :disabled="currentStep === 1 && selectedProjectIds.length === 0"
            @click="handleNext"
          >
            ไปกันต่อ ({{ currentStep }}/2)
          </BaseButton>
        </div>
      </div>
    </div>
  </div>

</template>

<style scoped>
.daily-flow-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #fafafa;
  transition: background 0.6s ease;
}

.daily-flow-wrapper.step3-bg {
  background: var(--accent-5);
}

.daily-flow-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

/* Pills fill the entire background */
.daily-flow-pills-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.daily-flow-pills-bg :deep(.physics-container) {
  width: 100%;
  height: 100%;
}

/* Falling letters layer */
.daily-flow-letters-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  isolation: isolate;
}

/* Polaroids float above pills but below content */
.daily-flow-polaroids-bg {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: auto;
}

/* Centered content card on top */
.daily-flow-center {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  padding: 48px 0 0;
  height: 100%;
  pointer-events: none;
  transition: opacity 0.8s ease, transform 0.8s ease;
}

.daily-flow-center.converging-fade {
  opacity: 0;
  transform: scale(0.95);
  pointer-events: none;
}

.daily-flow-center::before {
  content: '';
  position: absolute;
  inset: -60px -120px;
  background: radial-gradient(ellipse at center, #fafafa 20%, transparent 70%);
  pointer-events: none;
  z-index: -1;
}

.daily-flow-center > * {
  pointer-events: auto;
}

.daily-flow-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #194987;
  text-align: center;
  margin-bottom: 8px;
}

.daily-flow-step-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  flex: 1;
  min-height: 0;
}

.daily-flow-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.daily-flow-content-scroll {
  position: relative;
  mask-image: linear-gradient(to bottom, transparent, black 24px, black calc(100% - 24px), transparent);
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 24px, black calc(100% - 24px), transparent);
  padding-top: 8px;
  padding-bottom: 8px;
}

/* Step transition — fade in from bottom */
.step-fade-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.step-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.step-fade-enter-from {
  opacity: 0;
  transform: translateY(16px);
}

.step-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.daily-flow-subtitle {
  font-size: 1rem;
  color: #666;
  margin-bottom: 24px;
}

.daily-flow-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  width: 100%;
}

.daily-flow-chip {
  display: inline-block;
  padding: 10px 20px;
  border-radius: 9999px;
  font-size: 0.95rem;
  font-weight: 500;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  border: 2px solid #d1d5db;
  background: white;
  color: #374151;
  transition: all 0.15s ease;
}

.daily-flow-chip:hover {
  border-color: #194987;
  color: #194987;
}

.daily-flow-chip:active {
  transform: scale(0.95);
}

.daily-flow-chip.is-selected {
  background: var(--primary-brand, #194987);
  border-color: var(--primary-brand, #194987);
  color: #fff;
}

/* Steps overrides — need :deep for daisyUI internals */
:deep(.steps .step) {
  --step-bg: var(--secondary-brand, #e0ecf7);
  --step-fg: var(--primary-brand, #005FB8);
  font-size: 0.85rem;
  font-weight: 500;
}

:deep(.steps .step::before) {
  border: none !important;
}

:deep(.steps .step.step-primary) {
  --step-bg: var(--primary-brand, #005FB8);
  --step-fg: #fff;
}

:deep(.steps .step .step-icon) {
  border: none !important;
  font-weight: 600;
}

:deep(.steps .step.step-primary .step-icon) {
  background-color: var(--primary-brand, #005FB8) !important;
  color: #fff !important;
}

:deep(.steps .step.step-primary + .step.step-primary::before) {
  background-color: var(--primary-brand, #005FB8) !important;
  color: var(--primary-brand, #005FB8) !important;
}

:deep(.steps .step.step-primary + .step:not(.step-primary)::before) {
  --step-bg: var(--secondary-brand, #e0ecf7);
}

/* Quill editor styles */
#dailyEditorContainer {
  position: relative;
  border: 2px solid #e5e5e5;
  border-radius: 12px;
  overflow: hidden;
  background: white;
  transition: border-color 0.2s ease;
}

#dailyEditorContainer:focus-within {
  border-color: var(--primary-brand, #005FB8);
}

#dailyEditorContainer :deep(.ql-toolbar) {
  border: none;
  border-bottom: 1px solid #e5e5e5;
  background: #fafafa;
  padding-right: 120px;
}

.editor-upload-btn {
  position: absolute;
  top: 0;
  right: 0;
  height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  border: none;
  background: none;
  color: #444;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.editor-upload-btn:hover {
  background: rgba(0, 95, 184, 0.08);
  color: var(--primary-brand, #005FB8);
}

.editor-upload-btn svg {
  width: 18px;
  height: 18px;
}

#dailyEditorContainer :deep(.ql-container) {
  border: none;
  font-family: 'Google Sans', 'Google Sans Text', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  min-height: 200px;
}

#dailyEditorContainer :deep(.ql-editor) {
  min-height: 200px;
  line-height: 1.8;
}

#dailyEditorContainer :deep(.ql-editor.ql-blank::before) {
  color: #999;
  font-style: normal;
}

.daily-flow-nav {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 16px 0 40px;
  flex-shrink: 0;
  width: 100%;
}

.daily-flow-nav :deep(button:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

/* ===== Generating Template Interstitial ===== */
.generating-reveal-enter-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.generating-reveal-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.generating-reveal-enter-from {
  opacity: 0;
  transform: scale(0.85);
}

.generating-reveal-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

.generating-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  position: relative;
}

.generating-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #194987;
  margin-bottom: 4px;
}

.generating-subtitle {
  font-size: 0.95rem;
  color: #5f6368;
  margin-bottom: 8px;
}

.generating-scene {
  position: relative;
  width: 340px;
  height: 460px;
  margin: 16px 0 24px;
}

.generating-template-img {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 280px;
  animation: gentle-pulse 2s ease-in-out infinite;
}

.generating-template-img img {
  width: 100%;
  height: auto;
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.1));
}

.generating-shimmer {
  position: absolute;
  inset: 10px;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.6) 50%, transparent 60%);
  background-size: 200% 100%;
  animation: shimmer-sweep 1.5s ease-in-out infinite;
}

@keyframes shimmer-sweep {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes gentle-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.03); }
}

.generating-polaroid {
  position: absolute;
  pointer-events: none;
}

.generating-polaroid-1 {
  width: 150px;
  top: 10px;
  left: -60px;
  animation: orbit-1 4s ease-in-out infinite;
}

.generating-polaroid-2 {
  width: 140px;
  bottom: 10px;
  right: -50px;
  animation: orbit-2 4s ease-in-out infinite 0.5s;
}

@keyframes orbit-1 {
  0%, 100% { transform: translate(0, 0) rotate(-12deg); }
  25% { transform: translate(30px, -35px) rotate(-5deg); }
  50% { transform: translate(55px, 0) rotate(3deg); }
  75% { transform: translate(30px, 35px) rotate(-8deg); }
}

@keyframes orbit-2 {
  0%, 100% { transform: translate(0, 0) rotate(12deg); }
  25% { transform: translate(-30px, 35px) rotate(5deg); }
  50% { transform: translate(-55px, 0) rotate(-3deg); }
  75% { transform: translate(-30px, -35px) rotate(8deg); }
}

.generating-dots {
  display: flex;
  gap: 8px;
}

.generating-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #194987;
  animation: dot-bounce 1.2s ease-in-out infinite;
}

.generating-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.generating-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-8px); opacity: 1; }
}

/* ===== Step 3 layout ===== */
.daily-flow-center.step3-center {
  max-width: 100%;
  padding-top: 0;
}

.daily-flow-center.step3-center::before {
  background: none;
}

</style>
