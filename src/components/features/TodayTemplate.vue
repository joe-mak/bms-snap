<script setup>
import { ref, computed } from 'vue'
import { IconCopy, IconCheck } from '../icons'
import BaseButton from '../ui/BaseButton.vue'
import { useToast } from '../../composables/useToast'
import { useTaiga } from '../../composables/useTaiga'
import { useAI } from '../../composables/useAI'
import { useAppStore } from '../../stores/app'
import taigaLogo from '../../assets/taiga-logo.svg'
import decoCloud from '../../assets/deco-cloud.svg'
import decoBubble from '../../assets/deco-bubble.svg'
import decoSmiley from '../../assets/deco-smiley.svg'
import decoSparkle from '../../assets/deco-sparkle.svg'
import decoDashedCurve from '../../assets/deco-dashed-curve.svg'

const props = defineProps({
  contentHtml: { type: String, default: '' },
  images: { type: Array, default: () => [] },
  userName: { type: String, default: 'ผู้ใช้' },
  userRole: { type: String, default: '' },
  userWorkplace: { type: String, default: '' },
  projectLabel: { type: String, default: '' },
  isSaving: { type: Boolean, default: false },
  reportSaved: { type: Boolean, default: false },
  hasTaiga: { type: Boolean, default: false },
  mode: { type: String, default: 'edit' },
  debug: { type: Boolean, default: false },
  reportProjectIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['copy', 'save', 'postTaiga'])

const store = useAppStore()
const { showToast } = useToast()

const copySuccess = ref(false)
const sectionCopyIdx = ref(-1)
const sectionCopyTaigaIdx = ref(-1)
const polaroidCopyIdx = ref(-1)
const flashActive = ref(false)
const hoveredSectionIdx = ref(-1)
const dropdownPos = ref({ top: 0, left: 0 })
let hideTimeout = null

function onSectionEnter(i, e) {
  clearTimeout(hideTimeout)
  hoveredSectionIdx.value = i
  const rect = e.currentTarget.getBoundingClientRect()
  dropdownPos.value = {
    top: rect.top + rect.height / 2,
    left: rect.right
  }
  // Prefetch Taiga tasks in background
  prefetchTaigaItems(i)

  // If Taiga submenu is already open, update to new section's project
  if (taigaSubmenuOpen.value) {
    const project = getSectionProject(i)
    if (project) {
      taigaSectionProject.value = project.id
      const cached = taigaCache.get(project.id)
      if (cached !== undefined && cached !== null) {
        taigaItems.value = cached
        taigaLoading.value = false
      } else {
        taigaItems.value = []
        taigaLoading.value = true
      }
    } else {
      // No Taiga project for this section — close submenu
      taigaSubmenuOpen.value = false
      taigaItems.value = []
      taigaLoading.value = false
      taigaSectionProject.value = null
    }
  }
}

function scheduleHide() {
  clearTimeout(hideTimeout)
  hideTimeout = setTimeout(() => {
    hoveredSectionIdx.value = -1
    taigaSubmenuOpen.value = false
    taigaItems.value = []
    taigaLoading.value = false
    taigaSectionProject.value = null
  }, 300)
}

function onDropdownEnter() {
  clearTimeout(hideTimeout)
}

function onDropdownLeave() {
  scheduleHide()
}

function handleSave() {
  flashActive.value = true
  setTimeout(() => {
    emit('save')
    showToast('กำลังบันทึกรายงาน...')
  }, 150)
  setTimeout(() => { flashActive.value = false }, 600)
}

/* Thai Buddhist date (e.g. 27/1/2569) */
const thaiDate = computed(() => {
  const now = new Date()
  const day = now.getDate()
  const month = now.getMonth() + 1
  const buddhistYear = now.getFullYear() + 543
  return `${day}/${month}/${buddhistYear}`
})

const DISPLAY_POLAROID_SLOTS = 5
const displayedPolaroids = computed(() => props.images.slice(0, DISPLAY_POLAROID_SLOTS))
const overflowImageCount = computed(() => Math.max(0, props.images.length - DISPLAY_POLAROID_SLOTS))

/* Split content into per-project sections */
const contentSections = computed(() => {
  if (!props.contentHtml) return []
  // Try <hr> first
  let sections = props.contentHtml.split(/<hr\s*\/?>/i).filter(s => s.trim())
  if (sections.length > 1) return sections
  // Fallback: split before each <p> that starts with "โครงการ"
  sections = props.contentHtml.split(/(?=<p[^>]*>\s*โครงการ)/i).filter(s => s.trim())
  return sections
})

const polaroidPositions = [
  { top: '-30px', left: '-200px', rotate: '-8deg', tapeColor: '#FFD700' },
  { top: '10px', right: '-200px', rotate: '5deg', tapeColor: '#64B5F6' },
  { top: '220px', left: '-210px', rotate: '6deg', tapeColor: '#81C784' },
  { top: '250px', right: '-190px', rotate: '-4deg', tapeColor: '#FFB74D' },
  { bottom: '20px', left: '-180px', rotate: '8deg', tapeColor: '#CE93D8' },
]

const activePolaroids = computed(() => displayedPolaroids.value)

function handleCopy() {
  const dateLine = `งานประจำวันที่ ${thaiDate.value}`
  const headerParts = []
  if (props.projectLabel) headerParts.push(`โครงการ : ${props.projectLabel}`)
  if (props.userWorkplace) headerParts.push(`สถานที่ปฏิบัติงาน : ${props.userWorkplace}`)
  if (props.userName) headerParts.push(`ผู้ปฏิบัติงาน: ${props.userName}`)
  if (props.userRole) headerParts.push(`ตำแหน่ง: ${props.userRole}`)
  headerParts.push(dateLine)

  const headerHtml = headerParts.map(p => `<p><strong>${p}</strong></p>`).join('')
  const richHtml = headerHtml + (props.contentHtml || '')
  const plainText = headerParts.join('\n') + '\n\n' + htmlToPlainText(props.contentHtml || '')

  const blob = new Blob([richHtml], { type: 'text/html' })
  const textBlob = new Blob([plainText], { type: 'text/plain' })
  navigator.clipboard.write([
    new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })
  ])

  emit('copy')
  copySuccess.value = true
  showToast('คัดลอกทั้งหมดแล้ว')
  setTimeout(() => { copySuccess.value = false }, 2000)
}

