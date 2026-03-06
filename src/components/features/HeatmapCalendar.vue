<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useAppStore } from '../../stores/app'
import { useDateTime } from '../../composables/useDateTime'
import { useToast } from '../../composables/useToast'

const store = useAppStore()
const { showToast } = useToast()
const { thaiMonthsShort, formatThaiDate } = useDateTime()

const emit = defineEmits(['viewReport'])

const selectedYear = ref(new Date().getFullYear())
const activeSticker = ref(null)
const showDock = ref(false)

const stickerTypes = [
  { id: 'vacation', emoji: '🏝️', label: 'ลาพักร้อน', color: '#56bb89' },
  { id: 'sick', emoji: '🤒', label: 'ลาป่วย', color: '#e8845a' },
  { id: 'on-leave', emoji: '📅', label: 'ลาอื่น ๆ', color: '#f47451' },
  { id: 'eraser', emoji: '🧹', label: 'ลบสติกเกอร์', color: '#999999' }
]

function toggleDock() {
  showDock.value = !showDock.value
  if (!showDock.value) activeSticker.value = null
}

function toggleSticker(id) {
  activeSticker.value = activeSticker.value === id ? null : id
}

const dockRef = ref(null)

function handleDockMouseMove(e) {
  const dock = dockRef.value
  if (!dock) return
  const buttons = dock.querySelectorAll('.dock-btn')
  buttons.forEach(btn => {
    const rect = btn.getBoundingClientRect()
    const btnCenterX = rect.left + rect.width / 2
    const distance = Math.abs(e.clientX - btnCenterX)
    const maxDist = 120
    const t = Math.max(0, 1 - distance / maxDist)
    const scale = t * t * (3 - 2 * t) // smoothstep curve
    const magnify = 1 + scale * 0.35
    const lift = scale * 8
    btn.style.transform = `scale(${magnify}) translateY(-${lift}px)`
  })
}

function handleDockMouseLeave() {
  const dock = dockRef.value
  if (!dock) return
  const buttons = dock.querySelectorAll('.dock-btn')
  buttons.forEach(btn => {
    btn.style.transform = ''
  })
}

const availableYears = [2026, 2025, 2024, 2023]

const reportCountMap = computed(() => {
  const map = {}
  store.reports.forEach(report => {
    const reportDate = new Date(report.date)
    const dateKey = `${reportDate.getFullYear()}-${reportDate.getMonth()}-${reportDate.getDate()}`
    const projectCount = report.projects ? report.projects.length : 1
    map[dateKey] = (map[dateKey] || 0) + projectCount
  })
  return map
})

const calendarData = computed(() => {
  const year = selectedYear.value
  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31)
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
        const count = reportCountMap.value[dateKey] || 0
        const isPastOrToday = currentDate <= today

        let level = 0
        if (count === 1) level = 1
        else if (count === 2) level = 2
        else if (count >= 3) level = 3

        const thaiDate = formatThaiDate(currentDate)

        weekData.push({
          date: currentDate,
          dateKey,
          count,
          level: isPastOrToday ? level : -1, // -1 for future
          tooltip: count > 0 ? `${thaiDate}: ${count} โครงการ` : `${thaiDate}: ไม่มีข้อมูล`,
          isFuture: !isPastOrToday
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
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
  const totalDays = isLeapYear ? 366 : 365
  const totalWeeks = Math.ceil((totalDays + firstDayOfWeek) / 7)
  const labels = []

  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(year, month, 1)
    const dayOfYear = Math.floor((monthStart - startDate) / (1000 * 60 * 60 * 24))
    const weekOfMonth = Math.floor((dayOfYear + firstDayOfWeek) / 7)

    labels.push({
      name: thaiMonthsShort[month],
      position: (weekOfMonth / totalWeeks) * 100
    })
  }

  return labels
})

function setYear(year) {
  selectedYear.value = year
}

function handleDayClick(day) {
  if (day.empty) return
  if (activeSticker.value) {
    if (activeSticker.value === 'eraser') {
      if (store.stamps[day.dateKey]) {
        store.toggleStamp(day.dateKey, store.stamps[day.dateKey])
      }
      return
    }
    if (day.count > 0) {
      showToast('ไม่สามารถแปะสติกเกอร์บนวันที่มีข้อมูลได้')
      return
    }
    if (day.isFuture && activeSticker.value === 'sick') {
      showToast('ไม่สามารถแปะลาป่วยในวันที่ยังมาไม่ถึง')
      return
    }
    store.toggleStamp(day.dateKey, activeSticker.value)
    return
  }
  if (day.isFuture) return
  if (day.count > 0) {
    emit('viewReport', day.date)
  }
}

