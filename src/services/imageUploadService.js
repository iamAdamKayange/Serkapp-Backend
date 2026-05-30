const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = (buffer, originalName) => {
  return new Promise((resolve, reject) => {
    const isVideo = originalName.match(/\.(mp4|mov|avi|webm|3gp)$/i) !== null;
    const resourceType = isVideo ? 'video' : 'image';
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'serkapp_media', resource_type: resourceType },
      (error, result) => {
        if (error) reject(error);
        else resolve({ url: result.secure_url, resourceType, thumbnailUrl: null });
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

module.exports = { uploadToCloudinary, uploadMultiple };