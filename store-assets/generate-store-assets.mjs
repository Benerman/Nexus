/**
 * Generates Google Play Store assets for Nexus:
 *   - play-store-icon-512.png  (512×512, no transparency, no border)
 *   - play-store-banner-1024x500.png  (1024×500 feature graphic)
 *
 * Run from repo root:
 *   node store-assets/generate-store-assets.mjs
 */

import sharp from '../client/node_modules/sharp/lib/index.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BG = '#2b2d31';
const RED = '#ed4245';
const WHITE = '#ffffff';
const OUT_DIR = __dirname;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hex colour → {r,g,b} */
function hex(h) {
  const v = parseInt(h.replace('#', ''), 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

/**
 * Build a flat-colour PNG buffer (no sharp dependency) using raw pixel data.
 * Used as a compositing base.
 */
async function solidRect(w, h, colour) {
  const { r, g, b } = hex(colour);
  // 3 channels, no alpha — avoids transparency bleed on PNG save
  const data = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  }
  return sharp(data, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Icon  512×512
// ---------------------------------------------------------------------------

async function makeIcon() {
  const SIZE = 512;
  const PADDING = 56; // breathing room around hex

  // Hexagon centred in a 512×512 space
  // Vertices of a regular hex (flat-top orientation, centred at 256,256)
  // We use the same "outline" style as icon-master.svg
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = SIZE / 2 - PADDING; // outer radius of stroke centre
  const STROKE = Math.round(SIZE * (56 / 1024)); // scale stroke width from 1024→512

  function hexPts(radius) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30); // pointy-top
      return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
    });
  }

  function ptStr(pts) {
    return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  }

  const pts = hexPts(R);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <polygon points="${ptStr(pts)}" fill="none" stroke="${RED}" stroke-width="${STROKE}" stroke-linejoin="round"/>
</svg>`;

  const outPath = path.join(OUT_DIR, 'play-store-icon-512.png');
  await sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    // flatten removes any residual alpha so there is zero transparency
    .flatten({ background: hex(BG) })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log('✓ Icon:', outPath);
}

// ---------------------------------------------------------------------------
// Banner  1024×500
// ---------------------------------------------------------------------------

async function makeBanner() {
  const W = 1024;
  const H = 500;

  // We render entirely in SVG so text layout is deterministic and nothing clips.
  // Font sizes chosen to fit comfortably inside 1024px width with generous padding.

  const ICON_SIZE = 160;
  const ICON_X = 80;
  const ICON_Y = (H - ICON_SIZE) / 2;

  // Hexagon for the mini icon in the banner
  const cx = ICON_X + ICON_SIZE / 2;
  const cy = ICON_Y + ICON_SIZE / 2;
  const R = ICON_SIZE / 2 - 12;
  const STROKE = 11;

  function hexPts(radius) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
    });
  }
  function ptStr(pts) {
    return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  }

  const pts = hexPts(R);
  const hexSvg = `<polygon points="${ptStr(pts)}" fill="none" stroke="${RED}" stroke-width="${STROKE}" stroke-linejoin="round"/>`;

  // Text block starts to the right of the icon
  const TEXT_X = ICON_X + ICON_SIZE + 48;
  // Available text width = total width minus left margin and right padding
  const TEXT_W = W - TEXT_X - 60;

  // Title: "Nexus" — large, bold
  const TITLE_Y = ICON_Y + 52;
  const TITLE_SIZE = 88;

  // Tagline — fits within TEXT_W at font-size 28
  const TAG_Y = TITLE_Y + 68;
  const TAG_SIZE = 28;
  const TAGLINE = 'Your community. Your voice. Your servers.';

  // Sub-line
  const SUB_Y = TAG_Y + 46;
  const SUB_SIZE = 22;
  const SUBLINE = 'Real-time servers, voice chat, soundboard &amp; messaging — fully self-hosted';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- Subtle accent bar on left edge -->
  <rect x="0" y="0" width="6" height="${H}" fill="${RED}"/>

  <!-- Mini hexagon icon -->
  ${hexSvg}

  <!-- App name -->
  <text
    x="${TEXT_X}"
    y="${TITLE_Y}"
    font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    font-size="${TITLE_SIZE}"
    font-weight="700"
    fill="${WHITE}"
    text-anchor="start"
    dominant-baseline="auto"
  >Nexus</text>

  <!-- Accent underline beneath title -->
  <rect x="${TEXT_X}" y="${TITLE_Y + 8}" width="100" height="4" fill="${RED}" rx="2"/>

  <!-- Tagline -->
  <text
    x="${TEXT_X}"
    y="${TAG_Y}"
    font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    font-size="${TAG_SIZE}"
    font-weight="400"
    fill="${RED}"
    text-anchor="start"
  >${TAGLINE}</text>

  <!-- Sub-line -->
  <text
    x="${TEXT_X}"
    y="${SUB_Y}"
    font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    font-size="${SUB_SIZE}"
    font-weight="400"
    fill="#b0b3b8"
    text-anchor="start"
  >${SUBLINE}</text>
</svg>`;

  const outPath = path.join(OUT_DIR, 'play-store-banner-1024x500.png');
  await sharp(Buffer.from(svg))
    .resize(W, H)
    .flatten({ background: hex(BG) })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log('✓ Banner:', outPath);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

try {
  await makeIcon();
  await makeBanner();
  console.log('\nAll assets generated in', OUT_DIR);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
