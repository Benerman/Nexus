#!/usr/bin/env node
/**
 * Generate all application icons from the master SVG.
 * Requires: sharp (npm install sharp)
 * macOS: uses iconutil for .icns generation
 */

import sharp from 'sharp';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Master SVGs
const SVG_PATH = join(__dirname, 'icon-master.svg');
const TRAY_SVG_PATH = join(__dirname, 'icon-master-tray.svg');
const svgBuffer = readFileSync(SVG_PATH);
const traySvgBuffer = readFileSync(TRAY_SVG_PATH);

// Output directories
const PUBLIC_DIR = join(ROOT, 'public');
const TAURI_ICONS_DIR = join(ROOT, 'src-tauri', 'icons');
const ANDROID_RES_DIR = join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Foreground-only SVG (hexagon on transparent background) for adaptive icons.
// Scaled to 60% and centered so the hexagon fits within the 66% safe zone
// that Android uses for adaptive icon masking.
const foregroundSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(512, 528) scale(0.6) translate(-512, -528)">
    <path d="M512 128L896 348V708L512 928L128 708V348Z" fill="none" stroke="#ed4245" stroke-width="56" stroke-linejoin="round"/>
  </g>
</svg>`
);

// Apple icon corner radius: ~22.37% of icon size
const APPLE_CORNER_RADIUS_RATIO = 0.2237;

async function generatePng(size, outputPath) {
  await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 43, g: 45, b: 49, alpha: 1 } })
    .png()
    .toFile(outputPath);
  console.log(`  ✓ ${outputPath} (${size}x${size})`);
}

async function generateRoundedPng(size, outputPath) {
  const radius = Math.round(size * APPLE_CORNER_RADIUS_RATIO);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  );

  const base = await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 43, g: 45, b: 49, alpha: 1 } })
    .png()
    .toBuffer();

  await sharp(base)
    .composite([{ input: await sharp(mask).resize(size, size).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toFile(outputPath);
  console.log(`  ✓ ${outputPath} (${size}x${size}, rounded)`);
}

async function generateTrayPng(size, outputPath) {
  await sharp(traySvgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath);
  console.log(`  ✓ ${outputPath} (${size}x${size}, tray)`);
}

async function generateIco(sizes, outputPath) {
  // ICO format: header + directory entries + image data
  // Each image is stored as a PNG
  const images = [];
  for (const size of sizes) {
    const buf = await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 43, g: 45, b: 49, alpha: 1 } })
      .png()
      .toBuffer();
    images.push({ size, data: buf });
  }

  // ICO file format
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;

  let dataOffset = headerSize + dirEntrySize * numImages;
  const dirEntries = [];
  for (const img of images) {
    dirEntries.push({
      width: img.size >= 256 ? 0 : img.size,
      height: img.size >= 256 ? 0 : img.size,
      dataSize: img.data.length,
      dataOffset,
    });
    dataOffset += img.data.length;
  }

  const totalSize = dataOffset;
  const buffer = Buffer.alloc(totalSize);

  // Header: reserved(2) + type(2) + count(2)
  buffer.writeUInt16LE(0, 0);      // Reserved
  buffer.writeUInt16LE(1, 2);      // Type: 1 = ICO
  buffer.writeUInt16LE(numImages, 4); // Number of images

  // Directory entries
  for (let i = 0; i < numImages; i++) {
    const entry = dirEntries[i];
    const offset = headerSize + i * dirEntrySize;
    buffer.writeUInt8(entry.width, offset);        // Width
    buffer.writeUInt8(entry.height, offset + 1);   // Height
    buffer.writeUInt8(0, offset + 2);              // Color palette
    buffer.writeUInt8(0, offset + 3);              // Reserved
    buffer.writeUInt16LE(1, offset + 4);           // Color planes
    buffer.writeUInt16LE(32, offset + 6);          // Bits per pixel
    buffer.writeUInt32LE(entry.dataSize, offset + 8);  // Image data size
    buffer.writeUInt32LE(entry.dataOffset, offset + 12); // Image data offset
  }

  // Image data
  for (let i = 0; i < numImages; i++) {
    images[i].data.copy(buffer, dirEntries[i].dataOffset);
  }

  writeFileSync(outputPath, buffer);
  console.log(`  ✓ ${outputPath} (${sizes.join(', ')})`);
}

async function generateIcns(outputPath) {
  if (process.platform !== 'darwin') {
    console.log(`  ⊘ Skipping .icns (iconutil requires macOS)`);
    return;
  }
  const iconsetDir = join(dirname(outputPath), 'icon.iconset');
  mkdirSync(iconsetDir, { recursive: true });

  // macOS iconset sizes
  const iconsetSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const { name, size } of iconsetSizes) {
    const radius = Math.round(size * APPLE_CORNER_RADIUS_RATIO);
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
      </svg>`
    );

    const base = await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 43, g: 45, b: 49, alpha: 1 } })
      .png()
      .toBuffer();

    await sharp(base)
      .composite([{ input: await sharp(mask).resize(size, size).png().toBuffer(), blend: 'dest-in' }])
      .png()
      .toFile(join(iconsetDir, name));
  }

  execSync(`iconutil -c icns "${iconsetDir}" -o "${outputPath}"`);
  rmSync(iconsetDir, { recursive: true });
  console.log(`  ✓ ${outputPath} (icns, rounded)`);
}

