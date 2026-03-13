<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Matter from 'matter-js'
import { useAppStore } from '../stores/app'
import { useToast } from '../composables/useToast'
import { useTaiga } from '../composables/useTaiga'
import BaseHeader from '../components/ui/BaseHeader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import { IconPerson, IconFolderOpen, IconInfo } from '../components/icons'
import badgeSvg from '../assets/badge.svg'
import { useSupabase } from '../composables/useSupabase'

const router = useRouter()
const store = useAppStore()
const { showToast } = useToast()
const { getCredentials } = useTaiga()
const { getProfileSuggestions } = useSupabase()

const workplaceSuggestions = ref([])
const projectLabelSuggestions = ref([])
const workplaceFocused = ref(false)
const projectLabelFocused = ref(false)

const filteredWorkplace = computed(() =>
  workplaceSuggestions.value.filter(s => s.toLowerCase().includes(workplace.value.toLowerCase()))
)
const filteredProjectLabel = computed(() =>
  projectLabelSuggestions.value.filter(s => s.toLowerCase().includes(projectLabel.value.toLowerCase()))
)

function selectWorkplace(s) {
  workplace.value = s
  workplaceFocused.value = false
}
function selectProjectLabel(s) {
  projectLabel.value = s
  projectLabelFocused.value = false
}


const currentStep = ref(1)

// Load login data from sessionStorage & Taiga credentials
const creds = getCredentials()
const loginName = sessionStorage.getItem('hurryup_login_name') || ''
const storedProjects = JSON.parse(sessionStorage.getItem('hurryup_fetched_projects') || '[]')

// Extract only first name + last name (e.g. "Jane Doe (UX) Product Dev" → "Jane Doe")
function extractName(fullName) {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  if (parts.length <= 2) return fullName.trim()
  return parts.slice(0, 2).join(' ')
}

// Profile photo from Taiga (not changeable)
const profilePhoto = creds?.photo || ''

// Form data
const name = ref(extractName(loginName))
const role = ref('')
const workplace = ref('')
const projectLabel = ref('')

// Projects
const fetchedProjects = ref(
  [...storedProjects].sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
)
const selectedProjectIds = ref(new Set())

const attempted = ref(false)
const focusedProjectId = ref(null)

// Matter.js physics pills
const pillCanvas = ref(null)
let mEngine = null
let mRunner = null
let mRender = null
let mMouse = null
let mMouseConstraint = null
const pillBodies = []
const isDraggingPill = ref(false)

function initMatter() {
  const canvas = pillCanvas.value
  if (!canvas) return

  const { Engine, Runner, Render, Bodies, Composite, Mouse, MouseConstraint, Events } = Matter

  mEngine = Engine.create({ gravity: { x: 0, y: 1 } })

  mRender = Render.create({
    canvas,
    engine: mEngine,
    options: {
      width: window.innerWidth,
      height: window.innerHeight,
      wireframes: false,
      background: 'transparent',
      pixelRatio: window.devicePixelRatio || 1,
    }
  })

  // Floor & walls (invisible)
  const floor = Bodies.rectangle(window.innerWidth / 2, window.innerHeight + 30, window.innerWidth * 2, 60, {
    isStatic: true, render: { visible: false }
  })
  const wallR = Bodies.rectangle(window.innerWidth + 30, window.innerHeight / 2, 60, window.innerHeight * 2, {
    isStatic: true, render: { visible: false }
  })
  const wallL = Bodies.rectangle(-30, window.innerHeight / 2, 60, window.innerHeight * 2, {
    isStatic: true, render: { visible: false }
  })
  Composite.add(mEngine.world, [floor, wallL, wallR])

  // Mouse interaction for dragging
  mMouse = Mouse.create(canvas)
  mMouseConstraint = MouseConstraint.create(mEngine, {
    mouse: mMouse,
    constraint: { stiffness: 0.2, render: { visible: false } }
  })
  // Let scroll pass through
  mMouse.element.removeEventListener('mousewheel', mMouse.mousewheel)
  mMouse.element.removeEventListener('DOMMouseScroll', mMouse.mousewheel)
  Composite.add(mEngine.world, mMouseConstraint)

  // Track dragging state
  Events.on(mMouseConstraint, 'startdrag', () => { isDraggingPill.value = true })
  Events.on(mMouseConstraint, 'enddrag', () => { isDraggingPill.value = false })

  // Detect hover over pills to enable pointer events on canvas
  const onMouseMove = (e) => {
    if (isDraggingPill.value) return
    const point = { x: e.clientX, y: e.clientY }
    const hit = pillBodies.some(({ body }) => Matter.Bounds.contains(body.bounds, point))
    canvas.style.pointerEvents = hit ? 'auto' : 'none'
  }
  window.addEventListener('mousemove', onMouseMove)
  canvas._onMouseMove = onMouseMove

  // Custom render: draw pill shapes with text
  Events.on(mRender, 'afterRender', () => {
    const ctx = mRender.context
    for (const { body, label } of pillBodies) {
      const { x, y } = body.position
      const angle = body.angle

      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle)

      // Measure text to size pill
      ctx.font = 'bold 13px system-ui, sans-serif'
      const textW = ctx.measureText(label).width
      const pw = Math.min(textW + 28, 220)
      const ph = 34
      const radius = ph / 2

      // Pill shape
      ctx.beginPath()
      ctx.moveTo(-pw / 2 + radius, -ph / 2)
      ctx.lineTo(pw / 2 - radius, -ph / 2)
      ctx.arc(pw / 2 - radius, 0, radius, -Math.PI / 2, Math.PI / 2)
      ctx.lineTo(-pw / 2 + radius, ph / 2)
      ctx.arc(-pw / 2 + radius, 0, radius, Math.PI / 2, -Math.PI / 2)
      ctx.closePath()

      ctx.fillStyle = '#005FB8'
      ctx.shadowColor = 'rgba(0, 95, 184, 0.3)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 2
      ctx.fill()
      ctx.shadowColor = 'transparent'

      // Text
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const displayText = label.length > 20 ? label.slice(0, 18) + '…' : label
      ctx.fillText(displayText, 0, 0)

      ctx.restore()
    }
  })

  Render.run(mRender)
  mRunner = Runner.create()
  Runner.run(mRunner, mEngine)
}

