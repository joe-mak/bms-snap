<script setup>
import { useAppStore } from '../stores/app'
import TodayTemplate from '../components/features/TodayTemplate.vue'

const store = useAppStore()

const todayReport = store.getReportByDate(new Date())
</script>

<template>
  <div class="playground-page">
    <TodayTemplate
      :content-html="todayReport?.contentHtml || '<p>ตัวอย่างเนื้อหาเทมเพลต</p>'"
      :images="(todayReport?.images || []).map(img => typeof img === 'string' ? { data: img } : img)"
      :user-name="store.user.name || 'ผู้ใช้'"
      :user-role="store.user.role || ''"
      :user-workplace="store.user.workplace || ''"
      :project-label="store.user.projectLabel || ''"
      :report-saved="true"
      :is-saving="false"
      :report-project-ids="todayReport?.projects || []"
      mode="readonly"
      :debug="true"
    />
  </div>
</template>

<style scoped>
.playground-page {
  position: relative;
  min-height: 100vh;
  background: var(--primary-brand);
}
</style>
