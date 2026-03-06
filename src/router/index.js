import { createRouter, createWebHashHistory } from 'vue-router'
import { useAppStore } from '../stores/app'

const routes = [
  {
    path: '/',
    name: 'landing',
    component: () => import('../views/LandingPage.vue'),
    meta: { requiresNoAuth: true }
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('../views/OnboardingPage.vue'),
    meta: { requiresNoAuth: true }
  },
  {
    path: '/app',
    name: 'app',
    component: () => import('../views/MainApp.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/daily-flow',
    name: 'daily-flow',
    component: () => import('../views/DailyFlowPage.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminDashboard.vue'),
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const store = useAppStore()

  // If onboarding complete and trying to access landing/onboarding, redirect to app
  if (store.onboardingComplete && to.meta.requiresNoAuth) {
    next({ name: 'app' })
    return
  }

  // If onboarding not complete and trying to access app, redirect to landing
  if (!store.onboardingComplete && to.meta.requiresAuth) {
    next({ name: 'landing' })
    return
  }

  next()
})

export default router
