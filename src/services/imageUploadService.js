const cloudinary = require('cloudinary').v2;

// config...
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  try {
    // URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/filename.jpg
    const parts = url.split('/');
    const uploadIndex = parts.findIndex(part => part === 'upload');
    if (uploadIndex === -1) return null;
    // Get everything after 'upload' (skip version part v123...)
    const publicIdWithExt = parts.slice(uploadIndex + 2).join('/');
    // Remove file extension
    const lastDot = publicIdWithExt.lastIndexOf('.');
    return lastDot !== -1 ? publicIdWithExt.substring(0, lastDot) : publicIdWithExt;
  } catch (err) {
    console.error('Error extracting public ID:', err);
    return null;
  }
};

// Delete file from Cloudinary
const deleteFromCloudinary = async (url, resourceType = 'image') => {
  try {
    const publicId = getPublicIdFromUrl(url);
    if (!publicId) {
      console.error('Could not extract public ID from URL:', url);
      return false;
    }
    console.log(`🗑️ Deleting from Cloudinary: ${publicId} (${resourceType})`);
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    console.log('Cloudinary delete result:', result);
    return result.result === 'ok';
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    return false;
  }
};

// Upload to Cloudinary - also return public_id
const uploadToCloudinary = (buffer, originalName) => {
  return new Promise((resolve, reject) => {
    const isVideo = originalName.match(/\.(mp4|mov|avi|webm|3gp)$/i) !== null;
    const resourceType = isVideo ? 'video' : 'image';

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'serkapp_media',
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType,
        });
      }
    );
    uploadStream.end(buffer);
  });
};

const uploadMultiple = async (files) => {
  const results = [];
  for (const file of files) {
    const result = await uploadToCloudinary(file.buffer, file.originalname);
    results.push(result);
  }
  return results;
};

module.exports = { uploadToCloudinary, uploadMultiple, deleteFromCloudinary };