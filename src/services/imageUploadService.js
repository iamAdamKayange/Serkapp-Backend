const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const requiredEnv = [
  'SPACES_KEY',
  'SPACES_SECRET',
  'SPACES_ENDPOINT',
  'SPACES_REGION',
  'SPACES_BUCKET',
  'SPACES_CDN',
];

const getMissingEnv = () => requiredEnv.filter((key) => !process.env[key]);

const spacesClient = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY || '',
    secretAccessKey: process.env.SPACES_SECRET || '',
  },
});

const normalizeCdnBase = () => (process.env.SPACES_CDN || '').replace(/\/+$/, '');

const sanitizeFilename = (filename) => {
  const extension = path.extname(filename || '').toLowerCase();
  const baseName = path
    .basename(filename || 'file', extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `${baseName || 'media'}-${crypto.randomUUID()}${extension}`;
};

const getFolderForMime = (mimeType = '') => (mimeType.startsWith('video/') ? 'videos' : 'images');

const getKeyFromUrl = (url) => {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    const cdnBase = normalizeCdnBase();
    const endpoint = process.env.SPACES_ENDPOINT || '';
    const bucket = process.env.SPACES_BUCKET || '';

    if (cdnBase && url.startsWith(`${cdnBase}/`)) {
      return decodeURIComponent(url.slice(cdnBase.length + 1));
    }

    if (endpoint && url.startsWith(endpoint)) {
      const pathParts = parsedUrl.pathname.replace(/^\/+/, '').split('/');
      if (pathParts[0] === bucket) pathParts.shift();
      return decodeURIComponent(pathParts.join('/'));
    }

    return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  } catch (error) {
    console.error('Invalid Spaces URL:', error.message);
    return null;
  }
};

const uploadToSpaces = async (buffer, originalName, mimeType) => {
  const missingEnv = getMissingEnv();
  if (missingEnv.length > 0) {
    throw new Error(`DigitalOcean Spaces is missing environment values: ${missingEnv.join(', ')}`);
  }

  const resourceType = mimeType?.startsWith('video/') ? 'video' : 'image';
  const key = `serkapp_media/${getFolderForMime(mimeType)}/${sanitizeFilename(originalName)}`;

  await spacesClient.send(
    new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      Body: buffer,
      ACL: 'public-read',
      ContentType: mimeType || 'application/octet-stream',
    })
  );

  return {
    url: `${normalizeCdnBase()}/${encodeURI(key)}`,
    key,
    resourceType,
  };
};

const deleteFromSpaces = async (url) => {
  const key = getKeyFromUrl(url);
  if (!key) return false;

  try {
    await spacesClient.send(
      new DeleteObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    console.error(`Failed to delete Spaces object ${key}:`, error.message);
    return false;
  }
};

const uploadMultiple = async (files) => {
  const results = [];
  for (const file of files) {
    const result = await uploadToSpaces(file.buffer, file.originalname, file.mimetype);
    results.push(result);
  }
  return results;
};

module.exports = { uploadToSpaces, uploadMultiple, deleteFromSpaces };