function htmlToPlainText(html) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  // Convert <li> to "• " prefixed lines
  tmp.querySelectorAll('li').forEach(li => {
    li.textContent = '• ' + li.textContent
  })
  // Convert block elements to newlines
  tmp.querySelectorAll('p, br, div, h1, h2, h3, h4, h5, h6').forEach(el => {
    el.before('\n')
  })
  tmp.querySelectorAll('ol, ul').forEach(el => {
    el.before('\n')
  })
  return tmp.textContent.replace(/\n{3,}/g, '\n\n').trim()
}

function copySection(html, idx) {
  const dateLine = `งานประจำวันที่ ${thaiDate.value}`
  const richHtml = `<p><strong>${dateLine}</strong></p>${html.trim()}`
  const plainText = `${dateLine}\n\n${htmlToPlainText(html)}`

  const blob = new Blob([richHtml], { type: 'text/html' })
  const textBlob = new Blob([plainText], { type: 'text/plain' })
  navigator.clipboard.write([
    new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })
  ])

  sectionCopyIdx.value = idx
  showToast('คัดลอกส่วนนี้แล้ว')
  setTimeout(() => { sectionCopyIdx.value = -1 }, 1500)
}

// Get the project for the currently hovered section
function getSectionProject(sectionIdx) {
  const projectId = props.reportProjectIds[sectionIdx]
  if (!projectId) return null
  return store.projects.find(p => p.id === projectId && p.taigaUrl) || null
}

const taigaSubmenuOpen = ref(false)
const taigaLoading = ref(false)
const taigaItems = ref([])
const taigaSectionProject = ref(null)
const taigaCache = new Map() // projectId → items[]

