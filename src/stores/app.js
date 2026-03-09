import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const DEFAULT_TEMPLATE = `<p>โครงการ: {project} ประกอบไปด้วยผลการดำเนินงาน ดังนี้</p><ol><li><br></li><li><br></li><li><br></li></ol>`

export const useAppStore = defineStore('app', () => {
  // State
  const user = ref({
    name: '',
    role: '',
    workplace: '',
    profileImage: '',
    projectLabel: ''
  })

  const projects = ref([])
  const selectedProjects = ref([])
  const reports = ref([])
  const lastReportDate = ref(null)
  const onboardingComplete = ref(false)
  const morningTemplate = ref('{name}\nงานประจำวันที่ {date}\n- ')
  const stamps = ref({})
  const reportLogs = ref({})
  const supabaseLoaded = ref(false)

  // Computed
  const totalReportsThisYear = computed(() => {
    const currentYear = new Date().getFullYear()
    return reports.value.filter(r => new Date(r.date).getFullYear() === currentYear).length
  })

  const hasReportedToday = computed(() => {
    const today = new Date().toDateString()
    return lastReportDate.value === today
  })

  const selectedProjectObjects = computed(() => {
    return selectedProjects.value.map(id => projects.value.find(p => p.id === id)).filter(Boolean)
  })

  // Actions
  function loadData() {
    const saved = localStorage.getItem('dailyReportData')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.projects) {
          parsed.projects = parsed.projects.map(p => ({
            ...p,
            template: p.template || DEFAULT_TEMPLATE
          }))
        }
        if (parsed.user) {
          if (!parsed.user.profileImage) parsed.user.profileImage = ''
          if (!parsed.user.projectLabel) parsed.user.projectLabel = ''
          user.value = { ...user.value, ...parsed.user }
        }
        if (!parsed.morningTemplate) {
          parsed.morningTemplate = '{name}\nงานประจำวันที่ {date}\n- '
        }
        projects.value = parsed.projects || []
        selectedProjects.value = parsed.selectedProjects || []
        reports.value = parsed.reports || []
        lastReportDate.value = parsed.lastReportDate || null
        onboardingComplete.value = parsed.onboardingComplete || false
        morningTemplate.value = parsed.morningTemplate
        stamps.value = parsed.stamps || {}
      } catch (e) {
        console.error('Error loading data:', e)
      }
    }
  }

  function saveData() {
    try {
      const data = {
        user: user.value,
        projects: projects.value,
        selectedProjects: selectedProjects.value,
        reports: reports.value,
        lastReportDate: lastReportDate.value,
        onboardingComplete: onboardingComplete.value,
        morningTemplate: morningTemplate.value,
        stamps: stamps.value
      }
      localStorage.setItem('dailyReportData', JSON.stringify(data))
      return true
    } catch (e) {
      if (e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          e.name === 'w3c_dom_storage_quota_exceeded_error') {
        console.warn('Storage full, attempting cleanup...')
        cleanOldReportImages()
        try {
          const data = {
            user: user.value,
            projects: projects.value,
            selectedProjects: selectedProjects.value,
            reports: reports.value,
            lastReportDate: lastReportDate.value,
            onboardingComplete: onboardingComplete.value,
            morningTemplate: morningTemplate.value
          }
          localStorage.setItem('dailyReportData', JSON.stringify(data))
          return true
        } catch (e2) {
          cleanAllReportImages()
          try {
            const data = {
              user: user.value,
              projects: projects.value,
              selectedProjects: selectedProjects.value,
              reports: reports.value,
              lastReportDate: lastReportDate.value,
              onboardingComplete: onboardingComplete.value,
              morningTemplate: morningTemplate.value
            }
            localStorage.setItem('dailyReportData', JSON.stringify(data))
            return true
          } catch (e3) {
            console.error('Save failed even after cleanup', e3)
            return false
          }
        }
      }
      console.error('Error saving data:', e)
      return false
    }
  }

  function cleanOldReportImages() {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    let cleaned = false
    reports.value.forEach(report => {
      if (report.images && report.images.length > 0) {
        const reportDate = new Date(report.date)
        if (reportDate < thirtyDaysAgo) {
          report.images = []
          cleaned = true
        }
      }
    })
    return cleaned
  }

  function cleanAllReportImages() {
    reports.value.forEach(report => {
      if (report.images) {
        report.images = []
      }
    })
  }

  async function setUser(userData) {
    user.value = { ...user.value, ...userData }
    saveData()
    await syncProfileToSupabase()
  }

  async function syncProfileToSupabase() {
    try {
      const { useSupabase } = await import('../composables/useSupabase')
      const { user: authUser, upsertProfile } = useSupabase()
      if (authUser.value) {
        await upsertProfile({
          name: user.value.name,
          role: user.value.role,
          workplace: user.value.workplace,
          project_label: user.value.projectLabel,
          morning_template: morningTemplate.value,
          profile_image: user.value.profileImage,
          onboarding_complete: onboardingComplete.value,
          selected_projects: selectedProjects.value,
        })
      }
    } catch (e) {
      console.warn('Supabase profile sync skipped:', e.message)
    }
  }

  async function syncProjectsToSupabase() {
    try {
      const { useSupabase } = await import('../composables/useSupabase')
      const { user: authUser, syncProjects } = useSupabase()
      if (authUser.value) {
        await syncProjects(projects.value)
      }
    } catch (e) {
      console.warn('Supabase projects sync skipped:', e.message)
    }
  }

  async function syncStampsToSupabase() {
    try {
      const { useSupabase } = await import('../composables/useSupabase')
      const { user: authUser, syncStamps } = useSupabase()
      if (authUser.value) {
        await syncStamps(stamps.value)
      }
    } catch (e) {
      console.warn('Supabase stamps sync skipped:', e.message)
    }
  }

  async function syncReportLogToSupabase(date, projectCount) {
    try {
      const { useSupabase } = await import('../composables/useSupabase')
      const { user: authUser, upsertReportLog } = useSupabase()
      if (authUser.value) {
        const d = new Date(date)
        const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        await upsertReportLog(dateKey, projectCount)
      }
    } catch (e) {
      console.warn('Supabase report log sync skipped:', e.message)
    }
  }

  async function syncReportToSupabase(report) {
    try {
      const { useSupabase } = await import('../composables/useSupabase')
      const { user: authUser, upsertReport } = useSupabase()
      if (authUser.value) {
        await upsertReport(report)
      }
    } catch (e) {
      console.warn('Supabase report sync skipped:', e.message)
    }
  }

  async function syncAllToSupabase() {
    await Promise.all([
      syncProfileToSupabase(),
      syncProjectsToSupabase(),
      syncStampsToSupabase(),
    ])
    // Sync all existing reports (logs + full data)
    for (const report of reports.value) {
      const projectCount = report.projects ? report.projects.length : 1
      await syncReportLogToSupabase(report.date, projectCount)
      await syncReportToSupabase(report)
    }
  }

  async function loadFromSupabase() {
    try {
      const { useSupabase } = await import('../composables/useSupabase')
      const { user: authUser, getProfile, getProjects, getStamps, getReports, getUserReportLogs } = useSupabase()
      if (!authUser.value) return

      const [profile, supaProjects, supaStamps, supaReports, supaReportLogs] = await Promise.all([
        getProfile(),
        getProjects(),
        getStamps(),
        getReports(),
        getUserReportLogs(),
      ])

      if (profile) {
        user.value = {
          ...user.value,
          name: profile.name || user.value.name,
          role: profile.role || user.value.role,
          workplace: profile.workplace || user.value.workplace,
          projectLabel: profile.project_label || user.value.projectLabel,
          profileImage: profile.profile_image || user.value.profileImage,
        }
        if (profile.morning_template) {
          morningTemplate.value = profile.morning_template
        }
        if (profile.onboarding_complete != null) {
          onboardingComplete.value = profile.onboarding_complete
        }
        if (profile.selected_projects && profile.selected_projects.length > 0) {
          selectedProjects.value = profile.selected_projects
        }
      }

      if (supaProjects.length > 0) {
        projects.value = supaProjects.map((p, index) => ({
          id: index + 1,
          name: p.name,
          taigaUrl: p.taiga_url || '',
          template: p.template || DEFAULT_TEMPLATE,
        }))
      }

      if (Object.keys(supaStamps).length > 0) {
        stamps.value = supaStamps
      }

      if (supaReportLogs.length > 0) {
        const logsMap = {}
        for (const log of supaReportLogs) {
          logsMap[log.date_key] = log.project_count
        }
        reportLogs.value = logsMap
      }

      // Restore full reports from Supabase if local is empty or has fewer
      if (supaReports.length > 0 && supaReports.length >= reports.value.length) {
        reports.value = supaReports.map(r => ({
          date: r.date,
          contentHtml: r.content_html || '',
          projects: r.project_ids || [],
          projectNames: r.project_names || [],
          images: r.images || [],
        }))
        // Restore lastReportDate from most recent report
        const today = new Date().toDateString()
        const hasTodayReport = reports.value.some(r => new Date(r.date).toDateString() === today)
        if (hasTodayReport) {
          lastReportDate.value = today
        }
      }

      saveData()
      supabaseLoaded.value = true
    } catch (e) {
      supabaseLoaded.value = true
      console.warn('Supabase load skipped:', e.message)
    }
  }

  async function loadProfileFromSupabase() {
    await loadFromSupabase()
  }

  async function addProject(project) {
    const newId = projects.value.length > 0
      ? Math.max(...projects.value.map(p => p.id)) + 1
      : 1
    projects.value.push({
      id: newId,
      name: project.name,
      taigaUrl: project.taigaUrl || '',
      template: project.template || DEFAULT_TEMPLATE
    })
    saveData()
    syncProjectsToSupabase()
    return newId
  }

  async function updateProject(projectId, data) {
    const index = projects.value.findIndex(p => p.id === projectId)
    if (index > -1) {
      projects.value[index] = { ...projects.value[index], ...data }
      saveData()
      syncProjectsToSupabase()
    }
  }

  async function deleteProject(projectId) {
    projects.value = projects.value.filter(p => p.id !== projectId)
    selectedProjects.value = selectedProjects.value.filter(id => id !== projectId)
    saveData()
    syncProjectsToSupabase()
  }

  function toggleProject(projectId) {
    const index = selectedProjects.value.indexOf(projectId)
    if (index > -1) {
      selectedProjects.value.splice(index, 1)
    } else {
      selectedProjects.value.push(projectId)
    }
    saveData()
    syncProfileToSupabase()
  }

  function clearSelectedProjects() {
    selectedProjects.value = []
  }

  function addReport(report) {
    const today = new Date().toDateString()
    const now = new Date().toISOString()
    lastReportDate.value = today
    const fullReport = { date: now, ...report }
    reports.value.push(fullReport)
    saveData()
    const projectCount = report.projects ? report.projects.length : 1
    syncReportLogToSupabase(now, projectCount)
    syncReportToSupabase(fullReport)
  }

  function updateTodayReport(report) {
    const today = new Date().toDateString()
    const existingIndex = reports.value.findIndex(r => new Date(r.date).toDateString() === today)
    if (existingIndex > -1) {
      reports.value[existingIndex] = { ...reports.value[existingIndex], ...report }
      saveData()
      const updated = reports.value[existingIndex]
      const projectCount = updated.projects ? updated.projects.length : 1
      syncReportLogToSupabase(updated.date, projectCount)
      syncReportToSupabase(updated)
    }
  }

  function getReportByDate(date) {
    const dateString = date.toDateString()
    return reports.value.find(r => new Date(r.date).toDateString() === dateString)
  }

  async function completeOnboarding(userData, projectsList) {
    user.value = { ...user.value, ...userData }
    projects.value = projectsList.map((p, index) => ({
      ...p,
      id: p.id || index + 1,
      template: p.template || DEFAULT_TEMPLATE
    }))
    onboardingComplete.value = true
    saveData()
    await syncAllToSupabase()
  }

  function importData(importedData) {
    const currentDataBackup = {
      user: { ...user.value },
      projects: [...projects.value],
      selectedProjects: [...selectedProjects.value],
      reports: [...reports.value],
      lastReportDate: lastReportDate.value,
      onboardingComplete: onboardingComplete.value,
      morningTemplate: morningTemplate.value
    }

    try {
      if (importedData.user) user.value = { ...user.value, ...importedData.user }
      if (importedData.projects) projects.value = importedData.projects
      if (importedData.reports) reports.value = importedData.reports
      if (importedData.lastReportDate) lastReportDate.value = importedData.lastReportDate
      if (importedData.morningTemplate) morningTemplate.value = importedData.morningTemplate
      if (importedData.stamps) stamps.value = importedData.stamps
      onboardingComplete.value = true

      if (saveData()) {
        return { success: true, message: 'นำเข้าข้อมูลสำเร็จ! 🎉' }
      }

      // Try without report images
      if (reports.value.length > 0) {
        reports.value = reports.value.map(report => ({ ...report, images: [] }))
      }
      if (saveData()) {
        return { success: true, message: 'ไฟล์ใหญ่เกินไป - นำเข้าเฉพาะข้อความ (ตัดรูปภาพออก) ✓' }
      }

      // Try without profile image
      user.value.profileImage = ''
      if (saveData()) {
        return { success: true, message: 'พื้นที่เต็ม - นำเข้าเฉพาะข้อมูลจำเป็น ✓' }
      }

      // Restore backup
      user.value = currentDataBackup.user
      projects.value = currentDataBackup.projects
      selectedProjects.value = currentDataBackup.selectedProjects
      reports.value = currentDataBackup.reports
      lastReportDate.value = currentDataBackup.lastReportDate
      onboardingComplete.value = currentDataBackup.onboardingComplete
      morningTemplate.value = currentDataBackup.morningTemplate
      saveData()

      return { success: false, message: 'นำเข้าล้มเหลว: ไฟล์ใหญ่เกินกว่าจะบันทึกได้' }
    } catch (error) {
      console.error('Import error:', error)
      return { success: false, message: 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล' }
    }
  }

  function exportData() {
    const exportObj = {
      exportDate: new Date().toISOString(),
      appVersion: '2.0-vue',
      data: {
        user: user.value,
        projects: projects.value,
        reports: reports.value,
        lastReportDate: lastReportDate.value,
        onboardingComplete: onboardingComplete.value,
        morningTemplate: morningTemplate.value,
        stamps: stamps.value
      }
    }
    return exportObj
  }

  function clearTodayReport() {
    const today = new Date().toDateString()
    reports.value = reports.value.filter(r => new Date(r.date).toDateString() !== today)
    lastReportDate.value = null
    saveData()
  }

  async function clearAllReports() {
    reports.value = []
    lastReportDate.value = null
    stamps.value = {}
    saveData()
    syncStampsToSupabase()
    try {
      const { useSupabase } = await import('../composables/useSupabase')
      const { user: authUser, deleteAllReports } = useSupabase()
      if (authUser.value) await deleteAllReports()
    } catch (e) {
      console.warn('Supabase reports delete skipped:', e.message)
    }
  }

  function deleteAllData() {
    localStorage.removeItem('dailyReportData')
    user.value = {
      name: '',
      role: '',
      workplace: '',
      profileImage: '',
      projectLabel: ''
    }
    projects.value = []
    selectedProjects.value = []
    reports.value = []
    lastReportDate.value = null
    onboardingComplete.value = false
    morningTemplate.value = '{name}\nงานประจำวันที่ {date}\n- '
    stamps.value = {}
  }

  function setMorningTemplate(template) {
    morningTemplate.value = template
    saveData()
    syncProfileToSupabase()
  }

  function toggleStamp(dateKey, type) {
    if (stamps.value[dateKey] === type) {
      delete stamps.value[dateKey]
    } else {
      stamps.value[dateKey] = type
    }
    stamps.value = { ...stamps.value }
    saveData()
    syncStampsToSupabase()
  }

  return {
    // State
    user,
    projects,
    selectedProjects,
    reports,
    lastReportDate,
    onboardingComplete,
    morningTemplate,
    stamps,
    reportLogs,
    supabaseLoaded,

    // Computed
    totalReportsThisYear,
    hasReportedToday,
    selectedProjectObjects,

    // Actions
    loadData,
    saveData,
    setUser,
    addProject,
    updateProject,
    deleteProject,
    toggleProject,
    clearSelectedProjects,
    addReport,
    updateTodayReport,
    getReportByDate,
    clearTodayReport,
    clearAllReports,
    completeOnboarding,
    importData,
    exportData,
    deleteAllData,
    setMorningTemplate,
    toggleStamp,
    syncProfileToSupabase,
    syncProjectsToSupabase,
    syncStampsToSupabase,
    syncReportToSupabase,
    syncAllToSupabase,
    loadFromSupabase,
    loadProfileFromSupabase,

    // Constants
    DEFAULT_TEMPLATE
  }
})
