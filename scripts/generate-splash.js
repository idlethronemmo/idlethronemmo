import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sizes = [
  { width: 1290, height: 2796, name: 'iphone-14-pro-max' },
  { width: 1179, height: 2556, name: 'iphone-14-pro' },
  { width: 1284, height: 2778, name: 'iphone-13-pro-max' },
  { width: 1170, height: 2532, name: 'iphone-13' },
  { width: 1125, height: 2436, name: 'iphone-x' },
  { width: 1242, height: 2688, name: 'iphone-xs-max' },
  { width: 828, height: 1792, name: 'iphone-xr' },
  { width: 1080, height: 2340, name: 'iphone-12-mini' },
  { width: 750, height: 1334, name: 'iphone-8' },
  { width: 1242, height: 2208, name: 'iphone-8-plus' },
  { width: 640, height: 1136, name: 'iphone-se' },
];

const bgColor = { r: 26, g: 29, b: 46 };
const outputDir = 'client/public/splash';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const logoPath = 'client/public/logo.png';
const logoBuffer = fs.readFileSync(logoPath);

async function generateSplash() {
  const logoMeta = await sharp(logoBuffer).metadata();
  
  for (const size of sizes) {
    const logoSize = Math.min(size.width, size.height) * 0.25;
    const resizedLogo = await sharp(logoBuffer)
      .resize(Math.round(logoSize), Math.round(logoSize), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    
    const logoMeta = await sharp(resizedLogo).metadata();
    const left = Math.round((size.width - logoMeta.width) / 2);
    const top = Math.round((size.height - logoMeta.height) / 2);
    
    await sharp({
      create: {
        width: size.width,
        height: size.height,
        channels: 3,
        background: bgColor,
      }
    })
    .composite([{ input: resizedLogo, left, top }])
    .png()
    .toFile(path.join(outputDir, `${size.name}.png`));
    
    console.log(`Generated ${size.name}.png (${size.width}x${size.height})`);
  }
  
  console.log('All splash screens generated!');
}

generateSplash().catch(console.error);
