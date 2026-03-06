<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { useAppStore } from '../../stores/app'
import { useToast } from '../../composables/useToast'
import { useImages } from '../../composables/useImages'
import { useUtils } from '../../composables/useUtils'
import { useAI } from '../../composables/useAI'
import { useTaiga } from '../../composables/useTaiga'
import { useSupabase } from '../../composables/useSupabase'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseButton from '../ui/BaseButton.vue'
import { IconPerson, IconBadge, IconLocation, IconFolderOpen, IconLink, IconAdd, IconDelete, IconUpload } from '../icons'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  initialTab: {
    type: String,
    default: 'personal'
  }
})

const emit = defineEmits(['close', 'dataDeleted'])

const store = useAppStore()
const { showToast } = useToast()
const { handleProfileImage: processProfileImage } = useImages()
const { stripHtml, downloadFile } = useUtils()
const { getProxyUrl, setProxyUrl } = useAI()
const { isAuthenticated: isTaigaAuthenticated, getCredentials: getTaigaCredentials, login: taigaLogin, logout: taigaLogout, isLoading: taigaLoading, taigaError } = useTaiga()
const { deleteAccount, user: supabaseUser } = useSupabase()

const activeTab = ref('personal')
const aiProxyUrl = ref('')
const showDeleteConfirm = ref(false)
const showDeleteAccountConfirm = ref(false)
const showClearTodayConfirm = ref(false)
const showClearAllReportsConfirm = ref(false)
const isTestMode = import.meta.env.VITE_TEST_MODE === 'true'

// Taiga
const taigaBaseUrl = ref('')
const taigaUsername = ref('')
const taigaPassword = ref('')
const taigaConnected = ref(false)
const taigaConnectedUser = ref('')

// Personal info
const userName = ref('')
const userRole = ref('')
const userWorkplace = ref('')
const userProjectLabel = ref('')
const userProfileImage = ref('')

// Project editing
const editingProjectId = ref(null)
const newProjectName = ref('')
const newProjectUrl = ref('')
const newProjectTemplate = ref('')

// Quill options
const toolbarOptions = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ 'list': 'ordered' }, { 'list': 'bullet' }],
  [{ 'indent': '-1' }, { 'indent': '+1' }],
  [{ 'color': [] }, { 'background': [] }],
  ['clean']
]

watch(() => props.show, (newVal) => {
  if (newVal) {
    loadUserData()
    loadTaigaState()
    activeTab.value = props.initialTab
    resetProjectForm()
    aiProxyUrl.value = getProxyUrl()
  }
})

function loadUserData() {
  userName.value = store.user.name
  userRole.value = store.user.role
  userWorkplace.value = store.user.workplace
  userProjectLabel.value = store.user.projectLabel
  userProfileImage.value = store.user.profileImage
}

function switchTab(tab) {
  activeTab.value = tab
}

async function onProfileImageChange(event) {
  const file = event.target.files[0]
  if (!file) return

  const result = await processProfileImage(file)
  if (result.success) {
    userProfileImage.value = result.data
    store.setUser({ profileImage: result.data })
    showToast('อัปเดตรูปโปรไฟล์แล้ว')
  } else {
    showToast(result.message)
  }
}

function saveUserSettings() {
  store.setUser({
    name: userName.value || 'ผู้ใช้',
    role: userRole.value || 'พนักงาน',
    workplace: userWorkplace.value || 'สำนักงาน',
    projectLabel: userProjectLabel.value || ''
  })
  showToast('บันทึกข้อมูลส่วนตัวแล้ว')
}

function saveAISettings() {
  setProxyUrl(aiProxyUrl.value.trim())
  showToast('บันทึกการตั้งค่า AI แล้ว')
}

function loadTaigaState() {
  taigaConnected.value = isTaigaAuthenticated()
  if (taigaConnected.value) {
    const creds = getTaigaCredentials()
    taigaConnectedUser.value = creds?.fullName || creds?.username || ''
    taigaBaseUrl.value = creds?.baseUrl || ''
  } else {
    taigaBaseUrl.value = ''
    taigaUsername.value = ''
    taigaPassword.value = ''
    taigaConnectedUser.value = ''
  }
}