function destroyMatter() {
  const canvas = pillCanvas.value
  if (canvas?._onMouseMove) {
    window.removeEventListener('mousemove', canvas._onMouseMove)
  }
  if (mRender) Matter.Render.stop(mRender)
  if (mRunner) Matter.Runner.stop(mRunner)
  if (mEngine) Matter.Engine.clear(mEngine)
  pillBodies.length = 0
}

function spawnPill(projectName) {
  if (!mEngine) return
  const { Bodies, Composite } = Matter

  // Spawn from top-right area with slight randomness
  const x = window.innerWidth - 160 + (Math.random() - 0.5) * 120
  const y = -40

  const body = Bodies.rectangle(x, y, 140, 34, {
    chamfer: { radius: 17 },
    restitution: 0.6,
    friction: 0.1,
    frictionAir: 0.005,
    density: 0.0004,
    torque: (Math.random() - 0.5) * 0.05,
    render: { visible: false }
  })

  Composite.add(mEngine.world, body)
  pillBodies.push({ body, label: projectName })
}

function removePill(taigaId) {
  if (!mEngine) return
  const project = fetchedProjects.value.find(p => p.id === taigaId)
  if (!project) return

  const idx = pillBodies.findIndex(p => p.label === project.name)
  if (idx !== -1) {
    Matter.Composite.remove(mEngine.world, pillBodies[idx].body)
    pillBodies.splice(idx, 1)
  }
}

onMounted(async () => {
  initMatter()
  try {
    const { workplaces, projectLabels } = await getProfileSuggestions()
    workplaceSuggestions.value = workplaces
    projectLabelSuggestions.value = projectLabels
  } catch {}
})

onUnmounted(() => destroyMatter())

const focusedProject = computed(() => {
  if (!focusedProjectId.value) return null
  return fetchedProjects.value.find(p => p.id === focusedProjectId.value) || null
})

const steps = [
  { id: 1, label: 'เกี่ยวกับคุณ' },
  { id: 2, label: 'โครงการ' },
]

const canProceedStep1 = computed(() => {
  return role.value.trim() && workplace.value.trim() && projectLabel.value.trim()
})

// Computed projects from Taiga selection
const projects = computed(() => {
  const taigaBaseUrl = creds?.baseUrl || ''
  return fetchedProjects.value
    .filter(p => selectedProjectIds.value.has(p.id))
    .map((p, index) => ({
      id: index + 1,
      name: p.name,
      taigaUrl: `${taigaBaseUrl}/project/${p.slug}/`,
      template: store.DEFAULT_TEMPLATE,
    }))
})

