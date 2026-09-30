import { defineConfig } from 'vitest/config'

// Next.js compiles JSX with the automatic runtime (no `import React`); make
// vitest do the same so component tests can render app components.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
})
