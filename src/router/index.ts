import { createRouter, createWebHashHistory } from 'vue-router'
import LandingView from '../views/LandingView.vue'
import DirectoryView from '../views/DirectoryView.vue'
import DetailView from '../views/DetailView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import SourcesView from '../views/SourcesView.vue'
import ReferenceView from '../views/ReferenceView.vue'
import ManualView from '../views/ManualView.vue'
import SpecimenView from '../views/SpecimenView.vue'

export default createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: LandingView },
    { path: '/sources', name: 'sources', component: SourcesView },
    { path: '/library', name: 'library', component: () => import('../views/LibraryView.vue') },
    {
      path: '/library/:documentId',
      name: 'library-document',
      component: () => import('../views/LibraryView.vue'),
    },
    { path: '/:audience(professional)/topics', name: 'topics', component: ReferenceView },
    { path: '/:audience(patient)/guide', name: 'guide', component: ReferenceView },
    { path: '/:audience(professional|patient)', name: 'directory', component: DirectoryView },
    { path: '/:audience(professional|patient)/manual', name: 'manual', component: ManualView },
    {
      path: '/:audience(professional|patient)/specimens',
      name: 'specimens',
      component: SpecimenView,
    },
    { path: '/:audience(professional|patient)/saved', name: 'saved', component: DirectoryView },
    { path: '/:audience(professional|patient)/items/:itemId', name: 'item', component: DetailView },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
  scrollBehavior(to, from, saved) {
    if (to.path === from.path) return false
    return saved ?? { top: 0 }
  },
})