function goToStep(step) {
  if (step > currentStep.value) {
    if (currentStep.value === 1) {
      attempted.value = true
      if (!canProceedStep1.value) {
        showToast('กรุณากรอกข้อมูลให้ครบถ้วน')
        return
      }
    }
  }
  currentStep.value = step
}

function toggleProject(taigaId) {
  const s = new Set(selectedProjectIds.value)
  if (s.has(taigaId)) {
    s.delete(taigaId)
    removePill(taigaId)
  } else {
    s.add(taigaId)
    const project = fetchedProjects.value.find(p => p.id === taigaId)
    if (project) spawnPill(project.name)
  }
  selectedProjectIds.value = s
}

function selectAllProjects() {
  const prev = selectedProjectIds.value
  selectedProjectIds.value = new Set(fetchedProjects.value.map(p => p.id))
  // Spawn pills for newly added projects with staggered delay
  fetchedProjects.value.forEach((p, i) => {
    if (!prev.has(p.id)) {
      setTimeout(() => spawnPill(p.name), i * 80)
    }
  })
}

function deselectAllProjects() {
  // Remove all pills
  for (const { body } of pillBodies) {
    if (mEngine) Matter.Composite.remove(mEngine.world, body)
  }
  pillBodies.length = 0
  selectedProjectIds.value = new Set()
}

function goBack() {
  if (currentStep.value === 1) {
    router.push('/')
  } else {
    currentStep.value = currentStep.value - 1
  }
}

function completeOnboarding() {
  store.completeOnboarding(
    {
      name: name.value.trim(),
      role: role.value.trim(),
      workplace: workplace.value.trim(),
      projectLabel: projectLabel.value.trim(),
      profileImage: profilePhoto
    },
    projects.value
  )
  sessionStorage.removeItem('hurryup_fetched_projects')
  sessionStorage.removeItem('hurryup_login_name')
  router.push('/app')
  showToast('ยินดีต้อนรับสู่ HurryUp! 🎉')
}