async function connectTaiga() {
  const proxyUrl = getProxyUrl()
  if (!proxyUrl) {
    showToast('กรุณาตั้งค่า AI Proxy URL ก่อน (ใช้ Worker เดียวกัน)')
    return
  }
  const base = taigaBaseUrl.value.trim()
  const user = taigaUsername.value.trim()
  const pass = taigaPassword.value
  if (!base || !user || !pass) {
    showToast('กรุณากรอกข้อมูลให้ครบ')
    return
  }
  const result = await taigaLogin(proxyUrl, base, user, pass)
  if (result.success) {
    taigaPassword.value = ''
    loadTaigaState()
    showToast('เชื่อมต่อ Taiga สำเร็จ')
  } else {
    showToast(result.error || 'เชื่อมต่อไม่สำเร็จ')
  }
}

function disconnectTaiga() {
  taigaLogout()
  loadTaigaState()
  showToast('ยกเลิกการเชื่อมต่อ Taiga แล้ว')
}

function exportData() {
  const exportObj = store.exportData()
  const jsonString = JSON.stringify(exportObj, null, 2)

  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
  const filename = `hurryup-backup-${dateStr}_${timeStr}.json`

  downloadFile(jsonString, filename)
  showToast('ส่งออกข้อมูลสำเร็จ')
}

function confirmDeleteAll() {
  showDeleteConfirm.value = true
}

async function deleteAllData() {
  try {
    await deleteAccount()
    store.deleteAllData()
    localStorage.clear()
    showDeleteConfirm.value = false
    emit('close')
    emit('dataDeleted')
    showToast('ลบข้อมูลทั้งหมดเรียบร้อยแล้ว')
  } catch (e) {
    showToast('ลบข้อมูลไม่สำเร็จ: ' + e.message)
  }
}

function clearTodayReport() {
  store.clearTodayReport()
  showClearTodayConfirm.value = false
  showToast('ลบรายงานวันนี้แล้ว')
}

function clearAllReports() {
  store.clearAllReports()
  showClearAllReportsConfirm.value = false
  showToast('ลบรายงานทั้งหมดแล้ว')
}

async function handleDeleteAccount() {
  try {
    await deleteAccount()
    store.deleteAllData()
    showDeleteAccountConfirm.value = false
    emit('close')
    emit('dataDeleted')
    showToast('ลบบัญชีเรียบร้อยแล้ว')
  } catch (e) {
    showToast('ไม่สามารถลบบัญชีได้: ' + e.message)
  }
}

// Project management
function resetProjectForm() {
  editingProjectId.value = null
  newProjectName.value = ''
  newProjectUrl.value = ''
  newProjectTemplate.value = ''
}

