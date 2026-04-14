#!/usr/bin/env node
/**
 * Validates that LIVING_ARCHITECTURE.md documents all project files.
 * Run before commit. Exits 1 if any file is not documented.
 *
 * Usage: node scripts/update-living-architecture.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARCH_PATH = path.join(ROOT, 'LIVING_ARCHITECTURE.md');
const IGNORE = new Set([
  'node_modules', '.git', 'package-lock.json', '.gitignore',
  '.cursor', '.claude', 'result.score[team2.name]',
]);

function getAllFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    if (IGNORE.has(e.name)) continue;
    const rel = path.join(base, e.name).replace(/\\/g, '/');
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files = files.concat(getAllFiles(full, rel));
    } else {
      files.push(rel.startsWith('./') ? rel : rel);
    }
  }
  return files;
}

function main() {
  const arch = fs.readFileSync(ARCH_PATH, 'utf8');
  const projectFiles = getAllFiles(ROOT);

  const missing = [];
  for (const f of projectFiles) {
    const norm = f.replace(/^\.\//, '');
    if (norm === 'LIVING_ARCHITECTURE.md' || norm === 'scripts/update-living-architecture.js') continue;
    const inDoc = arch.includes(norm) || arch.includes(norm.split('/').pop());
    if (!inDoc) missing.push(norm);
  }

  if (missing.length > 0) {
    console.error('LIVING_ARCHITECTURE.md is missing the following files:');
    missing.forEach((f) => console.error('  -', f));
    console.error('\nAdd them and run this script again before committing.');
    process.exit(1);
  }
  console.log('LIVING_ARCHITECTURE.md is up to date.');
}

main();
