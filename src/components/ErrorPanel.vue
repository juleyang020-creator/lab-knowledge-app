<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'
defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <section class="empty-panel error-panel" role="alert">
    <CircleAlert :size="30" aria-hidden="true" />
    <h2>资料暂时未能加载</h2>
    <p>{{ message }}</p>
    <button class="primary-button" type="button" @click="$emit('retry')">重试加载</button>
  </section>
</template>