function editProject(project) {
  editingProjectId.value = project.id
  newProjectName.value = project.name
  newProjectUrl.value = project.taigaUrl || ''
  newProjectTemplate.value = project.template || store.DEFAULT_TEMPLATE
  nextTick(() => {
    document.getElementById('projectFormSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function cancelEdit() {
  resetProjectForm()
}

function saveProject() {
  const name = newProjectName.value.trim()
  const url = newProjectUrl.value.trim()
  const template = newProjectTemplate.value || store.DEFAULT_TEMPLATE

  if (!name) {
    showToast('กรุณากรอกชื่อโครงการ')
    return
  }

  if (editingProjectId.value !== null) {
    store.updateProject(editingProjectId.value, { name, taigaUrl: url, template })
    showToast(`แก้ไขโครงการ "${name}" แล้ว`)
  } else {
    store.addProject({ name, taigaUrl: url, template })
    showToast(`เพิ่มโครงการ "${name}" แล้ว`)
  }

  resetProjectForm()
}

function deleteProject(project) {
  if (confirm(`ต้องการลบโครงการ "${project.name}" หรือไม่?`)) {
    store.deleteProject(project.id)
    if (editingProjectId.value === project.id) {
      resetProjectForm()
    }
    showToast('ลบโครงการแล้ว')
  }
}

function getTemplatePreview(template) {
  return stripHtml(template || store.DEFAULT_TEMPLATE).substring(0, 60) + '...'
}

function handleOverlayClick(e) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}

function saveCurrentTab() {
  if (activeTab.value === 'personal') {
    saveUserSettings()
  } else if (activeTab.value === 'ai') {
    saveAISettings()
  }
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <dialog class="modal" :class="{ 'modal-open': show }">
      <div class="modal-box modal-settings">
        <div class="modal-header">
          <h3 class="modal-title">จัดการข้อมูล</h3>
          <button class="btn btn-ghost btn-sm btn-circle" @click="emit('close')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="settings-layout">
          <!-- Sidebar Navigation -->
          <div class="settings-sidebar">
            <BaseButton
              variant="ghost"
              class="settings-nav-item"
              :class="{ active: activeTab === 'personal' }"
              @click="switchTab('personal')"
            >
              <IconPerson size="20" color="currentColor" />
              <span>ข้อมูลส่วนตัว</span>
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="settings-nav-item"
              :class="{ active: activeTab === 'projects' }"
              @click="switchTab('projects')"
            >
              <IconFolderOpen size="20" color="currentColor" />
              <span>จัดการโครงการ</span>
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="settings-nav-item"
              :class="{ active: activeTab === 'ai' }"
              @click="switchTab('ai')"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              <span>AI ตั้งค่า</span>
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="settings-nav-item"
              :class="{ active: activeTab === 'taiga' }"
              @click="switchTab('taiga')"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>Taiga</span>
            </BaseButton>
            <BaseButton
              v-if="isTestMode"
              variant="ghost"
              class="settings-nav-item"
              :class="{ active: activeTab === 'devtools' }"
              @click="switchTab('devtools')"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              <span>Dev Tools</span>
            </BaseButton>
          </div>

          <!-- Content Area -->
          <div class="settings-content">
            <!-- Personal Info Tab -->
            <div v-show="activeTab === 'personal'" class="settings-tab active">
              <div class="flex justify-center mb-5">
                <label class="relative cursor-pointer group">
                  <div class="w-24 h-24 rounded-full bg-[var(--surface)] flex items-center justify-center overflow-hidden transition-colors">
                    <img v-if="userProfileImage" :src="userProfileImage" alt="Profile" class="w-full h-full object-cover">
                    <IconPerson v-else :size="24" color="var(--secondary-text)" />
                  </div>
                  <div class="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[var(--primary-brand)] flex items-center justify-center border-4 border-white">
                    <IconAdd size="16" color="#ffffff" />
                  </div>
                  <input type="file" accept="image/*" class="hidden" @change="onProfileImageChange">
                </label>
              </div>

              <div class="form-group">
                <label class="form-label">ชื่อ-นามสกุล</label>
                <BaseInput v-model="userName" placeholder="เช่น ภัทรพล">
                  <template #icon><IconPerson size="16" color="var(--secondary-text)" /></template>
                </BaseInput>
              </div>
              <div class="form-group">
                <label class="form-label">ตำแหน่ง</label>
                <BaseInput v-model="userRole" placeholder="เช่น เจ้าหน้าที่ออกแบบแอปพลิเคชัน">
                  <template #icon><IconBadge size="16" color="var(--secondary-text)" /></template>
                </BaseInput>
              </div>
              <div class="form-group">
                <label class="form-label">สถานที่ปฏิบัติงาน</label>
                <BaseInput v-model="userWorkplace" placeholder="เช่น ศูนย์เทคโนโลยีสารสนเทศ">
                  <template #icon><IconLocation size="16" color="var(--secondary-text)" /></template>
                </BaseInput>
              </div>
              <div class="form-group">
                <label class="form-label">ชื่อโครงการ (แสดงในบล็อก)</label>
                <BaseInput v-model="userProjectLabel" placeholder="เช่น รายงานการทำงานประจำวัน เข้า Office (ฝ่ายพัฒนาระบบ)">
                  <template #icon><IconFolderOpen size="16" color="var(--secondary-text)" /></template>
                </BaseInput>
              </div>

              <div class="settings-divider"></div>

              <!-- Export Data Section -->
              <div class="export-zone">
                <div class="settings-section-title">ส่งออกข้อมูล</div>
                <p class="export-zone-description">ดาวน์โหลดข้อมูลทั้งหมดของคุณเป็นไฟล์ JSON รวมถึงโปรไฟล์ โครงการ และประวัติการรายงาน</p>
                <BaseButton variant="outline" @click="exportData">
                  <IconUpload :size="18" color="currentColor" />
                  ส่งออกข้อมูล
                </BaseButton>
              </div>

              <div class="settings-divider"></div>

              <div class="danger-zone">
                <div class="settings-section-title" style="color: #c00;">ลบข้อมูลทั้งหมด</div>
                <p class="danger-zone-description">การดำเนินการนี้จะลบข้อมูลทั้งหมดของคุณ รวมถึงโปรไฟล์ โครงการ และประวัติการรายงาน และไม่สามารถกู้คืนได้</p>
                <BaseButton variant="danger" @click="confirmDeleteAll">
                  <IconDelete :size="18" color="currentColor" />
                  ลบข้อมูลทั้งหมด
                </BaseButton>
              </div>

              <div v-if="supabaseUser" class="danger-zone" style="margin-top: 8px;">
                <div class="settings-section-title" style="color: #c00;">ลบบัญชีผู้ใช้</div>
                <p class="danger-zone-description">ลบบัญชีผู้ใช้และข้อมูลทั้งหมดจากระบบอย่างถาวร รวมถึงข้อมูลบนคลาวด์ ไม่สามารถกู้คืนได้</p>
                <BaseButton variant="danger" @click="showDeleteAccountConfirm = true">
                  <IconDelete :size="18" color="currentColor" />
                  ลบบัญชีผู้ใช้
                </BaseButton>
              </div>
            </div>

            <!-- Projects Tab -->
            <div v-show="activeTab === 'projects'" class="settings-tab active">
              <div class="project-list">
                <div
                  v-for="project in store.projects"
                  :key="project.id"
                  class="project-item"
                >
                  <div class="project-info">
                    <div class="project-name">{{ project.name }}</div>
                    <div class="project-url">{{ project.taigaUrl || '-' }}</div>
                    <div class="project-template-preview">เทมเพลต: {{ getTemplatePreview(project.template) }}</div>
                  </div>
                  <div class="project-actions">
                    <BaseButton variant="outline" size="sm" @click="editProject(project)">แก้ไข</BaseButton>
                    <BaseButton variant="danger" size="sm" @click="deleteProject(project)">ลบ</BaseButton>
                  </div>
                </div>
                <p v-if="store.projects.length === 0" style="color: #999; text-align: center; padding: 20px;">
                  ยังไม่มีโครงการ
                </p>
              </div>

              <div id="projectFormSection">
                <h4 style="font-size: 14px; margin-bottom: 12px;">
                  {{ editingProjectId ? 'แก้ไขโครงการ' : 'เพิ่มโครงการใหม่' }}
                </h4>
                <div class="form-group">
                  <label class="form-label">ชื่อโครงการ</label>
                  <BaseInput v-model="newProjectName" placeholder="เช่น BMS DesignKit">
                    <template #icon><IconFolderOpen size="16" color="var(--secondary-text)" /></template>
                  </BaseInput>
                </div>
                <div class="form-group">
                  <label class="form-label">Taiga URL</label>
                  <BaseInput v-model="newProjectUrl" placeholder="https://taiga.example.com/project/...">
                    <template #icon><IconLink size="16" color="var(--secondary-text)" /></template>
                  </BaseInput>
                </div>
                <div class="form-group">
                  <label class="form-label">เทมเพลตรายงาน</label>
                  <QuillEditor
                    v-model:content="newProjectTemplate"
                    content-type="html"
                    :toolbar="toolbarOptions"
                    placeholder="โครงการ: {project} ประกอบไปด้วยผลการดำเนินงาน ดังนี้"
                    theme="snow"
                  />
                  <p class="form-hint">
                    ใช้ <code style="background: #e5edf5; padding: 2px 6px; border-radius: 3px; color: #194987;">{project}</code> แทนชื่อโครงการ
                  </p>
                </div>
                <div class="btn-group">
                  <BaseButton v-if="editingProjectId" variant="secondary" @click="cancelEdit">ยกเลิก</BaseButton>
                  <BaseButton variant="primary" @click="saveProject">
                    {{ editingProjectId ? 'บันทึกการแก้ไข' : 'เพิ่มโครงการ' }}
                  </BaseButton>
                </div>
              </div>
            </div>

            <!-- AI Settings Tab -->
            <div v-show="activeTab === 'ai'" class="settings-tab active">
              <div class="form-group">
                <label class="form-label">AI Proxy URL</label>
                <BaseInput v-model="aiProxyUrl" placeholder="https://hurryup-ai-proxy.workers.dev">
                  <template #icon><IconLink size="16" color="var(--secondary-text)" /></template>
                </BaseInput>
                <p class="form-hint">URL ของ Cloudflare Worker ที่เชื่อมต่อกับ Claude API</p>
              </div>
              <div class="form-group">
                <p class="text-xs text-gray-400" style="line-height: 1.6;">
                  วิธีตั้งค่า: Deploy Cloudflare Worker จากโฟลเดอร์ <code style="background: #e5edf5; padding: 2px 6px; border-radius: 3px; color: #194987;">api/</code> แล้วนำ URL มาใส่ที่นี่
                </p>
              </div>
              <BaseButton variant="primary" @click="saveAISettings">บันทึกการตั้งค่า AI</BaseButton>
            </div>

            <!-- Taiga Tab -->
            <div v-show="activeTab === 'taiga'" class="settings-tab active">
              <!-- Connected state -->
              <div v-if="taigaConnected">
                <div class="taiga-connected-banner">
                  <div class="taiga-connected-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  </div>
                  <div>
                    <div style="font-weight: 600; color: #333;">เชื่อมต่อแล้ว</div>
                    <div style="font-size: 13px; color: #666;">{{ taigaConnectedUser }} &middot; {{ taigaBaseUrl }}</div>
                  </div>
                </div>
                <BaseButton variant="outline" @click="disconnectTaiga" style="margin-top: 16px;">
                  ยกเลิกการเชื่อมต่อ
                </BaseButton>
              </div>

              <!-- Not connected state -->
              <div v-else>
                <p style="font-size: 13px; color: #666; margin-bottom: 16px; line-height: 1.6;">
                  เชื่อมต่อกับ Taiga เพื่อโพสต์รายงานประจำวันเป็น comment บน task โดยอัตโนมัติ
                </p>
                <div class="form-group">
                  <label class="form-label">Taiga Server URL</label>
                  <BaseInput v-model="taigaBaseUrl" placeholder="https://taiga.example.com">
                    <template #icon><IconLink size="16" color="var(--secondary-text)" /></template>
                  </BaseInput>
                  <p class="form-hint">URL ของเซิร์ฟเวอร์ Taiga (ไม่ต้องมี /project/...)</p>
                </div>
                <div class="form-group">
                  <label class="form-label">ชื่อผู้ใช้</label>
                  <BaseInput v-model="taigaUsername" placeholder="username">
                    <template #icon><IconPerson size="16" color="var(--secondary-text)" /></template>
                  </BaseInput>
                </div>
                <div class="form-group">
                  <label class="form-label">รหัสผ่าน</label>
                  <BaseInput v-model="taigaPassword" type="password" placeholder="password">
                    <template #icon><IconBadge size="16" color="var(--secondary-text)" /></template>
                  </BaseInput>
                </div>
                <p v-if="taigaError" style="color: #c00; font-size: 13px; margin-bottom: 12px;">{{ taigaError }}</p>
                <BaseButton variant="primary" :disabled="taigaLoading" @click="connectTaiga">
                  {{ taigaLoading ? 'กำลังเชื่อมต่อ...' : 'เชื่อมต่อ Taiga' }}
                </BaseButton>
              </div>
            </div>

            <!-- Dev Tools Tab -->
            <div v-if="isTestMode" v-show="activeTab === 'devtools'" class="settings-tab active">
              <div class="devtools-banner">
                <span class="devtools-badge">TEST MODE</span>
                <span>เครื่องมือสำหรับนักพัฒนา</span>
              </div>

              <div class="devtools-section">
                <div class="settings-section-title">ล้างรายงานวันนี้</div>
                <p class="devtools-description">ลบเฉพาะรายงานของวันนี้ออก เพื่อทดสอบการสร้างรายงานใหม่</p>
                <BaseButton variant="outline" @click="showClearTodayConfirm = true">
                  <IconDelete :size="18" color="currentColor" />
                  ล้างรายงานวันนี้
                </BaseButton>
              </div>

              <div class="settings-divider"></div>

              <div class="devtools-section">
                <div class="settings-section-title">ล้างรายงานทั้งหมด</div>
                <p class="devtools-description">ลบรายงานทุกวันและข้อมูล heatmap ทั้งหมดออก (ไม่กระทบโปรไฟล์และโครงการ)</p>
                <BaseButton variant="danger" @click="showClearAllReportsConfirm = true">
                  <IconDelete :size="18" color="currentColor" />
                  ล้างรายงานทั้งหมด
                </BaseButton>
              </div>

              <div class="settings-divider"></div>

              <div class="devtools-section">
                <p class="devtools-description" style="opacity: 0.5;">
                  Reports in store: {{ store.reports.length }} |
                  Reported today: {{ store.hasReportedToday ? 'Yes' : 'No' }} |
                  localStorage: {{ Math.round(JSON.stringify(store.exportData()).length / 1024) }}KB
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <BaseButton variant="primary" @click="saveCurrentTab">บันทึก</BaseButton>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="emit('close')">close</button>
      </form>
    </dialog>
  </Teleport>

  <ConfirmDialog
    :show="showDeleteConfirm"
    title="ยืนยันการลบข้อมูลทั้งหมด"
    message="ข้อมูลทั้งหมดของคุณจะถูกลบอย่างถาวร รวมถึงโปรไฟล์ โครงการ และประวัติการรายงาน คุณแน่ใจหรือไม่?"
    confirm-text="ลบข้อมูล"
    :danger="true"
    @confirm="deleteAllData"
    @cancel="showDeleteConfirm = false"
  />

  <ConfirmDialog
    :show="showClearTodayConfirm"
    title="ล้างรายงานวันนี้"
    message="ต้องการลบรายงานของวันนี้ออกหรือไม่? คุณจะสามารถสร้างรายงานใหม่ได้"
    confirm-text="ล้างรายงาน"
    :danger="false"
    @confirm="clearTodayReport"
    @cancel="showClearTodayConfirm = false"
  />

  <ConfirmDialog
    :show="showClearAllReportsConfirm"
    title="ล้างรายงานทั้งหมด"
    message="รายงานทุกวันและข้อมูล heatmap จะถูกลบออก โปรไฟล์และโครงการจะยังคงอยู่ คุณแน่ใจหรือไม่?"
    confirm-text="ล้างทั้งหมด"
    :danger="true"
    @confirm="clearAllReports"
    @cancel="showClearAllReportsConfirm = false"
  />

  <ConfirmDialog
    :show="showDeleteAccountConfirm"
    title="ยืนยันการลบบัญชีผู้ใช้"
    message="บัญชีผู้ใช้และข้อมูลทั้งหมดจะถูกลบอย่างถาวร ทั้งในเครื่องและบนคลาวด์ คุณแน่ใจหรือไม่?"
    confirm-text="ลบบัญชี"
    :danger="true"
    @confirm="handleDeleteAccount"
    @cancel="showDeleteAccountConfirm = false"
  />
</template>
