<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>
<template>
  <section class="empty-panel">
    <h1>这个页面暂不存在</h1>
    <p>请从阅读入口重新查找项目。</p>
    <RouterLink class="primary-button" to="/">回到入口</RouterLink>
  </section>
</template>
