<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import * as d3 from 'd3'
import { useRouter } from 'vue-router'
import { useSupabase } from '../composables/useSupabase'
import { useToast } from '../composables/useToast'
import { useDateTime } from '../composables/useDateTime'
import BaseButton from '../components/ui/BaseButton.vue'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import { Bar, Doughnut, Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler
)

const router = useRouter()
const { showToast } = useToast()
const { thaiMonthsShort, formatThaiDate } = useDateTime()
const { isAdmin, getAllUsers, getUserProjects, getUserStamps, getAllStamps, getAllProjects, getAllReportLogs, adminDeleteUser } = useSupabase()

const loading = ref(true)
const users = ref([])
const allStamps = ref([])
const allProjects = ref([])
const allReportLogs = ref([])
const expandedUser = ref(null)
const userDetails = ref({})
const showDeleteConfirm = ref(false)
const deleteTarget = ref(null)
const activeTab = ref('analytics')

onMounted(async () => {
  try {
    const admin = await isAdmin()
    if (!admin) {
      showToast('ไม่มีสิทธิ์เข้าถึงหน้านี้')
      router.replace('/app')
      return
    }
    await loadData()
  } catch (e) {
    console.error('Admin check failed:', e)
    showToast('ตรวจสอบสิทธิ์ไม่สำเร็จ: ' + e.message)
    router.replace('/app')
  }
})

async function loadData() {
  loading.value = true
  try {
    const [usersData, stampsData, projectsData, reportLogsData] = await Promise.all([
      getAllUsers(),
      getAllStamps(),
      getAllProjects(),
      getAllReportLogs(),
    ])
    users.value = usersData
    allStamps.value = stampsData
    allProjects.value = projectsData
    allReportLogs.value = reportLogsData
  } catch (e) {
    showToast('โหลดข้อมูลไม่สำเร็จ: ' + e.message)
  }
  loading.value = false
  nextTick(() => renderBubbleChart())
}

// --- User name lookup ---
const userNameMap = computed(() => {
  const map = {}
  for (const u of users.value) {
    map[u.id] = u.name || 'ไม่มีชื่อ'
  }
  return map
})

// --- Chart: Employee contribution (bar) - based on report logs ---
const contributionChartData = computed(() => {
  const counts = {}
  for (const r of allReportLogs.value) {
    counts[r.user_id] = (counts[r.user_id] || 0) + 1
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15)
  return {
    labels: sorted.map(([uid]) => userNameMap.value[uid] || uid.slice(0, 8)),
    datasets: [{
      label: 'จำนวนวันที่บันทึก',
      data: sorted.map(([, count]) => count),
      backgroundColor: 'rgba(59, 130, 246, 0.7)',
      borderRadius: 6,
    }]
  }
})

const contributionChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0 } },
    x: { ticks: { maxRotation: 45 } }
  }
}

// --- Chart: Stamp type distribution (doughnut) ---
const typeColors = {
  report: '#3b82f6',
  vacation: '#56bb89',
  sick: '#e8845a',
  'on-leave': '#94a3b8',
}

const typeLabelsChart = {
  report: 'บันทึกรายงาน',
  vacation: 'ลาพักร้อน',
  sick: 'ลาป่วย',
  'on-leave': 'ลาอื่น ๆ',
}

const stampTypeChartData = computed(() => {
  const counts = { report: allReportLogs.value.length }
  for (const s of allStamps.value) {
    counts[s.type] = (counts[s.type] || 0) + 1
  }
  const keys = Object.keys(counts).filter(k => counts[k] > 0)
  return {
    labels: keys.map(k => typeLabelsChart[k] || k),
    datasets: [{
      data: keys.map(k => counts[k]),
      backgroundColor: keys.map(k => typeColors[k] || '#94a3b8'),
    }]
  }
})

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' }
  }
}