async function generateAndroidIcons() {
  if (!existsSync(join(ROOT, 'android'))) {
    console.log('\nAndroid directory not found, skipping Android icons.');
    return;
  }

  console.log('\nAndroid icons (client/android/...):');

  // Density → px mappings
  const densities = [
    { name: 'mdpi',    launcher: 48,  foreground: 108 },
    { name: 'hdpi',    launcher: 72,  foreground: 162 },
    { name: 'xhdpi',   launcher: 96,  foreground: 216 },
    { name: 'xxhdpi',  launcher: 144, foreground: 324 },
    { name: 'xxxhdpi', launcher: 192, foreground: 432 },
  ];

  for (const { name, launcher, foreground } of densities) {
    const dir = join(ANDROID_RES_DIR, `mipmap-${name}`);
    mkdirSync(dir, { recursive: true });

    // Standard launcher icons (dark background)
    await sharp(svgBuffer)
      .resize(launcher, launcher, { fit: 'contain', background: { r: 43, g: 45, b: 49, alpha: 1 } })
      .png()
      .toFile(join(dir, 'ic_launcher.png'));

    await sharp(svgBuffer)
      .resize(launcher, launcher, { fit: 'contain', background: { r: 43, g: 45, b: 49, alpha: 1 } })
      .png()
      .toFile(join(dir, 'ic_launcher_round.png'));

    // Foreground layer (transparent background, hexagon centered in safe zone)
    await sharp(foregroundSvg)
      .resize(foreground, foreground, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(dir, 'ic_launcher_foreground.png'));

    console.log(`  ✓ mipmap-${name}/ (${launcher}px launcher, ${foreground}px foreground)`);
  }

  // Adaptive icon XML (Android 8.0+)
  const anydpiDir = join(ANDROID_RES_DIR, 'mipmap-anydpi-v26');
  mkdirSync(anydpiDir, { recursive: true });

  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  writeFileSync(join(anydpiDir, 'ic_launcher.xml'), adaptiveXml);
  writeFileSync(join(anydpiDir, 'ic_launcher_round.xml'), adaptiveXml);
  console.log('  ✓ mipmap-anydpi-v26/ (adaptive icon XMLs)');

  // Background color resource
  const valuesDir = join(ANDROID_RES_DIR, 'values');
  mkdirSync(valuesDir, { recursive: true });

  writeFileSync(join(valuesDir, 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#2b2d31</color>
</resources>
`);
  console.log('  ✓ values/ic_launcher_background.xml');

  // Play Store icon (512x512)
  const playstorePath = join(ROOT, 'android', 'app', 'src', 'main', 'playstore-icon.png');
  await generatePng(512, playstorePath);
}

async function main() {
  console.log('Generating Nexus icons from master SVG...\n');

  // --- Web / public icons ---
  console.log('Web icons (client/public/):');
  await generatePng(16, join(PUBLIC_DIR, 'favicon-16x16.png'));
  await generatePng(32, join(PUBLIC_DIR, 'favicon-32x32.png'));
  await generateRoundedPng(180, join(PUBLIC_DIR, 'apple-touch-icon.png'));
  await generatePng(192, join(PUBLIC_DIR, 'logo192.png'));
  await generatePng(512, join(PUBLIC_DIR, 'logo512.png'));
  await generateIco([16, 32, 48], join(PUBLIC_DIR, 'favicon.ico'));

  // --- Tauri icons ---
  console.log('\nTauri icons (client/src-tauri/icons/):');
  await generatePng(32, join(TAURI_ICONS_DIR, '32x32.png'));
  await generatePng(128, join(TAURI_ICONS_DIR, '128x128.png'));
  await generatePng(256, join(TAURI_ICONS_DIR, '128x128@2x.png'));
  await generatePng(512, join(TAURI_ICONS_DIR, 'icon.png'));

  // Windows Store logos
  await generatePng(30, join(TAURI_ICONS_DIR, 'Square30x30Logo.png'));
  await generatePng(44, join(TAURI_ICONS_DIR, 'Square44x44Logo.png'));
  await generatePng(71, join(TAURI_ICONS_DIR, 'Square71x71Logo.png'));
  await generatePng(89, join(TAURI_ICONS_DIR, 'Square89x89Logo.png'));
  await generatePng(107, join(TAURI_ICONS_DIR, 'Square107x107Logo.png'));
  await generatePng(142, join(TAURI_ICONS_DIR, 'Square142x142Logo.png'));
  await generatePng(150, join(TAURI_ICONS_DIR, 'Square150x150Logo.png'));
  await generatePng(284, join(TAURI_ICONS_DIR, 'Square284x284Logo.png'));
  await generatePng(310, join(TAURI_ICONS_DIR, 'Square310x310Logo.png'));
  await generatePng(50, join(TAURI_ICONS_DIR, 'StoreLogo.png'));

  // Windows ICO (multi-size)
  await generateIco([16, 24, 32, 48, 64, 128, 256], join(TAURI_ICONS_DIR, 'icon.ico'));

  // macOS ICNS (with rounded corners)
  await generateIcns(join(TAURI_ICONS_DIR, 'icon.icns'));

  // macOS tray icons (white hexagon on transparent, template images)
  console.log('\nTray icons (client/src-tauri/icons/):');
  await generateTrayPng(22, join(TAURI_ICONS_DIR, 'tray-icon.png'));
  await generateTrayPng(44, join(TAURI_ICONS_DIR, 'tray-icon@2x.png'));

  // --- Android icons ---
  await generateAndroidIcons();

  console.log('\nAll icons generated successfully!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
