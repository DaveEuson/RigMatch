// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * A D1 database for the scoreboard's tests: Node's own SQLite, with the
 * scoreboard's migrations applied, behind the part of D1's binding the
 * scoreboard uses. D1 is SQLite, so the real SQL runs here as it would there,
 * and an undefined value is refused as D1 refuses it.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function scoreboardDb(root = process.cwd()) {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(root, 'scoreboard', 'migrations');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(path.join(dir, file), 'utf8'));
  }
  const plain = (row) => (row ? { ...row } : null);
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => plain(sqlite.prepare(sql).get(...values)),
    all: async () => ({ results: sqlite.prepare(sql).all(...values).map(plain) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  });
  return {
    prepare: (sql) => statement(sql),
    /** D1 runs a batch as one transaction. */
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const entry of statements) results.push(await entry.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    /** Every row of every table, for checking what is kept. */
    dump: () => Object.fromEntries(['results', 'day_salt', 'sends_today'].map((table) => [table, sqlite.prepare(`SELECT * FROM ${table}`).all().map(plain)])),
    sqlite,
  };
}
