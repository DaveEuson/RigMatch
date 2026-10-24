#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const testRoot = path.join(process.cwd(), 'tests');

async function collectTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      files.push(fullPath);
    }
  }

  return files;
}

const testFiles = (await collectTestFiles(testRoot)).sort();

if (testFiles.length === 0) {
  console.error(`No test files found in ${testRoot}`);
  process.exit(1);
}

// Relative paths: Windows caps a command line at 32,767 characters, and 211
// absolute paths from a checkout under %TEMP% passed it, so the suite exited 1
// without running a test or saying why.
const result = spawnSync(process.execPath, ['--test', ...testFiles.map((file) => path.relative(process.cwd(), file))], {
  stdio: 'inherit',
});

if (result.error) console.error(`Could not start the tests: ${result.error.message}`);
process.exit(result.status ?? 1);
