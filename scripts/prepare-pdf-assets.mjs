import { cpSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const source = dirname(require.resolve('pdfjs-dist/package.json'))
const output = new URL('../public/pdfjs/', import.meta.url)
mkdirSync(output, { recursive: true })
for (const folder of ['wasm', 'cmaps', 'standard_fonts']) {
  cpSync(join(source, folder), new URL(`${folder}/`, output), { recursive: true })
}