async function prefetchTaigaItems(sectionIdx) {
  const project = getSectionProject(sectionIdx)
  if (!project || taigaCache.has(project.id)) return

  const { isAuthenticated, resolveProject, getMyTasks, getMyUserStories, extractSlugFromUrl, getCredentials } = useTaiga()
  if (!isAuthenticated()) return

  const { getProxyUrl } = useAI()
  const proxyUrl = getProxyUrl()
  const creds = getCredentials()
  const slug = extractSlugFromUrl(project.taigaUrl)
  if (!slug) return

  // Mark as loading to prevent duplicate fetches
  taigaCache.set(project.id, null)

  try {
    const resolved = await resolveProject(proxyUrl, slug)
    const projectId = resolved.project
    const [tasks, userStories] = await Promise.all([
      getMyTasks(proxyUrl, projectId).catch(() => []),
      getMyUserStories(proxyUrl, projectId).catch(() => []),
    ])
    const items = [
      ...tasks.map(t => ({ ...t, _type: 'task', _slug: slug, _baseUrl: creds.baseUrl })),
      ...userStories.map(us => ({ ...us, _type: 'userstory', _slug: slug, _baseUrl: creds.baseUrl })),
    ]
    taigaCache.set(project.id, items)

    // If user is still hovering same section, update reactive state
    if (taigaSectionProject.value === project.id) {
      taigaItems.value = items
      taigaLoading.value = false
    }
  } catch (err) {
    console.error(`Failed to load items for ${project.name}:`, err)
    taigaCache.set(project.id, [])
    if (taigaSectionProject.value === project.id) {
      taigaItems.value = []
      taigaLoading.value = false
    }
  }
}

function openTaigaSubmenu() {
  const project = getSectionProject(hoveredSectionIdx.value)
  if (!project) {
    showToast('โครงการนี้ไม่มี Taiga URL')
    return
  }

  taigaSubmenuOpen.value = true
  taigaSectionProject.value = project.id

  const cached = taigaCache.get(project.id)
  if (cached !== undefined && cached !== null) {
    // Already fetched
    taigaItems.value = cached
    taigaLoading.value = false
  } else {
    // Still loading (prefetch in progress) or not started
    taigaItems.value = []
    taigaLoading.value = true
    if (!taigaCache.has(project.id)) {
      prefetchTaigaItems(hoveredSectionIdx.value)
    }
  }
}

function getTaigaItemUrl(item) {
  const type = item._type === 'userstory' ? 'us' : 'task'
  return `${item._baseUrl}/project/${item._slug}/${type}/${item.ref}`
}

function copyTaigaItemUrl(item) {
  const url = getTaigaItemUrl(item)
  navigator.clipboard.writeText(url)
  taigaSubmenuOpen.value = false
  sectionCopyTaigaIdx.value = hoveredSectionIdx.value
  const typeLabel = item._type === 'userstory' ? 'US' : 'Task'
  showToast(`คัดลอก URL: ${typeLabel} #${item.ref}`)
  setTimeout(() => { sectionCopyTaigaIdx.value = -1 }, 1500)
}

async function copyPolaroidImage(dataUrl, idx) {
  try {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const pngBlob = blob.type === 'image/png' ? blob : new Blob([await blob.arrayBuffer()], { type: 'image/png' })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
    polaroidCopyIdx.value = idx
    showToast('คัดลอกรูปภาพแล้ว')
    setTimeout(() => { polaroidCopyIdx.value = -1 }, 1500)
  } catch {
    // Fallback: copy data URL as text
    await navigator.clipboard.writeText(dataUrl)
    polaroidCopyIdx.value = idx
    showToast('คัดลอกรูปภาพแล้ว')
    setTimeout(() => { polaroidCopyIdx.value = -1 }, 1500)
  }
}
</script>

