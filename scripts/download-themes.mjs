import fs from 'fs';
import path from 'path';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
  'Referer': 'https://www.google.com/',
};

const PLAN = [
  {
    // Real aquarium/coral tank (previous image was a generic koi pond)
    dest: 'public/themes/bg_aquarium.jpg',
    candidates: [
      'https://images.unsplash.com/photo-1613117799054-66cacc1914c3?fm=jpg&q=85&w=1920&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1660487004859-78225a1087d5?fm=jpg&q=85&w=1920&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1546026423-cc4642628d2b?fm=jpg&q=85&w=1920&auto=format&fit=crop',
    ],
  },
  {
    dest: 'public/themes/card_back_aquarium.jpg',
    candidates: [
      'https://images.unsplash.com/photo-1761753200180-319115462d08?fm=jpg&q=85&w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1559825481-12a05cc00344?fm=jpg&q=85&w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1504983875-d3b163aba9e6?fm=jpg&q=85&w=800&auto=format&fit=crop',
    ],
  },
  {
    // Candy Kingdom from Adventure Time - existing bg already an accurate show screenshot, kept as-is
    dest: 'public/themes/bg_candy.jpg',
    candidates: [
      'https://wallpapers.com/images/hd/adventure-time-candy-kingdom-scene-72smh1c3gk1vk5n6.jpg',
      'https://images5.alphacoders.com/333/thumb-1920-333602.jpg',
      'https://wallpaperaccess.com/full/1147654.jpg',
    ],
  },
  {
    // Was a generic Oreo dessert stock photo, unrelated to the show - replace with the actual Candy Kingdom scene
    dest: 'public/themes/card_back_candy.jpg',
    candidates: [
      'https://images5.alphacoders.com/333/thumb-1920-333602.jpg',
      'https://wallpapers.com/images/hd/adventure-time-candy-kingdom-scene-72smh1c3gk1vk5n6.jpg',
      'https://wallpaperaccess.com/full/1147654.jpg',
    ],
  },
  {
    // Huntress Wizard - Adventure Time (previous image was an unrelated bear-forest scene from a different episode)
    dest: 'public/themes/bg_adventure.jpg',
    candidates: [
      'https://images2.alphacoders.com/104/thumb-1920-1046472.png',
      'https://w0.peakpx.com/wallpaper/659/641/HD-wallpaper-huntress-wizard-adventure-time.jpg',
      'https://c4.wallpaperflare.com/wallpaper/957/490/402/tv-show-adventure-time-huntress-wizard-adventure-time-hd-wallpaper-preview.jpg',
      'https://images2.alphacoders.com/104/thumbbig-1046472.webp',
    ],
  },
  {
    // Previous image was a title card ("Slumber Party Panic") with no Huntress Wizard in it
    dest: 'public/themes/card_back_adventure.jpg',
    candidates: [
      'https://images2.alphacoders.com/104/thumb-1920-1046472.png',
      'https://w0.peakpx.com/wallpaper/659/641/HD-wallpaper-huntress-wizard-adventure-time.jpg',
      'https://c4.wallpaperflare.com/wallpaper/957/490/402/tv-show-adventure-time-huntress-wizard-adventure-time-hd-wallpaper-preview.jpg',
      'https://images2.alphacoders.com/104/thumbbig-1046472.webp',
    ],
  },
  {
    // Pedro Pascal - Cannes 2025 red carpet (Wikimedia CC) - already good, kept as-is
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
  {
    // Lord of the Rings - Middle-earth / Fellowship landscape
    dest: 'public/themes/bg_lotr.jpg',
    candidates: [
      'https://images4.alphacoders.com/860/thumb-1920-86098.jpg',
      'https://images3.alphacoders.com/817/thumb-1920-81775.jpg',
    ],
  },
  {
    // The One Ring - thematically distinct card back for the LOTR theme
    dest: 'public/themes/card_back_lotr.jpg',
    candidates: [
      'https://images.alphacoders.com/928/thumb-1920-928456.jpg',
      'https://images.alphacoders.com/436/thumb-1920-436308.jpg',
    ],
  },
  {
    // MPB / Brazilian music - Rio de Janeiro / Ipanema coastline (bossa-nova era aesthetic, no named-artist likeness)
    dest: 'public/themes/bg_mpb.jpg',
    candidates: [
      'https://images.unsplash.com/photo-1698724683993-5747925300ec?fm=jpg&q=85&w=1920&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?fm=jpg&q=85&w=1920&auto=format&fit=crop',
    ],
  },
  {
    // Classic Brazilian string instrument (violão/cavaquinho-style) - generic, no named artist
    dest: 'public/themes/card_back_mpb.jpg',
    candidates: [
      'https://images.unsplash.com/photo-1541688446332-be3754f9682a?fm=jpg&q=85&w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1541991961-c16157c6f0e6?fm=jpg&q=85&w=800&auto=format&fit=crop',
    ],
  },
  {
    // LGBT Pride - rainbow flag waving against blue sky (Wikimedia Commons, CC-licensed)
    dest: 'public/themes/bg_lgbt.jpg',
    candidates: [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Rainbow_flag_and_blue_skies.jpg/1920px-Rainbow_flag_and_blue_skies.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Rainbow_flag_breeze.jpg/1920px-Rainbow_flag_breeze.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Madrid_Pride_Parade_2023_20.jpg/1920px-Madrid_Pride_Parade_2023_20.jpg',
    ],
  },
  {
    // Clean flat pride-flag graphic, distinct from the photographic background.
    // Note: this is a flat 6-color-stripe vector graphic, so it legitimately compresses to just
    // a few KB as a PNG - that's expected, not a broken/placeholder download (minBytes overridden below).
    dest: 'public/themes/card_back_lgbt.jpg',
    minBytes: 100,
    candidates: [
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/48/Gay_Pride_Flag.svg/960px-Gay_Pride_Flag.svg.png',
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/48/Gay_Pride_Flag.svg/640px-Gay_Pride_Flag.svg.png',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Rainbow_flag_breeze.jpg/800px-Rainbow_flag_breeze.jpg',
    ],
  },
];

async function download(url, dest, minBytes) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) throw new Error(`Got HTML`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < minBytes) throw new Error(`Too small: ${buf.length}b`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`  ✅ ${(buf.length/1024).toFixed(0)}KB from ${url.substring(0, 60)}`);
}

async function tryFallbacks({ dest, candidates, minBytes = 10000 }) {
  console.log(`\n📥 ${dest}`);
  for (const url of candidates) {
    try { await download(url, dest, minBytes); return; }
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
