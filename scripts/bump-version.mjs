#!/usr/bin/env node
/**
 * Bumps the version in package.json using this project's rollover scheme.
 *
 * Every prompt that changes the project is one patch. Patch and minor both cap
 * at 20 and roll over, so counting never has to be done by hand:
 *
 *   1.0.20  + patch -> 1.1.0
 *   1.20.20 + patch -> 2.0.0
 *
 * Usage:
 *   node scripts/bump-version.mjs [patch|minor|major] [--dry-run]
 *
 * `minor` and `major` force a larger step for a breaking or milestone change;
 * they reset the levels below them and are not subject to the cap.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CAP = 20

/** Applies one bump. Exported so the rule can be unit-checked. */
export function bump(version, level = 'patch') {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!m) throw new Error(`Not a semver version: "${version}"`)
  let [major, minor, patch] = m.slice(1).map(Number)

  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') {
    minor += 1
    if (minor > CAP) return `${major + 1}.0.0`
    return `${major}.${minor}.0`
  }
  if (level !== 'patch') throw new Error(`Unknown level: "${level}"`)

  patch += 1
  if (patch <= CAP) return `${major}.${minor}.${patch}`

  // Patch overflowed — carry into minor, which may overflow into major.
  minor += 1
  patch = 0
  if (minor > CAP) return `${major + 1}.0.0`
  return `${major}.${minor}.${patch}`
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const level = args.find((a) => !a.startsWith('-')) ?? 'patch'

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const pkgPath = path.join(root, 'package.json')
  const raw = readFileSync(pkgPath, 'utf8')
  const pkg = JSON.parse(raw)

  const next = bump(pkg.version, level)

  if (dryRun) {
    console.log(`${pkg.version} -> ${next} (${level}, dry run)`)
  } else {
    // Rewrite only the version field so formatting and key order survive.
    writeFileSync(pkgPath, raw.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${next}"`))
    console.log(`${pkg.version} -> ${next} (${level})`)
  }

  console.log(`\nAdd this heading to CHANGELOG.md:\n\n## [${next}] — ${new Date().toISOString().slice(0, 10)}\n`)
}
