import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Writes THIRD_PARTY_NOTICES.txt: the license of every npm package the
 * renderer bundle contains, taken from whatever the bundle actually pulled in.
 *
 * React and lucide-react are devDependencies because this build bundles them
 * into dist/ and the main process never loads them. As runtime dependencies,
 * electron-builder also copied their node_modules folders into the app, 25 MB
 * of source maps, type files and development builds that nothing ran. Those
 * folders were the only place their MIT and ISC notices shipped, though — the
 * minified bundle drops license comments — so the notices are collected here.
 */
function thirdPartyNotices(): Plugin {
  return {
    name: 'rigmatch-third-party-notices',
    apply: 'build',
    generateBundle() {
      const packageDirs = new Map<string, string>()
      for (const id of this.getModuleIds()) {
        const parts = id.split(/[\\/]node_modules[\\/]/)
        if (parts.length < 2) continue
        const rest = parts[parts.length - 1]
        const segments = rest.split(/[\\/]/)
        const name = rest.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0]
        packageDirs.set(name, join(id.slice(0, id.length - rest.length), name))
      }

      const sections = [...packageDirs].sort(([a], [b]) => a.localeCompare(b)).map(([name, dir]) => {
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        const licenseFile = readdirSync(dir).find((file) => /^licen[cs]e(\.|$)/i.test(file))
        // A package with no license text to ship is a notice this build would
        // silently leave out, so it stops the build instead.
        if (!licenseFile) this.error(`${name} has no LICENSE file to copy into THIRD_PARTY_NOTICES.txt`)
        const text = readFileSync(join(dir, licenseFile), 'utf8').trim()
        return `${name} ${manifest.version} (${manifest.license})\n${'-'.repeat(60)}\n${text}\n`
      })

      this.emitFile({
        type: 'asset',
        fileName: 'THIRD_PARTY_NOTICES.txt',
        source: `Open-source software bundled into RigMatch's interface.\n\n${sections.join('\n')}`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), thirdPartyNotices()],
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