function getStampEmoji(dateKey) {
  const type = store.stamps[dateKey]
  if (!type) return null
  const sticker = stickerTypes.find(s => s.id === type)
  return sticker ? sticker.emoji : null
}

function closeDock() {
  showDock.value = false
  activeSticker.value = null
}

defineExpose({ closeDock })
</script>

<template>
  <div class="heatmap-section">
    <section class="heatmap-card">
      <div class="heatmap-header">
        <div>
          <h3 class="heatmap-title">บันทึกการอัปบล็อก</h3>
          <p class="heatmap-subtitle">ข้อมูลนับจากการบันทึกรายงานประจำวัน สามารถแปะอิโมจิให้กับช่องวันที่ว่างอยู่ได้</p>
        </div>
        <button class="sticker-dock-trigger" :class="{ active: showDock }" @click="toggleDock">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="4" cy="10" r="2" fill="currentColor"/>
            <circle cx="10" cy="10" r="2" fill="currentColor"/>
            <circle cx="16" cy="10" r="2" fill="currentColor"/>
          </svg>
        </button>
      </div>
      <div class="heatmap-container">
        <div class="heatmap-months">
          <span
            v-for="(label, index) in monthLabels"
            :key="index"
            :style="{ left: label.position + '%' }"
          >
            {{ label.name }}
          </span>
        </div>
        <div class="heatmap-wrapper heatmap-grid-layout">
          <div class="heatmap-days">
            <span>อา.</span>
            <span>จ.</span>
            <span>อ.</span>
            <span>พ.</span>
            <span>พฤ.</span>
            <span>ศ.</span>
            <span>ส.</span>
          </div>
          <div class="heatmap-grid">
            <div v-for="(week, weekIndex) in calendarData" :key="weekIndex" class="heatmap-week">
              <div
                v-for="(day, dayIndex) in week"
                :key="dayIndex"
                class="heatmap-day"
                :class="{
                  empty: day.empty,
                  future: day.isFuture && !store.stamps[day.dateKey],
                  [`level-${day.level}`]: !day.empty && !day.isFuture && !store.stamps[day.dateKey],
                  [`stamp-${store.stamps[day.dateKey]}`]: !day.empty && store.stamps[day.dateKey]
                }"
                :title="day.tooltip"
                :style="{ cursor: (!day.empty && activeSticker && !(day.isFuture && activeSticker === 'sick')) || day.count > 0 ? 'pointer' : 'default' }"
                @click="handleDayClick(day)"
              >
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="heatmap-legend">
        <span class="legend-label">น้อย</span>
        <div class="legend-scale">
          <div class="legend-box level-0"></div>
          <div class="legend-box level-1"></div>
          <div class="legend-box level-2"></div>
          <div class="legend-box level-3"></div>
        </div>
        <span class="legend-label">มาก</span>
      </div>
    </section>
    <div class="heatmap-year-card">
      <div class="heatmap-year-list">
        <button
          v-for="year in availableYears"
          :key="year"
          class="year-btn"
          :class="{ active: selectedYear === year }"
          :data-year="year"
          @click="setYear(year)"
        >
          {{ year }}
        </button>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="dock">
      <div v-if="showDock" class="sticker-dock-overlay">
        <div ref="dockRef" class="sticker-dock" @mousemove="handleDockMouseMove" @mouseleave="handleDockMouseLeave">
          <button
            v-for="sticker in stickerTypes"
            :key="sticker.id"
            class="sticker-btn dock-btn"
            :class="{ active: activeSticker === sticker.id }"
            :style="{
              '--sticker-color': sticker.color
            }"
            @click="toggleSticker(sticker.id)"
          >
            <span class="dock-emoji">{{ sticker.emoji }}</span>
            <span class="dock-label">{{ sticker.label }}</span>
          </button>
          <div class="dock-divider"></div>
          <button class="dock-close" @click="toggleDock">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
