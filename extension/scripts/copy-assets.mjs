// Copy static assets from extension root into dist/ after TypeScript build.
// Run: node scripts/copy-assets.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

// Files to copy from root to dist
const files = ['manifest.json', 'popup.html', 'popup.css'];
for (const f of files) {
  const src = path.join(root, f);
  const dst = path.join(dist, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`Copied ${f} → dist/`);
  }
}

// Copy icons directory
const iconsDir = path.join(root, 'icons');
const iconsDistDir = path.join(dist, 'icons');
if (fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDistDir, { recursive: true });
  for (const f of fs.readdirSync(iconsDir)) {
    fs.copyFileSync(path.join(iconsDir, f), path.join(iconsDistDir, f));
    console.log(`Copied icons/${f} → dist/icons/`);
  }
}

console.log('Asset copy complete.');