function handleNext() {
  if (currentStep.value < 2) {
    goToStep(currentStep.value + 1)
  } else {
    completeOnboarding()
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white">
    <!-- Matter.js physics pills canvas -->
    <canvas ref="pillCanvas" class="fixed inset-0 z-50 pointer-events-none" style="background: transparent;" />

    <!-- Header -->
    <BaseHeader :show-border="false">
      <template #actions>
        <BaseButton size="sm" variant="primary" @click="completeOnboarding">
          เริ่มต้นใช้งาน
        </BaseButton>
      </template>
    </BaseHeader>

    <!-- Content -->
    <div class="flex-1 flex justify-center px-8 lg:px-16 pb-32">
      <div
        class="w-full max-w-[1200px] flex-1 animate-[slideIn_0.5s_ease-out_0.1s_forwards] opacity-0 translate-y-[30px]">

        <div class="flex h-full">

          <!-- Left: Vertical Stepper -->
          <div class="w-20 flex-shrink-0 flex justify-center flex-col items-center gap-y-4">
            <!-- Starter line -->
            <div class="w-0.5 h-16 bg-gray-200" />

            <template v-for="(step, index) in steps" :key="step.id">
              <!-- Step circle (profile-sized) -->
              <button class="relative flex-shrink-0 cursor-pointer" @click="goToStep(step.id)">
                <div
                  class="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden"
                  :class="currentStep >= step.id
                    ? 'bg-[var(--primary-brand)]'
                    : 'bg-gray-200'">
                  <!-- Show profile photo on step 1, icon on step 2 -->
                  <template v-if="step.id === 1">
                    <img v-if="profilePhoto" :src="profilePhoto" alt="Profile" class="w-full h-full object-cover">
                    <IconPerson v-else :size="24" :color="currentStep >= 1 ? 'white' : 'var(--secondary-text)'" />
                  </template>
                  <template v-else>
                    <svg v-if="currentStep > step.id" width="20" height="20" viewBox="0 0 24 24" fill="none"
                      stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <IconFolderOpen v-else :size="22"
                      :color="currentStep >= step.id ? 'white' : 'var(--secondary-text)'" />
                  </template>
                </div>
              </button>
              <!-- Connector line between steps -->
              <div v-if="index < steps.length - 1" class="w-0.5 h-40 transition-colors duration-300"
                :class="currentStep > step.id ? 'bg-[var(--primary-brand)]' : 'bg-gray-200'" />
            </template>

            <!-- End line -->
            <div class="w-0.5 h-16 bg-gray-200" />
          </div>

          <!-- Center: Form Content -->
          <div class="flex-1 min-w-0 flex flex-col pl-8 pr-8 lg:pr-12">
            <div class="flex-1 relative">
              <Transition name="step-fade" mode="out-in">
                <!-- Step 1: About You -->
                <div v-if="currentStep === 1" key="step1" class="space-y-7">

                  <!-- User name display -->
                  <div>
                    <h2 class="text-2xl font-bold text-[var(--primary-brand)]">เกี่ยวกับคุณ</h2>
                    <p class="text-sm text-[var(--secondary-text)]">กรุณากรอกข้อมูลให้ครบถ้วน</p>
                  </div>

                  <!-- 2-column: Name + Position -->
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="text-sm font-medium text-[var(--secondary-text)] mb-1.5 block">ชื่อ-นามสกุล</label>
                      <BaseInput v-model="name" placeholder="ชื่อ-นามสกุล" :readonly="true" class="!bg-[var(--surface)]" />
                    </div>
                    <div>
                      <label class="text-sm font-medium text-[var(--secondary-text)] mb-1.5 block">ตำแหน่ง</label>
                      <BaseInput v-model="role" placeholder="เช่น เจ้าหน้าที่พัฒนา" :error="attempted && !role.trim()" />
                    </div>
                  </div>

                  <!-- Full-width: สถานที่ปฏิบัติงาน -->
                  <div>
                    <div class="flex items-center gap-1.5 mb-1.5">
                      <label class="text-sm font-medium text-[var(--secondary-text)]">สถานที่ปฏิบัติงาน</label>
                      <div class="tooltip tooltip-right" data-tip="สถานที่ปฏิบัติงานจะใช้ในเทมเพลตรายงาน">
                        <IconInfo :size="16" color="var(--secondary-text)" />
                      </div>
                    </div>
                    <div class="suggest-wrap">
                      <input v-model="workplace" placeholder="เช่น บริษัท" :class="['suggest-input suggest-input--arrow', attempted && !workplace.trim() ? 'error' : '']"
                        @focus="workplaceFocused = true" @blur="setTimeout(() => workplaceFocused = false, 150)" />
                      <svg class="suggest-arrow" :class="{ open: workplaceFocused }" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      <div v-if="workplaceFocused && filteredWorkplace.length" class="suggest-dropdown">
                        <button v-for="s in filteredWorkplace" :key="s" class="suggest-option" @mousedown.prevent="selectWorkplace(s)">{{ s }}</button>
                      </div>
                    </div>
                  </div>

                  <!-- Full-width: ชื่อโครงการในเทมเพลต -->
                  <div>
                    <div class="flex items-center gap-1.5 mb-1.5">
                      <label class="text-sm font-medium text-[var(--secondary-text)]">ชื่อโครงการในเทมเพลต</label>
                      <div class="tooltip tooltip-right" data-tip="ชื่อโครงการที่จะแสดงในเทมเพลตรายงาน">
                        <IconInfo :size="16" color="var(--secondary-text)" />
                      </div>
                    </div>
                    <div class="suggest-wrap">
                      <input v-model="projectLabel" placeholder="เช่น รายงานการทำงานประจำวัน เข้า Office (ฝ่ายพัฒนาระบบ)" :class="['suggest-input suggest-input--arrow', attempted && !projectLabel.trim() ? 'error' : '']"
                        @focus="projectLabelFocused = true" @blur="setTimeout(() => projectLabelFocused = false, 150)" />
                      <svg class="suggest-arrow" :class="{ open: projectLabelFocused }" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      <div v-if="projectLabelFocused && filteredProjectLabel.length" class="suggest-dropdown">
                        <button v-for="s in filteredProjectLabel" :key="s" class="suggest-option" @mousedown.prevent="selectProjectLabel(s)">{{ s }}</button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Step 2: Projects -->
                <div v-else key="step2" class="space-y-5 max-w-lg">
                  <div>
                    <h2 class="text-2xl font-bold text-[var(--primary-brand)]">เลือกโครงการ</h2>
                    <p class="text-sm text-[var(--secondary-text)]">เลือกโครงการที่คุณต้องการติดตาม</p>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-sm text-[var(--secondary-text)]">
                      เลือกแล้ว {{ selectedProjectIds.size }} / {{ fetchedProjects.length }} โครงการ
                    </span>
                    <div class="flex gap-2">
                      <button class="text-sm text-[var(--primary-brand)] hover:underline"
                        @click="selectAllProjects">เลือกทั้งหมด</button>
                      <button class="text-sm text-[var(--secondary-text)] hover:underline"
                        @click="deselectAllProjects">ล้างทั้งหมด</button>
                    </div>
                  </div>

                  <!-- Project List with fade top & bottom -->
                  <div class="relative">
                    <!-- Fade top overlay -->
                    <div class="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white to-transparent pointer-events-none z-10" />
                    <div v-if="fetchedProjects.length > 0" class="space-y-3 max-h-[50vh] overflow-y-auto px-2 pt-6 pb-6 project-list-scroll">
                      <label v-for="p in fetchedProjects" :key="p.id"
                        class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                        :class="[
                          selectedProjectIds.has(p.id)
                            ? 'border-[var(--primary-brand)] bg-blue-50'
                            : 'border-[var(--border-color)] bg-white hover:bg-gray-50',
                          focusedProjectId === p.id ? 'ring-2 ring-[var(--primary-brand)] ring-offset-1' : ''
                        ]"
                        @click.prevent="focusedProjectId = p.id">
                        <div
                          class="w-9 h-9 rounded-lg bg-[var(--surface)] flex-shrink-0 overflow-hidden flex items-center justify-center">
                          <img v-if="p.logo_big_url || p.logo_small_url" :src="p.logo_big_url || p.logo_small_url"
                            :alt="p.name" class="w-full h-full object-cover">
                          <IconFolderOpen v-else :size="16" color="var(--secondary-text)" />
                        </div>
                        <div class="min-w-0 flex-1">
                          <div class="font-bold text-sm text-[var(--primary-text)] truncate">{{ p.name }}</div>
                          <div class="text-xs text-[var(--secondary-text)] truncate">{{ p.description || p.slug }}</div>
                        </div>
                        <input type="checkbox" class="checkbox checkbox-primary checkbox-sm flex-shrink-0"
                          :checked="selectedProjectIds.has(p.id)" @click.stop @change="toggleProject(p.id)">
                      </label>
                    </div>
                    <!-- Fade bottom overlay -->
                    <div class="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />

                    <div v-if="fetchedProjects.length === 0" class="p-6 bg-[var(--surface)] rounded-xl text-center text-[var(--secondary-text)]">
                      ไม่พบโครงการที่คุณเป็นสมาชิก
                    </div>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- Footer Actions -->
            <div class="flex justify-end items-center gap-3 mt-8 pt-6">
              <BaseButton variant="outline" @click="goBack" size="lg">
                ย้อนกลับ
              </BaseButton>
              <BaseButton variant="primary" @click="handleNext" size="lg">
                {{ currentStep < 2 ? 'ถัดไป' : 'เริ่มใช้งาน' }} </BaseButton>
            </div>
          </div>

          <!-- Right Column -->
          <div class="hidden lg:flex w-[440px] flex-shrink-0 items-start justify-center pt-0">
            <!-- Step 2: Project Detail Panel -->
            <Transition name="detail-fade" mode="out-in">
              <div v-if="currentStep === 2 && focusedProject" :key="focusedProjectId" class="w-full space-y-3">
                <!-- Top box: Project info -->
                <div class="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-12 h-12 rounded-xl bg-[var(--surface)] flex-shrink-0 overflow-hidden flex items-center justify-center">
                      <img v-if="focusedProject.logo_big_url || focusedProject.logo_small_url"
                        :src="focusedProject.logo_big_url || focusedProject.logo_small_url"
                        :alt="focusedProject.name" class="w-full h-full object-cover">
                      <IconFolderOpen v-else :size="20" color="var(--secondary-text)" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <h3 class="font-bold text-[var(--primary-text)] text-sm leading-tight">{{ focusedProject.name }}</h3>
                      <p class="text-xs text-[var(--secondary-text)] truncate mt-0.5">สร้างเมื่อ {{ focusedProject.created_date ? new Date(focusedProject.created_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '–' }}</p>
                    </div>
                  </div>
                  <p class="text-sm text-[var(--secondary-text)] leading-relaxed">
                    {{ focusedProject.description || 'ไม่มีรายละเอียด' }}
                  </p>
                </div>

                <!-- Bottom 2 boxes side by side -->
                <div class="grid grid-cols-2 gap-3">
                  <!-- Members box -->
                  <div class="rounded-2xl border border-[var(--border-color)] bg-white p-4">
                    <div class="text-xs text-[var(--secondary-text)] mb-1">สมาชิก</div>
                    <div class="text-xl font-bold text-[var(--primary-brand)]">
                      {{ focusedProject.total_memberships ?? focusedProject.members?.length ?? '–' }}
                    </div>
                    <div class="text-xs text-[var(--secondary-text)] mt-0.5">คน</div>
                  </div>
                  <!-- Owner box -->
                  <div class="rounded-2xl border border-[var(--border-color)] bg-white p-4">
                    <div class="text-xs text-[var(--secondary-text)] mb-1">เจ้าของ</div>
                    <div class="text-sm font-bold text-[var(--primary-text)] mt-1 truncate">
                      {{ focusedProject.owner?.full_name_display || focusedProject.owner?.username || '–' }}
                    </div>
                    <div class="text-xs text-[var(--secondary-text)] mt-0.5">Owner</div>
                  </div>
                </div>

                <!-- Follow button -->
                <BaseButton
                  :variant="selectedProjectIds.has(focusedProject.id) ? 'outline' : 'primary'"
                  size="md"
                  class="w-full mt-4"
                  @click="toggleProject(focusedProject.id)">
                  {{ selectedProjectIds.has(focusedProject.id) ? 'ยกเลิกติดตาม' : 'ติดตามโครงการนี้' }}
                </BaseButton>
              </div>

              <!-- Step 1: badge illustration -->
              <div v-else-if="currentStep === 1" key="step1-right" class="w-full flex items-center justify-center">
                <div class="badge-wrap">
                  <img :src="badgeSvg" alt="badge" class="badge-svg" />
                  <!-- Profile photo -->
                  <div class="badge-photo">
                    <img v-if="profilePhoto" :src="profilePhoto" class="w-full h-full object-cover rounded-full" />
                    <div v-else class="w-full h-full rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xl font-bold">
                      {{ name ? name.charAt(0).toUpperCase() : '?' }}
                    </div>
                  </div>
                  <!-- Name -->
                  <div class="badge-name">{{ name || '{fullname}' }}</div>
                  <!-- Role -->
                  <div class="badge-role">{{ role || '{position}' }}</div>
                </div>
              </div>

              <!-- no selection -->
              <div v-else key="empty" />
            </Transition>
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

.step-fade-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.step-fade-leave-active {
  transition: opacity 0.15s ease;
}

.step-fade-enter-from {
  opacity: 0;
  transform: translateY(16px);
}

.step-fade-leave-to {
  opacity: 0;
}

.detail-fade-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.detail-fade-leave-active {
  transition: opacity 0.12s ease;
}

.detail-fade-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.detail-fade-leave-to {
  opacity: 0;
}

.suggest-input {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  background: white;
  font-size: 0.875rem;
  color: var(--primary-text);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.suggest-input::placeholder {
  color: var(--secondary-text);
}

.suggest-input:focus {
  border-color: var(--primary-brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-brand) 20%, transparent);
}

.suggest-input.error {
  border-color: #ef4444;
}

.suggest-wrap {
  position: relative;
}

.suggest-input--arrow {
  padding-right: 40px;
}

.suggest-arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--secondary-text);
  pointer-events: none;
  transition: transform 0.15s ease;
}

