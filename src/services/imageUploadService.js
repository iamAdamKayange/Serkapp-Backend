const cloudinary = require('cloudinary').v2;

// =======================
// CLOUDINARY CONFIG
// =======================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('☁️ CLOUDINARY CONFIG CHECK:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key_exists: !!process.env.CLOUDINARY_API_KEY,
  api_secret_exists: !!process.env.CLOUDINARY_API_SECRET,
});

// =======================
// UPLOAD SINGLE FILE
// =======================
const uploadToCloudinary = (buffer, originalName) => {
  return new Promise((resolve, reject) => {
    const isVideo =
      originalName.match(/\.(mp4|mov|avi|webm|3gp)$/i) !== null;

    const resourceType = isVideo ? 'video' : 'image';

    console.log('📤 Upload request received:', {
      fileName: originalName,
      bufferSize: buffer?.length,
    });

    console.log(`📤 Uploading ${originalName} as ${resourceType}...`);

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'serkapp_media',
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          console.error('🔥 CLOUDINARY ERROR:', error);
          return reject(error);
        }

        console.log('✅ CLOUDINARY SUCCESS:', result.secure_url);

        resolve({
          url: result.secure_url,
          resourceType,
          thumbnailUrl: null,
        });
      }
    );

    uploadStream.end(buffer);
  });
};

// =======================
// UPLOAD MULTIPLE FILES
// =======================
const uploadMultiple = async (files) => {
  const results = [];

  for (const file of files) {
    console.log('📂 Processing file:', file.originalname);

    const result = await uploadToCloudinary(
      file.buffer,
      file.originalname
    );

    results.push(result);
  }

  return results;
};

module.exports = { uploadToCloudinary, uploadMultiple };