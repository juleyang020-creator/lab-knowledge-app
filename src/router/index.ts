import { createRouter, createWebHashHistory } from 'vue-router'
import ItemsView from '../views/ItemsView.vue'
import ItemDetailView from '../views/ItemDetailView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import SourcesView from '../views/SourcesView.vue'
import ManualView from '../views/ManualView.vue'
import BooksView from '../views/BooksView.vue'
import BookReaderView from '../views/BookReaderView.vue'
import SearchView from '../views/SearchView.vue'
import DiseasesView from '../views/DiseasesView.vue'
import DiseaseDetailView from '../views/DiseaseDetailView.vue'

export default createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/items' },
    { path: '/items', name: 'items', component: ItemsView },
    { path: '/items/:itemId', name: 'item', component: ItemDetailView },
    { path: '/saved', name: 'saved', component: ItemsView },
    { path: '/diseases', name: 'diseases', component: DiseasesView },
    { path: '/diseases/:diseaseId', name: 'disease', component: DiseaseDetailView },
    { path: '/books', name: 'books', component: BooksView },
    { path: '/books/:bookId', name: 'book', component: BookReaderView },
    { path: '/books/:bookId/:chapterId', name: 'chapter', component: BookReaderView },
    { path: '/manual', name: 'manual', component: ManualView },
    { path: '/library', name: 'library', component: () => import('../views/LibraryView.vue') },
    {
      path: '/library/:documentId',
      name: 'library-document',
      component: () => import('../views/LibraryView.vue'),
    },
    { path: '/search', name: 'search', component: SearchView },
    { path: '/sources', name: 'sources', component: SourcesView },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
  scrollBehavior(to, from, saved) {
    if (to.path === from.path) return false
    return saved ?? { top: 0 }
  },
})
