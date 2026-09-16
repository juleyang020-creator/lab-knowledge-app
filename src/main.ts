import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createHttpRepository } from './adapters/httpRepository'
import { createWorkspace, workspaceKey } from './state/workspace'
import type { StoragePort } from './adapters/preferences'
import './styles.css'
import './reading.css'

let storage: StoragePort | null = null
try {
  storage = window.localStorage
} catch {
  /* Reading stays available without local storage. */
}
const app = createApp(App)
app.provide(workspaceKey, createWorkspace(createHttpRepository(import.meta.env.BASE_URL), storage))
app.use(router)
void router.isReady().then(() => app.mount('#app'))
