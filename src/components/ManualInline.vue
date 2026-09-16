<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Audience } from '../domain/content'
import { inlineTokens } from '../domain/manual'
const props = defineProps<{ text: string; audience: Audience }>()
const tokens = computed(() => inlineTokens(props.text))
</script>
<template>
  <template v-for="(token, index) in tokens" :key="index">
    <br v-if="token.kind === 'br'" />
    <RouterLink
      v-else-if="token.kind === 'link'"
      :to="{ name: 'manual', params: { audience }, query: { section: token.target } }"
      >{{ token.text }}</RouterLink
    >
    <component
      :is="token.kind"
      v-else-if="token.kind === 'sup' || token.kind === 'sub' || token.kind === 'strong'"
      >{{ token.text }}</component
    >
    <template v-else>{{ token.text }}</template>
  </template>
</template>
