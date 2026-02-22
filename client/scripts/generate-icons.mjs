#!/usr/bin/env node
/**
 * Generate all application icons from the master SVG.
 * Requires: sharp (npm install sharp)
 * macOS: uses iconutil for .icns generation
 */

import sharp from 'sharp';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Master SVG
const SVG_PATH = join(__dirname, 'icon-master.svg');
const svgBuffer = readFileSync(SVG_PATH);

// Output directories
const PUBLIC_DIR = join(ROOT, 'public');
const TAURI_ICONS_DIR = join(ROOT, 'src-tauri', 'icons');

async function generatePng(size, outputPath) {
  await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 43, g: 45, b: 49, alpha: 1 } })
    .png()
    .toFile(outputPath);
  console.log(`  ✓ ${outputPath} (${size}x${size})`);
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
    await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 43, g: 45, b: 49, alpha: 1 } })
      .png()
      .toFile(join(iconsetDir, name));
  }

  execSync(`iconutil -c icns "${iconsetDir}" -o "${outputPath}"`);
  rmSync(iconsetDir, { recursive: true });
  console.log(`  ✓ ${outputPath} (icns)`);
}

async function main() {
  console.log('Generating Nexus icons from master SVG...\n');

  // --- Web / public icons ---
  console.log('Web icons (client/public/):');
  await generatePng(16, join(PUBLIC_DIR, 'favicon-16x16.png'));
  await generatePng(32, join(PUBLIC_DIR, 'favicon-32x32.png'));
  await generatePng(180, join(PUBLIC_DIR, 'apple-touch-icon.png'));
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

  // macOS ICNS
  await generateIcns(join(TAURI_ICONS_DIR, 'icon.icns'));

  console.log('\nAll icons generated successfully!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
