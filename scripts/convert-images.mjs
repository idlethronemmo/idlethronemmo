import sharp from 'sharp';
import { readdir, stat, unlink } from 'fs/promises';
import { join, extname, basename } from 'path';

const ASSETS_DIR = './attached_assets';
const TARGET_SIZE = 128;

async function getAllImages(dir) {
  const images = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      images.push(...await getAllImages(fullPath));
    } else {
      const ext = extname(entry.name).toLowerCase();
      if (['.png', '.jpg', '.jpeg'].includes(ext)) {
        images.push(fullPath);
      }
    }
  }
  return images;
}

async function convertImage(inputPath) {
  const ext = extname(inputPath).toLowerCase();
  const baseName = basename(inputPath, ext);
  const dir = inputPath.substring(0, inputPath.lastIndexOf('/'));
  const outputPath = join(dir, `${baseName}.webp`);
  
  try {
    await sharp(inputPath)
      .resize(TARGET_SIZE, TARGET_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 85 })
      .toFile(outputPath);
    
    // Delete original file after successful conversion
    if (outputPath !== inputPath) {
      await unlink(inputPath);
    }
    
    return { success: true, input: inputPath, output: outputPath };
  } catch (error) {
    return { success: false, input: inputPath, error: error.message };
  }
}

async function main() {
  console.log('Finding images...');
  const images = await getAllImages(ASSETS_DIR);
  console.log(`Found ${images.length} images to convert`);
  
  let converted = 0;
  let failed = 0;
  
  // Process in batches of 20 for better performance
  const batchSize = 20;
  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(convertImage));
    
    for (const result of results) {
      if (result.success) {
        converted++;
      } else {
        failed++;
        console.error(`Failed: ${result.input} - ${result.error}`);
      }
    }
    
    console.log(`Progress: ${Math.min(i + batchSize, images.length)}/${images.length}`);
  }
  
  console.log(`\nDone! Converted: ${converted}, Failed: ${failed}`);
}

main().catch(console.error);
