// One-command full backup of the PRODUCTION D1 database to a timestamped .sql dump.
//
//   npm run db:backup
//
// The dump is a plain SQL file (schema + all data) written to /backups. It's the same
// format you'd import into another SQLite/Postgres/MySQL, so it's also your portability
// escape hatch. Dumps contain ALL customer data — /backups is gitignored, keep them private.
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const apiDir = join(root, 'api')       // wrangler.toml (with the D1 binding) lives here
const backupsDir = join(root, 'backups')
mkdirSync(backupsDir, { recursive: true })

// e.g. labhive-2026-07-02_10-54-31.sql  (filesystem-safe, sortable)
const stamp = new Date().toISOString().replace('T', '_').replace(/:/g, '-').slice(0, 19)
const out = join(backupsDir, `labhive-${stamp}.sql`)

console.log(`Exporting production D1 (labhive) → ${out}`)
console.log('This reads the live remote database; it does not change anything.\n')
try {
  execSync(`npx wrangler d1 export labhive --remote --output "${out}"`, { cwd: apiDir, stdio: 'inherit' })
  console.log(`\n✅ Backup complete: ${out}`)
  console.log('   Keep this file private — it contains every customer\'s data. (/backups is gitignored.)')
} catch {
  console.error('\n❌ Backup failed. Make sure wrangler is authenticated (npx wrangler login) and you have network access.')
  process.exit(1)
}
