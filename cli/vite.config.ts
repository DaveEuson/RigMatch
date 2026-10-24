// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { defineConfig } from 'vite';

/**
 * Builds the command-line fit check into one plain-JS file Node runs on its
 * own: no Electron, no TypeScript, none of the app's other packages.
 * Everything is bundled in except systeminformation, which is the CLI's only
 * dependency (cli/package.json). `npm run build:cli` writes cli/dist.
 */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'cli/rigmatch-fit.ts',
    outDir: 'cli/dist',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rolldownOptions: {
      output: {
        entryFileNames: 'rigmatch-fit.mjs',
        // The shebang first, so the file runs as a bin; the notice second, so
        // the published file says whose it is like every source file does.
        banner: '#!/usr/bin/env node\n// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.',
      },
      // No module here runs for its side effects, so whatever the CLI does not
      // call is dropped. Without this, modelCatalog.ts's import of appConfig.ts
      // kept the app's menu icons, and with them all of React.
      treeshake: { moduleSideEffects: false },
    },
  },
  ssr: {
    noExternal: true,
    external: ['systeminformation'],
  },
});
