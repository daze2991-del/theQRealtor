import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'

// Next.js compiles JSX with the automatic runtime (no `import React`); make
// vitest do the same so component tests can render app components.
// The `@/` alias mirrors tsconfig.json "paths" ("@/*" → "./*") so routes that
// import '@/lib/...' resolve under test exactly as they do under Next.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
})
