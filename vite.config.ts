import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    watch: {
      /**
       * Build output the dev server has no business watching.
       *
       * The root dev server watched the whole project, which includes the
       * companion's Rust build tree. Running a Tauri build while `npm run dev`
       * was up killed the dev server outright — chokidar tried to watch a file
       * cargo had locked, and an FSWatcher error is emitted rather than
       * returned, so the vite process died on an unhandled event and
       * concurrently -k took the Electron launcher down with it:
       *
       *   Error: EBUSY: resource busy or locked, watch
       *   '...\\src-tauri\\target\\release\\build\\build_script_build-....exe'
       *
       * Watching it was never wanted anyway. The log right before that crash is
       * a run of "page reload rigmatch-chat/dist/index.html" — the companion's
       * own build output was full-reloading the app it has nothing to do with.
       *
       * Vite prepends its own ignores (.git, node_modules, the outDir) to this
       * list rather than replacing them, so these are additions and dist/ stays
       * covered without being named.
       */
      ignored: [
        // Cargo's target tree: hundreds of thousands of files, rewritten and
        // briefly locked on every companion build.
        '**/src-tauri/target/**',
        // The companion's built frontend — a separate app with its own vite.
        '**/rigmatch-chat/dist/**',
        // electron-builder's output, including a full unpacked Electron copy.
        '**/release/**',
        // Where prepare-companions drops the built companion binary.
        '**/companions/**',
      ],
    },
  },
})
