import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name !== 'sw.js') files.push(file);
  }
}
await walk('dist');
files.sort();
const digest = createHash('sha256');
for (const file of files) digest.update(file).update(await readFile(file));
const version = digest.digest('hex').slice(0, 12);
const assets = files.map(file => `${path.relative('dist', file).replaceAll('\\', '/')}`).filter(file => file !== 'index.html');
assets.unshift('./');
let worker = await readFile('public/sw.js', 'utf8');
worker = worker.replace("const CACHE_VERSION = 'v1';", `const CACHE_VERSION = '${version}';`)
  .replace(/const SHELL_ASSETS = \[[^;]*\];/, `const SHELL_ASSETS = ${JSON.stringify(assets)};`);
await writeFile('dist/sw.js', worker);
console.log(`Offline shell prepared: ${assets.length} public assets; cache ${version}. No API or conversation data cached.`);