<template>
  <div class="today-template">

    <!-- Camera flash overlay -->
    <div v-if="flashActive" class="camera-flash"></div>

    <!-- Decorative background elements -->
    <img :src="decoDashedCurve" alt="" class="deco deco-curve" />
    <img :src="decoCloud" alt="" class="deco deco-cloud" />
    <img :src="decoBubble" alt="" class="deco deco-bubble" />
    <img :src="decoSmiley" alt="" class="deco deco-smiley" />
    <img :src="decoSparkle" alt="" class="deco deco-sparkle" />

    <!-- Content -->
    <div class="today-template-content">
      <div class="today-template-title-row">
        <h2 class="today-template-title">เทมเพลตของวันนี้</h2>
        <span class="today-template-badge">พร้อมแล้ว</span>
      </div>

      <div class="today-template-card-area">
        <!-- Card + polaroids wrapper (polaroids position relative to this) -->
        <div class="today-template-card-wrapper">
          <!-- Decorative polaroids -->
          <div v-for="(img, i) in activePolaroids" :key="img.id" class="today-template-polaroid"
            :class="{ copied: polaroidCopyIdx === i }"
            :style="{
              top: polaroidPositions[i]?.top,
              bottom: polaroidPositions[i]?.bottom,
              left: polaroidPositions[i]?.left,
              right: polaroidPositions[i]?.right,
              transform: `rotate(${polaroidPositions[i]?.rotate || '0deg'})`
            }"
            @click="copyPolaroidImage(img.data, i)">
            <div class="today-template-polaroid-tape" :style="{ background: polaroidPositions[i]?.tapeColor }"></div>
            <img :src="img.data" alt="Screenshot" class="today-template-polaroid-img" />
            <span class="today-template-polaroid-copy-icon">
              <IconCheck v-if="polaroidCopyIdx === i" :size="14" color="#16A34A" />
              <IconCopy v-else :size="14" color="#555" />
            </span>
          </div>

          <!-- Overflow sticky note -->
          <div v-if="overflowImageCount > 0" class="today-template-sticky-note">
            <span>+{{ overflowImageCount }} รูปภาพ</span>
          </div>

          <!-- Summary card -->
        <div class="today-template-card">
          <div class="today-template-card-header">
            <span class="today-template-card-user">{{ userName }}</span>
            <button class="today-template-copy-btn" :class="{ copied: copySuccess }" @click="handleCopy">
              <IconCheck v-if="copySuccess" :size="14" color="#16A34A" />
              <IconCopy v-else :size="14" />
              <span>{{ copySuccess ? 'คัดลอกแล้ว' : 'คัดลอกทั้งหมด' }}</span>
            </button>
          </div>
          <div class="today-template-card-divider"></div>
          <div class="today-template-card-body">
            <!-- User template header -->
            <div class="today-template-header-info">
              <p v-if="projectLabel"><strong>โครงการ :</strong> {{ projectLabel }}</p>
              <p v-if="userWorkplace"><strong>สถานที่ปฏิบัติงาน :</strong> {{ userWorkplace }}</p>
              <p v-if="userName"><strong>ผู้ปฏิบัติงาน:</strong> {{ userName }}</p>
              <p v-if="userRole"><strong>ตำแหน่ง:</strong> {{ userRole }}</p>
              <p><strong>งานประจำวันที่</strong> {{ thaiDate }}</p>
            </div>
            <div v-if="contentSections.length" class="section-divider"></div>

            <div v-for="(section, i) in contentSections" :key="i" class="today-template-section"
              :class="{ copied: sectionCopyIdx === i || sectionCopyTaigaIdx === i, hovered: hoveredSectionIdx === i }"
              @mouseenter="onSectionEnter(i, $event)" @mouseleave="scheduleHide">
              <div class="section-inner" v-html="section"></div>
              <div v-if="i < contentSections.length - 1" class="section-divider"></div>
            </div>
          </div>

          <!-- Bottom action bar — sticky inside card -->
          <div class="today-template-bottom-bar">
            <div class="today-template-bottom-actions">
              <!-- Readonly mode (main page) -->
              <template v-if="mode === 'readonly'">
                <BaseButton v-if="hasTaiga" variant="outline" size="lg" @click="emit('postTaiga')">
                  <img :src="taigaLogo" alt="Taiga" class="w-5 h-5">
                  โพสต์ Taiga
                </BaseButton>
                <BaseButton variant="primary" size="lg" class="!bg-[var(--secondary-brand)] !border-[var(--secondary-brand)] !text-[var(--primary-brand)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  แชร์ให้ผู้อื่น
                </BaseButton>
              </template>
              <!-- Edit mode (daily flow) -->
              <template v-else>
                <BaseButton v-if="hasTaiga" variant="outline" size="md" @click="emit('postTaiga')">
                  <img :src="taigaLogo" alt="Taiga" class="w-5 h-5">
                  โพสต์ Taiga
                </BaseButton>
                <BaseButton variant="primary" size="md" class="!bg-[#16A34A] !border-[#16A34A] hover:!bg-[#15803D] hover:!shadow-[4px_4px_0px_rgba(22,163,74,0.2)]" :disabled="isSaving || reportSaved" @click="handleSave">
                  <IconCheck :size="16" color="white" />
                  {{ reportSaved ? 'บันทึกแล้ว' : 'บันทึกรายงานวันนี้' }}
                </BaseButton>
              </template>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="dropdown">
      <div v-if="hoveredSectionIdx >= 0" class="section-dropdown-teleport"
        :style="{ top: dropdownPos.top + 'px', left: dropdownPos.left + 'px' }"
        @mouseenter="onDropdownEnter" @mouseleave="onDropdownLeave">
        <button class="section-menu-btn" @click="copySection(contentSections[hoveredSectionIdx], hoveredSectionIdx)">
          <IconCheck v-if="sectionCopyIdx === hoveredSectionIdx" :size="14" color="#16A34A" />
          <IconCopy v-else :size="14" color="#194987" />
          <span>{{ sectionCopyIdx === hoveredSectionIdx ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ' }}</span>
        </button>
        <template v-if="debug || getSectionProject(hoveredSectionIdx)">
          <div v-if="!taigaSubmenuOpen" class="section-menu-btn" @click="openTaigaSubmenu">
            <IconCheck v-if="sectionCopyTaigaIdx === hoveredSectionIdx" :size="14" color="#16A34A" />
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#194987" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span>{{ sectionCopyTaigaIdx === hoveredSectionIdx ? 'คัดลอกแล้ว' : 'คัดลอก Taiga URL' }}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#194987" stroke-width="2.5" style="margin-left:2px"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <template v-else>
            <div class="taiga-group-label">{{ store.projects.find(p => p.id === taigaSectionProject)?.name }}</div>
            <div v-if="taigaLoading" class="section-menu-btn taiga-loading">
              <div class="taiga-mini-spinner"></div>
              <span>กำลังโหลด...</span>
            </div>
            <template v-else-if="taigaItems.length > 0">
              <button v-for="item in taigaItems" :key="item._type + '-' + item.id"
                class="section-menu-btn taiga-item-btn" @click="copyTaigaItemUrl(item)">
                <span class="taiga-type-badge" :class="item._type">{{ item._type === 'userstory' ? 'US' : 'Task' }}</span>
                <span class="taiga-item-ref">#{{ item.ref }}</span>
                <span class="taiga-item-subject">{{ item.subject }}</span>
              </button>
            </template>
            <div v-else class="section-menu-btn taiga-loading">
              <span>ไม่พบงาน</span>
            </div>
          </template>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.today-template {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100vh;
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.today-template-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  flex: 1;
  min-height: 0;
  padding: 24px 0 124px;
  overflow: visible;
}

/* Title row */
.today-template-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.today-template-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #ffffff;
}

.today-template-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 16px;
  background: #16A34A;
  color: white;
  border-radius: 9999px;
  font-size: 0.9rem;
  font-weight: 600;
}

