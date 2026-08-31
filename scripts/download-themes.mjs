import fs from 'fs';
import path from 'path';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
  'Referer': 'https://www.google.com/',
};

const PLAN = [
  {
    dest: 'public/themes/bg_aquarium.jpg',
    candidates: [
      'https://images.unsplash.com/photo-1660487004859-78225a1087d5?fm=jpg&q=85&w=1920&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1546026423-cc4642628d2b?fm=jpg&q=85&w=1920&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1693723595870-2b8bad09b4c2?fm=jpg&q=85&w=1920&auto=format&fit=crop',
    ],
  },
  {
    dest: 'public/themes/card_back_aquarium.jpg',
    candidates: [
      'https://images.unsplash.com/photo-1559825481-12a05cc00344?fm=jpg&q=85&w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1504983875-d3b163aba9e6?fm=jpg&q=85&w=800&auto=format&fit=crop',
    ],
  },
  {
    // Candy Kingdom from Adventure Time
    dest: 'public/themes/bg_candy.jpg',
    candidates: [
      'https://wallpapers.com/images/hd/adventure-time-candy-kingdom-scene-72smh1c3gk1vk5n6.jpg',
      'https://images5.alphacoders.com/333/thumb-1920-333602.jpg',
      'https://wallpaperaccess.com/full/1147654.jpg',
    ],
  },
  {
    dest: 'public/themes/card_back_candy.jpg',
    candidates: [
      'https://images.unsplash.com/photo-1501446529957-6226fffde6ea?fm=jpg&q=85&w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1563805042-7684c019e1cb?fm=jpg&q=85&w=800&auto=format&fit=crop',
    ],
  },
  {
    // Huntress Wizard - Adventure Time
    dest: 'public/themes/bg_adventure.jpg',
    candidates: [
      'https://c4.wallpaperflare.com/wallpaper/957/490/402/tv-show-adventure-time-huntress-wizard-adventure-time-hd-wallpaper-preview.jpg',
      'https://w0.peakpx.com/wallpaper/659/641/HD-wallpaper-huntress-wizard-adventure-time.jpg',
      'https://images2.alphacoders.com/750/thumb-1920-750099.jpg',
    ],
  },
  {
    dest: 'public/themes/card_back_adventure.jpg',
    candidates: [
      'https://c4.wallpaperflare.com/wallpaper/957/490/402/tv-show-adventure-time-huntress-wizard-adventure-time-hd-wallpaper-preview.jpg',
      'https://i.imgur.com/4tQWQF3.jpg',
    ],
  },
  {
    // Pedro Pascal - Cannes 2025 red carpet (Wikimedia CC)
    dest: 'public/themes/bg_pedro.jpg',
    candidates: [
      'https://upload.wikimedia.org/wikipedia/commons/6/6d/Pedro_Pascal_at_the_2025_Cannes_Film_Festival_04.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/e/ef/Pedro_Pascal_at_the_2025_Cannes_Film_Festival_02.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/0/0b/Pedro_Pascal_at_SXSW_2025_01_%28cropped%29.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/9/90/Pedro_Pascal_%2835282848054%29.jpg',
    ],
  },
  {
    dest: 'public/themes/card_back_pedro.jpg',
    candidates: [
      'https://upload.wikimedia.org/wikipedia/commons/e/ef/Pedro_Pascal_at_the_2025_Cannes_Film_Festival_02.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/0/0b/Pedro_Pascal_at_SXSW_2025_01_%28cropped%29.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/9/90/Pedro_Pascal_%2835282848054%29.jpg',
    ],
  },
];

async function download(url, dest) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) throw new Error(`Got HTML`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000) throw new Error(`Too small: ${buf.length}b`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`  ✅ ${(buf.length/1024).toFixed(0)}KB from ${url.substring(0, 60)}`);
}

async function tryFallbacks({ dest, candidates }) {
  console.log(`\n📥 ${dest}`);
  for (const url of candidates) {
    try { await download(url, dest); return; }
    catch (e) { console.warn(`  ⚠️  ${e.message.substring(0, 60)}`); }
  }
  console.error(`  ❌ All candidates failed for ${dest}`);
}

async function run() {
  console.log('🎨 Downloading curated theme images...\n');
  for (const item of PLAN) await tryFallbacks(item);
  console.log('\n✅ Done!');
}

run().catch(console.error);
