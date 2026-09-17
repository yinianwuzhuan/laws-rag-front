import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/chat'
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/Chat.vue'),
    meta: { title: '法律咨询' }
  },
  {
    path: '/query',
    name: 'Query',
    component: () => import('@/views/Query.vue'),
    meta: { title: '自由检索测评' }
  },
  {
    path: '/upload',
    name: 'Upload',
    component: () => import('@/views/Upload.vue'),
    meta: { title: '文件上传' }
  },
  {
    path: '/evaluation',
    name: 'Evaluation',
    component: () => import('@/views/Evaluation.vue'),
    meta: { title: 'RAG 检索评测' }
  },
  {
    path: '/generation-evaluation',
    name: 'GenerationEvaluation',
    component: () => import('@/views/GenerationEvaluation.vue'),
    meta: { title: 'RAG 生成评测' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  document.title = to.meta.title ? `${to.meta.title} - 法律 RAG 系统` : '法律 RAG 系统'
  next()
})

export default router