// --- Chart: Daily activity trend (line, last 30 days) - based on report logs ---
const activityTrendData = computed(() => {
  const today = new Date()
  const days = []
  const counts = {}

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    days.push(key)
    counts[key] = 0
  }

  for (const r of allReportLogs.value) {
    if (counts[r.date_key] !== undefined) {
      counts[r.date_key]++
    }
  }

  return {
    labels: days.map(d => {
      const parts = d.split('-')
      return `${parts[2]}/${parseInt(parts[1]) + 1}`
    }),
    datasets: [{
      label: 'กิจกรรมรายวัน',
      data: days.map(d => counts[d]),
      borderColor: 'rgba(59, 130, 246, 1)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
    }]
  }
})

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0 } }
  }
}

const thaiDayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

// --- Heatmap: Full annual ---
const selectedYear = ref(new Date().getFullYear())
const availableYears = computed(() => {
  const current = new Date().getFullYear()
  return [current, current - 1, current - 2, current - 3]
})

const reportLogCountMap = computed(() => {
  const map = {}
  for (const r of allReportLogs.value) {
    map[r.date_key] = (map[r.date_key] || 0) + (r.project_count || 1)
  }
  return map
})

const calendarData = computed(() => {
  const year = selectedYear.value
  const startDate = new Date(year, 0, 1)
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const firstDayOfWeek = startDate.getDay()
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
  const totalDays = isLeapYear ? 366 : 365
  const totalWeeks = Math.ceil((totalDays + firstDayOfWeek) / 7)

  const weeks = []
  for (let week = 0; week < totalWeeks; week++) {
    const weekData = []
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const dayIndex = week * 7 + dayOfWeek - firstDayOfWeek
      if (dayIndex >= 0 && dayIndex < totalDays) {
        const currentDate = new Date(year, 0, 1 + dayIndex)
        const dateKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`
        const count = reportLogCountMap.value[dateKey] || 0
        const isPastOrToday = currentDate <= today

        let level = 0
        if (count >= 1 && count <= 2) level = 1
        else if (count >= 3 && count <= 5) level = 2
        else if (count >= 6) level = 3

        const thaiDate = formatThaiDate(currentDate)
        weekData.push({
          date: currentDate,
          dateKey,
          count,
          level: isPastOrToday ? level : -1,
          tooltip: count > 0 ? `${thaiDate}: ${count} โครงการ` : `${thaiDate}: ไม่มีข้อมูล`,
          isFuture: !isPastOrToday,
          empty: false,
        })
      } else {
        weekData.push({ empty: true })
      }
    }
    weeks.push(weekData)
  }
  return weeks
})

const monthLabels = computed(() => {
  const year = selectedYear.value
  const startDate = new Date(year, 0, 1)
  const firstDayOfWeek = startDate.getDay()
  const labels = []

  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(year, month, 1)
    const dayOfYear = Math.floor((monthStart - startDate) / (1000 * 60 * 60 * 24))
    const weekOfMonth = Math.floor((dayOfYear + firstDayOfWeek) / 7)
    labels.push({
      name: thaiMonthsShort[month],
      position: weekOfMonth * 15,
    })
  }
  return labels
})

// --- Heatmap day detail ---
function makeTodayDay() {
  const today = new Date()
  const dateKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  return { date: today, dateKey, empty: false, isFuture: false }
}
const selectedDay = ref(makeTodayDay())

// Lookup: stamps by date_key → { user_id: type }
const stampsByDate = computed(() => {
  const map = {}
  for (const s of allStamps.value) {
    if (!map[s.date_key]) map[s.date_key] = {}
    map[s.date_key][s.user_id] = s.type
  }
  return map
})

// Lookup: projects by user_id → [project names]
const projectsByUser = computed(() => {
  const map = {}
  for (const p of allProjects.value) {
    if (!map[p.user_id]) map[p.user_id] = []
    map[p.user_id].push(p.name)
  }
  return map
})

// Report logs for selected day
const selectedDayDetails = computed(() => {
  if (!selectedDay.value) return null
  const dateKey = selectedDay.value.dateKey
  const dayReports = allReportLogs.value.filter(r => r.date_key === dateKey)
  const dayStamps = stampsByDate.value[dateKey] || {}

  // Collect all user_ids that have either a report or a stamp on this day
  const userIds = new Set([
    ...dayReports.map(r => r.user_id),
    ...Object.keys(dayStamps),
  ])

  const entries = [...userIds].map(uid => ({
    userId: uid,
    name: userNameMap.value[uid] || uid.slice(0, 8),
    projectCount: dayReports.find(r => r.user_id === uid)?.project_count || 0,
    stampType: dayStamps[uid] || null,
    projects: projectsByUser.value[uid] || [],
  }))

  // Sort: users with reports first, then by name
  entries.sort((a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name))

  return {
    dateKey,
    thaiDate: formatThaiDate(selectedDay.value.date),
    totalReports: dayReports.length,
    entries,
  }
})

function handleDayClick(day) {
  if (day.empty || day.isFuture) return
  if (selectedDay.value?.dateKey === day.dateKey) {
    selectedDay.value = makeTodayDay()
  } else {
    selectedDay.value = day
  }
}

const stampTypeLabels = {
  vacation: 'ลาพักร้อน',
  sick: 'ลาป่วย',
  'on-leave': 'ลาอื่นๆ',
}

const stampTypeColors = {
  vacation: 'bg-green-100 text-green-700',
  sick: 'bg-orange-100 text-orange-700',
  'on-leave': 'bg-red-100 text-red-700',
}

// --- Stats ---
const totalReportLogs = computed(() => allReportLogs.value.length)
const totalProjects = computed(() => allProjects.value.length)
const activeUsersLast7Days = computed(() => {
  const recentKeys = new Set()
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    recentKeys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }
  const activeIds = new Set()
  for (const r of allReportLogs.value) {
    if (recentKeys.has(r.date_key)) activeIds.add(r.user_id)
  }
  return activeIds.size
})

// --- Most contributed projects (D3 bubble chart) ---
const bubbleColors = ['#f472b6', '#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9']
const bubbleSvgRef = ref(null)
const hoveredBubble = ref(null)
const tooltipPos = ref({ x: 0, y: 0 })

const projectBubbleData = computed(() => {
  // Get today's date_key
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`

  // Find user_ids who contributed today
  const todayUserIds = new Set(
    allReportLogs.value
      .filter(r => r.date_key === todayKey)
      .map(r => r.user_id)
  )

  if (todayUserIds.size === 0) return []

  // Count projects from today's contributors
  const counts = {}
  for (const p of allProjects.value) {
    if (todayUserIds.has(p.user_id)) {
      counts[p.name] = (counts[p.name] || 0) + 1
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))
})

function renderBubbleChart() {
  const container = bubbleSvgRef.value
  if (!container) return

  const data = projectBubbleData.value
  if (data.length === 0) return

  // Clear previous
  d3.select(container).selectAll('*').remove()

  const width = container.clientWidth || 300
  const height = 240

  const svg = d3.select(container)
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)

  // Create hierarchy & pack layout
  const root = d3.hierarchy({ children: data })
    .sum(d => d.count)

  d3.pack()
    .size([width, height])
    .padding(4)(root)

  const nodes = root.leaves()

  // Create groups for each bubble
  const node = svg.selectAll('g')
    .data(nodes)
    .join('g')
    .attr('transform', d => `translate(${d.x},${d.y})`)
    .style('cursor', 'pointer')

  // Circles
  node.append('circle')
    .attr('r', 0)
    .attr('fill', (d, i) => bubbleColors[i % bubbleColors.length])
    .attr('opacity', 0.85)
    .attr('stroke', (d, i) => bubbleColors[i % bubbleColors.length])
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.3)
    .transition()
    .duration(600)
    .ease(d3.easeCubicOut)
    .attr('r', d => d.r)

  // Hover effects
  node.on('mouseenter', function (_event, d) {
    d3.select(this).select('circle')
      .transition().duration(200)
      .attr('opacity', 1)
      .attr('r', d.r * 1.08)
    hoveredBubble.value = d.data
    tooltipPos.value = { x: d.x, y: d.y - d.r - 10 }
  })
  .on('mouseleave', function (_event, d) {
    d3.select(this).select('circle')
      .transition().duration(200)
      .attr('opacity', 0.85)
      .attr('r', d.r)
    hoveredBubble.value = null
  })

  // Labels — only show if bubble is big enough
  node.filter(d => d.r > 22)
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.3em')
    .attr('fill', '#fff')
    .attr('font-size', d => Math.max(8, Math.min(d.r / 3.5, 13)) + 'px')
    .attr('font-weight', 600)
    .attr('pointer-events', 'none')
    .text(d => d.data.name.length > d.r / 5 ? d.data.name.slice(0, Math.floor(d.r / 5)) + '…' : d.data.name)

  node.filter(d => d.r > 22)
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '1em')
    .attr('fill', '#fff')
    .attr('font-size', d => Math.max(10, Math.min(d.r / 3, 16)) + 'px')
    .attr('font-weight', 700)
    .attr('pointer-events', 'none')
    .text(d => d.data.count)
}

