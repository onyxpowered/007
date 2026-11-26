// Pack the game into one self-contained HTML file (opens from disk or any host).
//   node tools/build-beta.mjs            -> dist/RLBeta.html   (beta: HUD 2 on)
//   node tools/build-beta.mjs --release  -> dist/REDLINE.html
// The page shell (loading screen, and the loader that serves the packed files
// to the game, its workers and its imports) comes from the 26.11.10 release,
// kept in tools/shell/; every file under assets/ is packed in, gzipped unless
// it's already compressed.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..'), release = process.argv.includes('--release');
const version = '26.11.10';
const head = readFileSync(join(ROOT, 'tools/shell/head.html'), 'utf8').split('\n'), tail = readFileSync(join(ROOT, 'tools/shell/tail.html'), 'utf8');
const i = head.findIndex((l) => l.includes('window.__RLVersion'));
head[i] = `<script>window.__RLVersion = "${version}";${release ? '' : ' window.__RLBeta = 1;'}</script>`;
const files = [], walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : f !== '.DS_Store' && files.push(p); });
walk(join(ROOT, 'assets')); files.push(join(ROOT, 'favicon.ico'));
const raw = /\.(mp3|ogg|png|jpe?g|webp|ktx2|woff2?)$/i;
const tags = files.map((f) => { let b = readFileSync(f); const gz = !raw.test(f); if (gz) b = gzipSync(b, { level: 9 }); return `<script type="text/plain" data-metal-path="/${relative(ROOT, f).split(sep).join('/')}"${gz ? ' data-gz' : ''}>${b.toString('base64')}</script>`; });
mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist', release ? 'REDLINE.html' : 'RLBeta.html'), html = [...head, ...tags, tail].join('\n');
writeFileSync(out, html);
console.log(`[build-beta] ${relative(ROOT, out)}: ${files.length} files, ${(html.length / 1e6).toFixed(1)} MB${release ? '' : ' (beta: HUD 2 on)'}`);