/* Card area */
.today-template-card-area {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Card + polaroids wrapper — centered, polaroids position relative to this */
.today-template-card-wrapper {
  position: relative;
  width: 520px;
  flex: 1;
  min-height: 0;
  margin: 16px auto 0;
}

/* Summary card */
.today-template-card {
  width: 100%;
  height: 100%;
  background: #FFFFFF;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 2;
  position: relative;
}

.today-template-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  flex-shrink: 0;
}

.today-template-card-user {
  font-size: 1rem;
  font-weight: 600;
  color: #1e1e1e;
}

.today-template-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1.5px solid #e5e5e5;
  border-radius: 8px;
  background: white;
  color: #555;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.today-template-copy-btn:hover {
  border-color: #194987;
  color: #194987;
  background: #f0f7ff;
}

.today-template-copy-btn.copied {
  border-color: #16A34A;
  color: #16A34A;
  background: #F0FDF4;
}

.today-template-card-divider {
  height: 1px;
  background: #e5e5e5;
  flex-shrink: 0;
}

.today-template-card-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  font-size: 14px;
  line-height: 1.8;
  color: #1e1e1e;
  font-family: 'Google Sans', 'Google Sans Text', -apple-system, BlinkMacSystemFont, sans-serif;
}

.today-template-card-body :deep(ol) {
  list-style: decimal;
  padding-left: 1.5em;
}

.today-template-card-body :deep(ul) {
  list-style: disc;
  padding-left: 1.5em;
}

.today-template-card-body :deep(p) {
  margin-bottom: 0.5em;
}

/* User template header info */
.today-template-header-info p {
  margin-bottom: 0.3em;
  font-size: 14px;
  line-height: 1.8;
  color: #1e1e1e;
}

.today-template-header-info p strong {
  font-weight: 700;
}

/* Section-level hover */
.today-template-section {
  position: relative;
  padding: 8px;
  border-radius: 12px;
  transition: background 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.today-template-section:hover {
  background: rgba(43, 127, 255, 0.06);
}

.today-template-section.copied {
  background: rgba(22, 163, 74, 0.06);
}


.section-divider {
  height: 1px;
  background: #e5e5e5;
  margin-top: 12px;
}

/* Decorative polaroids */
.today-template-polaroid {
  position: absolute;
  width: 150px;
  background: white;
  padding: 8px 8px 28px;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 1;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.2s ease;
}

.today-template-polaroid:hover {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  z-index: 3;
}

.today-template-polaroid:active {
  transform: scale(0.95) !important;
}

.today-template-polaroid.copied {
  box-shadow: 0 4px 16px rgba(22, 163, 74, 0.25);
}

.today-template-polaroid-tape {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%) rotate(-2deg);
  width: 54px;
  height: 18px;
  border-radius: 2px;
  opacity: 0.8;
}