watch(projectBubbleData, () => {
  nextTick(() => renderBubbleChart())
})


// --- Top contributors (for summary card) ---
const topContributors = computed(() => {
  const counts = {}
  for (const r of allReportLogs.value) {
    counts[r.user_id] = (counts[r.user_id] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([uid, count]) => ({ name: userNameMap.value[uid] || uid.slice(0, 8), count }))
})

// --- Project per user chart ---
const projectPerUserData = computed(() => {
  const counts = {}
  for (const p of allProjects.value) {
    counts[p.user_id] = (counts[p.user_id] || 0) + 1
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15)
  return {
    labels: sorted.map(([uid]) => userNameMap.value[uid] || uid.slice(0, 8)),
    datasets: [{
      label: 'จำนวนโครงการ',
      data: sorted.map(([, count]) => count),
      backgroundColor: 'rgba(139, 92, 246, 0.7)',
      borderRadius: 6,
    }]
  }
})

// --- User list functions ---
async function toggleUserDetails(userId) {
  if (expandedUser.value === userId) {
    expandedUser.value = null
    return
  }
  expandedUser.value = userId
  if (!userDetails.value[userId]) {
    try {
      const [projects, stamps] = await Promise.all([
        getUserProjects(userId),
        getUserStamps(userId),
      ])
      userDetails.value[userId] = { projects, stamps }
    } catch (e) {
      showToast('โหลดรายละเอียดไม่สำเร็จ')
    }
  }
}

function confirmDelete(user) {
  deleteTarget.value = user
  showDeleteConfirm.value = true
}

async function handleDeleteUser() {
  if (!deleteTarget.value) return
  try {
    await adminDeleteUser(deleteTarget.value.id)
    users.value = users.value.filter(u => u.id !== deleteTarget.value.id)
    delete userDetails.value[deleteTarget.value.id]
    showToast('ลบผู้ใช้เรียบร้อยแล้ว')
  } catch (e) {
    showToast('ลบไม่สำเร็จ: ' + e.message)
  }
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-[var(--primary-brand)]">Admin Dashboard</h1>
        <p class="text-sm text-[var(--secondary-text)]">จัดการผู้ใช้และข้อมูลระบบ</p>
      </div>
      <BaseButton variant="outline" size="sm" @click="router.push('/app')">
        กลับไปแอป
      </BaseButton>
    </div>

    <div class="max-w-6xl mx-auto px-6 py-6">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-12 text-[var(--secondary-text)]">
        <span class="loading loading-spinner loading-md"></span>
        <p class="mt-2">กำลังโหลด...</p>
      </div>

      <template v-else>
        <!-- Tabs -->
        <div class="flex gap-1 mb-6 bg-white rounded-xl border border-gray-200 p-1">
          <button
            :class="['flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors', activeTab === 'analytics' ? 'bg-[var(--primary-brand)] text-white' : 'text-[var(--secondary-text)] hover:bg-gray-50']"
            @click="activeTab = 'analytics'"
          >
            Analytics
          </button>
          <button
            :class="['flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors', activeTab === 'users' ? 'bg-[var(--primary-brand)] text-white' : 'text-[var(--secondary-text)] hover:bg-gray-50']"
            @click="activeTab = 'users'"
          >
            จัดการผู้ใช้
          </button>
        </div>

        <!-- Analytics Tab -->
        <div v-if="activeTab === 'analytics'" class="space-y-6">

          <!-- Row 1: Summary Banner + Top Contributors -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Summary Banner -->
            <div class="lg:col-span-2 summary-banner rounded-2xl p-6 text-white">
              <div class="text-sm font-medium opacity-80 mb-4">สรุปภาพรวม</div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <div class="text-3xl font-bold">{{ users.length }}</div>
                  <div class="text-sm opacity-70 mt-1">ผู้ใช้ทั้งหมด</div>
                </div>
                <div>
                  <div class="text-3xl font-bold">{{ totalReportLogs }}</div>
                  <div class="text-sm opacity-70 mt-1">รายงานทั้งหมด</div>
                </div>
                <div class="border-l border-white/20 pl-6">
                  <div class="text-3xl font-bold">{{ activeUsersLast7Days }}</div>
                  <div class="text-sm opacity-70 mt-1">ใช้งาน 7 วัน</div>
                </div>
                <div>
                  <div class="text-3xl font-bold">{{ totalProjects }}</div>
                  <div class="text-sm opacity-70 mt-1">โครงการทั้งหมด</div>
                </div>
              </div>
            </div>

            <!-- Top Contributors -->
            <div class="bg-white rounded-2xl border border-gray-200 p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-[var(--primary-text)]">Top Contributors</h3>
              </div>
              <div class="space-y-2.5">
                <div v-for="(c, i) in topContributors" :key="i" class="flex items-center justify-between">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs font-bold text-[var(--secondary-text)] w-4">{{ i + 1 }}</span>
                    <span class="text-sm text-[var(--primary-text)] truncate">{{ c.name }}</span>
                  </div>
                  <span class="text-xs font-semibold text-[var(--primary-brand)] bg-blue-50 px-2 py-0.5 rounded">{{ c.count }}</span>
                </div>
                <p v-if="topContributors.length === 0" class="text-sm text-[var(--secondary-text)]">ยังไม่มีข้อมูล</p>
              </div>
            </div>
          </div>

          <!-- Row 2: 3-column — Stamp Doughnut | Activity Trend | Project Bubbles -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Stamp Type Distribution -->
            <div class="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 class="text-sm font-semibold text-[var(--primary-text)] mb-3">สัดส่วนกิจกรรม</h2>
              <div class="h-[220px] flex items-center justify-center">
                <Doughnut v-if="allStamps.length > 0 || allReportLogs.length > 0" :data="stampTypeChartData" :options="doughnutOptions" />
                <p v-else class="text-sm text-[var(--secondary-text)]">ยังไม่มีข้อมูล</p>
              </div>
            </div>

            <!-- Activity Trend -->
            <div class="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 class="text-sm font-semibold text-[var(--primary-text)] mb-3">แนวโน้มกิจกรรม (30 วัน)</h2>
              <div class="h-[220px]">
                <Line :data="activityTrendData" :options="lineChartOptions" />
              </div>
            </div>

            <!-- Project Bubbles (D3) -->
            <div class="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 class="text-sm font-semibold text-[var(--primary-text)] mb-3">โครงการที่มีส่วนร่วมวันนี้</h2>
              <div class="bubble-chart-wrapper">
                <svg ref="bubbleSvgRef" class="bubble-svg"></svg>
                <div
                  v-if="hoveredBubble"
                  class="bubble-tooltip"
                  :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
                >
                  <div class="font-semibold text-sm">{{ hoveredBubble.name }}</div>
                  <div class="text-xs text-gray-500">{{ hoveredBubble.count }} คน</div>
                </div>
                <p v-if="projectBubbleData.length === 0" class="text-sm text-[var(--secondary-text)] text-center w-full py-8">ยังไม่มีข้อมูล</p>
              </div>
            </div>
          </div>

          <!-- Row 3: Heatmap -->
          <div class="bg-white rounded-2xl border border-gray-200 p-5">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-sm font-semibold text-[var(--primary-text)]">กิจกรรมรวมทั้งระบบ</h3>
                <p class="text-xs text-[var(--secondary-text)]">จำนวนรายงานรวมจากผู้ใช้ทุกคนในแต่ละวัน</p>
              </div>
              <div class="flex gap-1">
                <button
                  v-for="year in availableYears"
                  :key="year"
                  :class="['px-3 py-1 rounded-md text-xs font-medium transition-colors', selectedYear === year ? 'bg-[var(--primary-brand)] text-white' : 'bg-gray-100 text-[var(--secondary-text)] hover:bg-gray-200']"
                  @click="selectedYear = year"
                >
                  {{ year }}
                </button>
              </div>
            </div>

            <div class="heatmap-section admin-heatmap" style="margin: 0;">
              <section class="heatmap-card" style="border: none; padding: 0;">
                <div class="heatmap-container">
                  <div class="heatmap-months">
                    <span
                      v-for="(label, index) in monthLabels"
                      :key="index"
                      :style="{ left: label.position + 'px' }"
                    >
                      {{ label.name }}
                    </span>
                  </div>
                  <div class="heatmap-wrapper heatmap-grid-layout">
                    <div class="heatmap-days">
                      <span v-for="d in thaiDayNames" :key="d">{{ d }}</span>
                    </div>
                    <div class="heatmap-grid">
                      <div v-for="(week, weekIndex) in calendarData" :key="weekIndex" class="heatmap-week">
                        <div
                          v-for="(day, dayIndex) in week"
                          :key="dayIndex"
                          class="heatmap-day"
                          :class="{
                            empty: day.empty,
                            future: !day.empty && day.isFuture,
                            [`level-${day.level}`]: !day.empty && !day.isFuture,
                            'ring-2 ring-[var(--primary-brand)] ring-offset-1': selectedDay?.dateKey === day.dateKey,
                          }"
                          :style="{ cursor: day.empty || day.isFuture ? 'default' : 'pointer' }"
                          :title="day.tooltip"
                          @click="handleDayClick(day)"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div class="flex items-center gap-2 mt-3 text-xs text-[var(--secondary-text)]">
              <span>น้อย</span>
              <div class="heatmap-day level-0" style="display:inline-block;"></div>
              <div class="heatmap-day level-1" style="display:inline-block;"></div>
              <div class="heatmap-day level-2" style="display:inline-block;"></div>
              <div class="heatmap-day level-3" style="display:inline-block;"></div>
              <span>มาก</span>
            </div>

            <!-- Day Detail Panel -->
            <div v-if="selectedDayDetails" class="mt-4 border-t border-gray-200 pt-4">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h4 class="text-sm font-semibold text-[var(--primary-text)]">{{ selectedDayDetails.thaiDate }}</h4>
                  <p class="text-xs text-[var(--secondary-text)]">{{ selectedDayDetails.totalReports }} คนบันทึกรายงาน</p>
                </div>
                <button
                  v-if="selectedDay?.dateKey !== makeTodayDay().dateKey"
                  class="text-xs text-[var(--secondary-text)] hover:text-[var(--primary-text)]"
                  @click="selectedDay = makeTodayDay()"
                >
                  กลับวันนี้
                </button>
              </div>
              <div v-if="selectedDayDetails.entries.length > 0" class="space-y-2 max-h-[300px] overflow-y-auto">
                <div
                  v-for="entry in selectedDayDetails.entries"
                  :key="entry.userId"
                  class="flex items-center justify-between bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 text-sm"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-medium text-[var(--primary-text)] truncate">{{ entry.name }}</span>
                    <span
                      v-if="entry.stampType"
                      :class="['text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap', stampTypeColors[entry.stampType] || 'bg-gray-100 text-gray-600']"
                    >
                      {{ stampTypeLabels[entry.stampType] || entry.stampType }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span v-if="entry.projectCount > 0" class="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      {{ entry.projectCount }} โครงการ
                    </span>
                    <span v-if="entry.projects.length > 0" class="text-xs text-[var(--secondary-text)] truncate max-w-[150px]" :title="entry.projects.join(', ')">
                      {{ entry.projects.join(', ') }}
                    </span>
                  </div>
                </div>
              </div>
              <p v-else class="text-sm text-[var(--secondary-text)]">ไม่มีข้อมูลในวันนี้</p>
            </div>
          </div>

          <!-- Row 4: Bar Charts -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Employee Contribution -->
            <div class="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 class="text-sm font-semibold text-[var(--primary-text)] mb-4">อันดับการบันทึกรายงาน</h2>
              <div class="h-[280px]">
                <Bar :data="contributionChartData" :options="contributionChartOptions" />
              </div>
            </div>

            <!-- Projects per user -->
            <div class="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 class="text-sm font-semibold text-[var(--primary-text)] mb-4">จำนวนโครงการต่อผู้ใช้</h2>
              <div class="h-[280px]">
                <Bar :data="projectPerUserData" :options="{ ...contributionChartOptions, plugins: { legend: { display: false } } }" />
              </div>
            </div>
          </div>

          <!-- Inactive Users Warning -->
          <div v-if="users.filter(u => !allReportLogs.some(r => r.user_id === u.id)).length > 0" class="bg-amber-50 rounded-2xl border border-amber-200 p-5">
            <h2 class="text-sm font-semibold text-amber-800 mb-3">ผู้ใช้ที่ยังไม่เคยบันทึกรายงาน</h2>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="u in users.filter(u => !allReportLogs.some(r => r.user_id === u.id))"
                :key="u.id"
                class="text-sm bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-amber-800"
              >
                {{ u.name || 'ไม่มีชื่อ' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Users Tab -->
        <div v-if="activeTab === 'users'" class="space-y-3">
          <div
            v-for="u in users"
            :key="u.id"
            class="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <!-- User Row -->
            <div
              class="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
              @click="toggleUserDetails(u.id)"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-full bg-[var(--surface)] flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <img v-if="u.profile_image" :src="u.profile_image" alt="" class="w-full h-full object-cover">
                  <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--secondary-text)" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div class="min-w-0">
                  <div class="font-medium text-[var(--primary-text)] truncate">
                    {{ u.name || 'ยังไม่ตั้งชื่อ' }}
                    <span v-if="u.is_admin" class="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Admin</span>
                  </div>
                  <div class="text-sm text-[var(--secondary-text)] truncate">
                    {{ u.role || '-' }} &middot; {{ u.workplace || '-' }}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <div class="text-xs text-[var(--secondary-text)] hidden sm:block">
                  {{ u.updated_at ? new Date(u.updated_at).toLocaleDateString('th-TH') : '-' }}
                </div>
                <svg
                  :class="['w-5 h-5 text-gray-400 transition-transform', expandedUser === u.id ? 'rotate-180' : '']"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </div>

            <!-- Expanded Details -->
            <div v-if="expandedUser === u.id" class="border-t border-gray-100 px-5 py-4 bg-gray-50">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <span class="text-[var(--secondary-text)]">User ID:</span>
                  <span class="ml-1 font-mono text-xs">{{ u.id }}</span>
                </div>
                <div>
                  <span class="text-[var(--secondary-text)]">Project Label:</span>
                  <span class="ml-1">{{ u.project_label || '-' }}</span>
                </div>
              </div>

              <div v-if="userDetails[u.id]">
                <!-- Projects -->
                <div class="mb-4">
                  <div class="text-sm font-medium text-[var(--primary-text)] mb-2">
                    โครงการ ({{ userDetails[u.id].projects.length }})
                  </div>
                  <div v-if="userDetails[u.id].projects.length > 0" class="space-y-1">
                    <div
                      v-for="p in userDetails[u.id].projects"
                      :key="p.id"
                      class="text-sm bg-white rounded-lg px-3 py-2 border border-gray-200"
                    >
                      <span class="font-medium">{{ p.name }}</span>
                      <span v-if="p.taiga_url" class="text-[var(--secondary-text)] ml-2 text-xs">{{ p.taiga_url }}</span>
                    </div>
                  </div>
                  <p v-else class="text-sm text-[var(--secondary-text)]">ไม่มีโครงการ</p>
                </div>

                <!-- Stamps -->
                <div class="mb-4">
                  <div class="text-sm font-medium text-[var(--primary-text)] mb-2">
                    Stamps ({{ userDetails[u.id].stamps.length }})
                  </div>
                  <div v-if="userDetails[u.id].stamps.length > 0" class="flex flex-wrap gap-1">
                    <span
                      v-for="s in userDetails[u.id].stamps.slice(0, 30)"
                      :key="s.date_key"
                      class="text-xs bg-white border border-gray-200 rounded px-2 py-1"
                    >
                      {{ s.date_key }}: {{ s.type }}
                    </span>
                    <span v-if="userDetails[u.id].stamps.length > 30" class="text-xs text-[var(--secondary-text)] py-1">
                      +{{ userDetails[u.id].stamps.length - 30 }} more
                    </span>
                  </div>
                  <p v-else class="text-sm text-[var(--secondary-text)]">ไม่มี stamps</p>
                </div>
              </div>
              <div v-else class="text-sm text-[var(--secondary-text)]">
                <span class="loading loading-spinner loading-xs"></span> กำลังโหลด...
              </div>

              <!-- Actions -->
              <div class="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                <BaseButton
                  v-if="!u.is_admin"
                  variant="danger"
                  size="sm"
                  @click.stop="confirmDelete(u)"
                >
                  ลบผู้ใช้
                </BaseButton>
                <span v-else class="text-xs text-[var(--secondary-text)] py-2">ไม่สามารถลบแอดมินได้</span>
              </div>
            </div>
          </div>

          <p v-if="users.length === 0" class="text-center py-12 text-[var(--secondary-text)]">
            ไม่พบผู้ใช้ในระบบ
          </p>
        </div>
      </template>
    </div>

    <ConfirmDialog
      :show="showDeleteConfirm"
      title="ยืนยันการลบผู้ใช้"
      :message="`ลบผู้ใช้ '${deleteTarget?.name || 'ไม่มีชื่อ'}' และข้อมูลทั้งหมดอย่างถาวร?`"
      confirm-text="ลบผู้ใช้"
      :danger="true"
      @confirm="handleDeleteUser"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<style scoped>
.admin-heatmap {
  margin-bottom: 0;
}
.admin-heatmap .heatmap-card {
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}

/* Summary Banner */
.summary-banner {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
}

/* D3 Bubble Chart */
.bubble-chart-wrapper {
  position: relative;
  min-height: 240px;
}

.bubble-svg {
  width: 100%;
  height: 240px;
  display: block;
}

.bubble-tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  background: #1e293b;
  color: #fff;
  padding: 6px 12px;
  border-radius: 8px;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.bubble-tooltip::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid #1e293b;
}

</style>
