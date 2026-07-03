/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  // Preflight is disabled so Tailwind's global resets don't affect the
  // existing inline-styled pages; the landing page scopes its own resets
  // under the `.lp` class in globals.css.
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
}