.today-template-polaroid-img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border: 1px solid #e5e5e5;
  border-radius: 2px;
  display: block;
  background: #ffffff;
}

.today-template-polaroid-copy-icon {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.today-template-polaroid:hover .today-template-polaroid-copy-icon {
  opacity: 1;
}

.today-template-polaroid.copied .today-template-polaroid-copy-icon {
  opacity: 1;
}

/* Overflow sticky note */
.today-template-sticky-note {
  position: absolute;
  bottom: 30px;
  right: -220px;
  width: 110px;
  padding: 16px 12px;
  background: #FEF3C7;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: rotate(3deg);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.9rem;
  font-weight: 700;
  color: #DC2626;
  z-index: 1;
}

/* Bottom action bar — sticky inside card */
.today-template-bottom-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border-top: 1px solid #e5e5e5;
  border-radius: 0 0 16px 16px;
  flex-shrink: 0;
  gap: 8px;
}

.today-template-bottom-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: #5f6368;
  min-width: 0;
  flex-shrink: 1;
}

.today-template-bottom-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}


/* Decorative background elements */
.deco {
  position: absolute;
  pointer-events: none;
  user-select: none;
  z-index: 0;
}

.deco-curve {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  opacity: 0.7;
}

.deco-cloud {
  bottom: 40px;
  left: 24px;
  width: 140px;
  opacity: 0.85;
}

.deco-bubble {
  top: 80px;
  right: 24px;
  width: 140px;
  opacity: 0.85;
}

.deco-smiley {
  top: 120px;
  left: 40px;
  width: 70px;
  opacity: 0.8;
}

.deco-sparkle {
  bottom: 60px;
  right: 40px;
  width: 100px;
  opacity: 0.7;
}

/* Camera flash effect */
.camera-flash {
  position: fixed;
  inset: 0;
  background: white;
  z-index: 9999;
  animation: flash-burst 0.5s ease-out forwards;
  pointer-events: none;
}

@keyframes flash-burst {
  0% { opacity: 0; }
  15% { opacity: 1; }
  100% { opacity: 0; }
}

/* Responsive: hide decorative elements on narrow screens */
@media (max-width: 1000px) {

  .today-template-polaroid,
  .today-template-sticky-note,
  .deco {
    display: none;
  }
}
</style>

<style>
/* Teleported dropdown — must be unscoped */
.section-dropdown-teleport {
  position: fixed;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  padding-left: 20px;
  margin-left: -14px;
  background: transparent;
  z-index: 9999;
}

.section-dropdown-teleport::before {
  content: '';
  position: absolute;
  inset: 0;
  left: 14px;
  background: white;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: -1;
}

.section-dropdown-teleport .section-menu-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: white;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  color: #194987;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.section-dropdown-teleport .section-menu-btn:hover {
  background: #f0f7ff;
}

.section-dropdown-teleport .taiga-group-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 14px 0;
}

.section-dropdown-teleport .taiga-item-btn {
  font-size: 0.75rem;
  color: #374151;
  gap: 5px;
}

.section-dropdown-teleport .taiga-item-subject {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.section-dropdown-teleport .taiga-item-ref {
  font-weight: 700;
  color: #194987;
  font-size: 0.7rem;
}

.section-dropdown-teleport .taiga-type-badge {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.section-dropdown-teleport .taiga-type-badge.task {
  background: #e0f0e0;
  color: #2a7a2a;
}

.section-dropdown-teleport .taiga-type-badge.userstory {
  background: #e0e8f5;
  color: #3a5a9a;
}

.section-dropdown-teleport .taiga-loading {
  color: #999;
  cursor: default;
}

.section-dropdown-teleport .taiga-loading:hover {
  background: white;
}

.taiga-mini-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #e5e5e5;
  border-top-color: #194987;
  border-radius: 50%;
  animation: taiga-mini-spin 0.8s linear infinite;
}

@keyframes taiga-mini-spin {
  to { transform: rotate(360deg); }
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-4px);
}
</style>
