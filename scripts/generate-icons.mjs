/**
 * Icon generation script for PWA
 * Run with: node scripts/generate-icons.mjs
 *
 * Requires: npm install sharp (run once)
 */

import { createRequire } from 'module'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// Check if sharp is available
let sharp
try {
  const require = createRequire(import.meta.url)
  sharp = require('sharp')
} catch {
  console.log('📦 sharp not found. Installing...')
  console.log('Run: npm install sharp --save-dev')
  console.log('Then run this script again: node scripts/generate-icons.mjs')
  process.exit(1)
}

const svgPath = join(rootDir, 'public', 'icon.svg')

if (!existsSync(svgPath)) {
  console.error('❌ public/icon.svg not found!')
  process.exit(1)
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

console.log('🎨 Generating PWA icons from public/icon.svg...\n')

for (const size of sizes) {
  const outputPath = join(rootDir, 'public', `icon-${size}.png`)
  await sharp(svgPath)
    .resize(size, size)
    .png()
    .toFile(outputPath)
  console.log(`✅ Generated icon-${size}.png`)
}

// Also generate apple-icon.png (180x180)
const appleIconPath = join(rootDir, 'public', 'apple-icon.png')
await sharp(svgPath)
  .resize(180, 180)
  .png()
  .toFile(appleIconPath)
console.log('✅ Generated apple-icon.png (180x180)')

// Generate favicon
const faviconPath = join(rootDir, 'public', 'favicon.ico')
await sharp(svgPath)
  .resize(32, 32)
  .png()
  .toFile(join(rootDir, 'public', 'favicon-32.png'))
console.log('✅ Generated favicon-32.png')

console.log('\n🎉 All icons generated successfully!')
console.log('📱 Your PWA is ready to be installed on iOS!')
