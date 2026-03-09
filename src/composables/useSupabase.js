import { ref } from 'vue'
import { supabase } from '../lib/supabase'

const user = ref(null)
const loading = ref(true)

export function useSupabase() {
  async function init() {
    loading.value = true
    const { data: { session } } = await supabase.auth.getSession()
    user.value = session?.user ?? null
    loading.value = false

    supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null
    })
  }

  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return data
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    user.value = null
  }

  // --- Profile (user account data) ---

  async function getProfile() {
    if (!user.value) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return data
  }

  async function upsertProfile(profile) {
    if (!user.value) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: user.value.id,
        ...profile,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    if (error) throw error
    return data
  }

  async function deleteAccount() {
    if (!user.value) throw new Error('Not authenticated')
    const { error } = await supabase.rpc('delete_user')
    if (error) throw error
    user.value = null
  }

  // --- Projects ---

  async function getProjects() {
    if (!user.value) return []
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.value.id)
      .order('created_at')
    if (error) throw error
    return data || []
  }

  async function syncProjects(localProjects) {
    if (!user.value) return

    // Delete existing and replace with current local state
    await supabase
      .from('projects')
      .delete()
      .eq('user_id', user.value.id)

    if (localProjects.length === 0) return

    const rows = localProjects.map(p => ({
      user_id: user.value.id,
      name: p.name,
      taiga_url: p.taigaUrl || '',
      template: p.template || '',
    }))

    const { error } = await supabase.from('projects').insert(rows)
    if (error) throw error
  }

  // --- Stamps (heatmap) ---

  async function getStamps() {
    if (!user.value) return {}
    const { data, error } = await supabase
      .from('stamps')
      .select('date_key, type')
      .eq('user_id', user.value.id)
    if (error) throw error
    const result = {}
    for (const row of data || []) {
      result[row.date_key] = row.type
    }
    return result
  }

  async function syncStamps(localStamps) {
    if (!user.value) return

    await supabase
      .from('stamps')
      .delete()
      .eq('user_id', user.value.id)

    const entries = Object.entries(localStamps)
    if (entries.length === 0) return

    const rows = entries.map(([dateKey, type]) => ({
      user_id: user.value.id,
      date_key: dateKey,
      type,
    }))

    const { error } = await supabase.from('stamps').insert(rows)
    if (error) throw error
  }

  // --- Report Logs ---

  async function upsertReportLog(dateKey, projectCount) {
    if (!user.value) return
    const { error } = await supabase
      .from('report_logs')
      .upsert({
        user_id: user.value.id,
        date_key: dateKey,
        project_count: projectCount,
      })
    if (error) throw error
  }

  async function getUserReportLogs() {
    if (!user.value) return []
    const { data, error } = await supabase
      .from('report_logs')
      .select('date_key, project_count')
      .eq('user_id', user.value.id)
    if (error) throw error
    return data || []
  }

  async function getAllReportLogs() {
    const { data, error } = await supabase
      .from('report_logs')
      .select('user_id, date_key, project_count')
    if (error) throw error
    return data || []
  }

  // --- Reports (full data) ---

  async function getReports() {
    if (!user.value) return []
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('user_id', user.value.id)
      .order('date', { ascending: false })
    if (error) throw error
    return data || []
  }

  async function upsertReport(report) {
    if (!user.value) return
    const d = new Date(report.date)
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const { error } = await supabase
      .from('reports')
      .upsert({
        user_id: user.value.id,
        date_key: dateKey,
        date: report.date,
        content_html: report.contentHtml || '',
        project_ids: report.projects || [],
        project_names: report.projectNames || [],
        images: report.images || [],
      }, { onConflict: 'user_id,date_key' })
    if (error) throw error
  }

  async function deleteAllReports() {
    if (!user.value) return
    await supabase.from('reports').delete().eq('user_id', user.value.id)
  }

  // --- Admin ---

  async function isAdmin() {
    if (!user.value) return false
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.value.id)
      .single()
    return data?.is_admin === true
  }

  async function getAllUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  async function getUserProjects(userId) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at')
    if (error) throw error
    return data || []
  }

  async function getUserStamps(userId) {
    const { data, error } = await supabase
      .from('stamps')
      .select('date_key, type')
      .eq('user_id', userId)
    if (error) throw error
    return data || []
  }

  async function getAllStamps() {
    const { data, error } = await supabase
      .from('stamps')
      .select('user_id, date_key, type')
    if (error) throw error
    return data || []
  }

  async function getAllProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('user_id, name')
    if (error) throw error
    return data || []
  }

  async function adminDeleteUser(userId) {
    const { error } = await supabase.rpc('admin_delete_user', { target_user_id: userId })
    if (error) throw error
  }

  return {
    user,
    loading,
    init,
    signUp,
    signIn,
    signOut,
    getProfile,
    upsertProfile,
    deleteAccount,
    getProjects,
    syncProjects,
    getStamps,
    syncStamps,
    isAdmin,
    getAllUsers,
    getUserProjects,
    getUserStamps,
    upsertReportLog,
    getUserReportLogs,
    getAllReportLogs,
    getReports,
    upsertReport,
    deleteAllReports,
    getAllStamps,
    getAllProjects,
    adminDeleteUser,
  }
}
