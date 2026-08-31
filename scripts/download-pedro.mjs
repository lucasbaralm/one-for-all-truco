import fs from 'fs';
import path from 'path';

const IMAGES = [
  // Pedro Pascal - Wikimedia CC license (safe, direct, high-res)
  {
    dest: 'public/themes/bg_pedro.jpg',
    candidates: [
      'https://upload.wikimedia.org/wikipedia/commons/9/90/Pedro_Pascal_%2835282848054%29.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Pedro_Pascal_%2835282848054%29.jpg/1280px-Pedro_Pascal_%2835282848054%29.jpg',
      'https://wallpaperaccess.com/full/5472397.jpg',
      'https://wallpaperaccess.com/full/5472385.jpg',
    ],
  },
  {
    dest: 'public/themes/card_back_pedro.jpg',
    candidates: [
      // The Mandalorian poster - iconic Pedro look
      'https://upload.wikimedia.org/wikipedia/en/2/2e/The_Mandalorian_S2_Poster.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Pedro_Pascal_%2835282848054%29.jpg/640px-Pedro_Pascal_%2835282848054%29.jpg',
      'https://wallpaperaccess.com/full/5472390.jpg',
    ],
  },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
  'Referer': 'https://www.google.com/',
};

async function download(url, dest) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) throw new Error(`Got HTML`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000) throw new Error(`Too small: ${buf.length}b`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`✅ ${dest} (${(buf.length/1024).toFixed(0)} KB)`);
}

async function tryFallbacks(candidates, dest) {
  for (const url of candidates) {
    try { await download(url, dest); return; }
    catch (e) { console.warn(`  ⚠️  ${url} → ${e.message}`); }
  }
  console.error(`❌ Could not download ${dest}`);
}

async function run() {
  console.log('🎬 Baixando imagens Pedro Pascal...\n');
  for (const { dest, candidates } of IMAGES) {
    console.log(`📥 ${dest}`);
    await tryFallbacks(candidates, dest);
  }
  console.log('\nFinalizado!');
}

run().catch(console.error);
