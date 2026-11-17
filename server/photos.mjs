import sharp from 'sharp';

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_POST_BYTES = 71 * 1024 * 1024;
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
let processing = 0;

// Decode on the server, then re-encode without EXIF/XMP/IPTC rather than trusting a file extension.
export async function normalizePhotos(photos) {
  if (!Array.isArray(photos) || photos.length > MAX_PHOTOS) invalid('사진은 최대 5장까지 등록할 수 있습니다.');
  if (processing >= 2) throw Object.assign(new Error('사진을 처리 중입니다. 잠시 후 다시 시도해주세요.'), { status: 429 });
  processing++;
  try {
    const normalized = [];
    for (const photo of photos) {
      const value = photo?.data;
      if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 || (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))) invalid('사진 파일을 확인해주세요. 장당 최대 10MB입니다.');
      const buffer = Buffer.from(value, 'base64');
      if (buffer.length > MAX_PHOTO_BYTES) invalid('사진은 장당 10MB 이하로 선택해주세요.');
      try {
        const image = sharp(buffer, { limitInputPixels: 40000000, failOn: 'warning' });
        const metadata = await image.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) invalid('움직이지 않는 JPG·PNG·WebP 사진만 등록할 수 있습니다.');
        const { data, info } = await image.rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
        normalized.push({ data, width: info.width, height: info.height });
      } catch (err) { if (err.status) throw err; invalid('읽을 수 없는 사진입니다. 다른 JPG·PNG·WebP 파일을 선택해주세요.'); }
    }
    return normalized;
  } finally { processing--; }
}