.suggest-arrow.open {
  transform: translateY(-50%) rotate(180deg);
}

.suggest-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  z-index: 100;
  overflow: hidden;
}

.suggest-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  font-size: 0.875rem;
  color: var(--primary-text);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.1s;
}

.suggest-option:hover {
  background: #f0f7ff;
  color: var(--primary-brand);
}

/* Badge overlay */
.badge-wrap {
  position: relative;
  display: inline-block;
  width: 192px; /* w-48 */
}

.badge-svg {
  width: 100%;
  height: auto;
  display: block;
}

/* Circle center: cx=121/251=48.2%, cy=322/578=55.7%, r=50 → diameter=100px at full size → scaled=76px */
.badge-photo {
  position: absolute;
  left: 50%;
  top: 55.7%;
  transform: translate(-50%, -50%);
  width: 76px;
  height: 76px;
  border-radius: 50%;
  overflow: hidden;
}

/* Name: roughly y=395/578=68.3% */
.badge-name {
  position: absolute;
  left: 50%;
  top: 68.5%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #1a1a1a;
  white-space: nowrap;
  letter-spacing: -0.2px;
}

/* Role: roughly y=445/578=77% */
.badge-role {
  position: absolute;
  left: 50%;
  top: 75.5%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #6b7280;
  white-space: nowrap;
}
</style>
