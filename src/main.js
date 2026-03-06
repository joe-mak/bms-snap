import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css'

import App from './App.vue'
import router from './router'
import { useAppStore } from './stores/app'
import { useSupabase } from './composables/useSupabase'

import './assets/style.css'

const app = createApp(App)

app.use(createPinia())

// Load local data
const store = useAppStore()
store.loadData()

// Init Supabase auth, then mount
const { init } = useSupabase()
init().then(() => {
  // Load profile from Supabase if logged in
  store.loadProfileFromSupabase()
}).finally(() => {
  app.use(router)
  app.component('QuillEditor', QuillEditor)
  app.mount('#app')
})
