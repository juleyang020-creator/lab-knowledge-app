import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfigWithVueTs(
  { files: ['**/*.{vue,ts,mts,tsx}'] },
  globalIgnores([
    '.hermes/**',
    'dist/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'private-inputs/**',
    'public/pdfjs/**',
  ]),
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  { ...pluginVitest.configs.recommended, files: ['src/**/__tests__/**'] },
  skipFormatting,
)
