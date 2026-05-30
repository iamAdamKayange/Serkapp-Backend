// src/services/imageUploadService.js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Hupakia faili (picha au video) kwenye Cloudinary.
 * @param {Buffer} fileBuffer - Bafa ya faili.
 * @param {string} originalName - Jina asili la faili.
 * @param {string} folder - (hiari) Folda ya Cloudinary. Default ni 'serkapp_media'.
 * @returns {Promise<{url: string, resourceType: string, thumbnailUrl: string | null}>}
 */
const uploadToCloudinary = async (fileBuffer, originalName, folder = 'serkapp_media') => {
    return new Promise((resolve, reject) => {
        // Amua ni aina gani ya faili
        const isVideo = fileBuffer && (originalName.match(/\.(mp4|mov|avi|webm|3gp)$/i) !== null);
        const resourceType = isVideo ? 'video' : 'image';

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: resourceType,
                // Kwa video, unaweza kuongeza mipangilio kama vile kuweka picha ya utangulizi
                eager_async: isVideo, // Usisubiri ubadilishaji wa video ukamilike
                eager: isVideo ? [
                    { format: 'jpg', transformation: { width: 300, height: 200, crop: 'fill' } } // Tengeneza thumbnail kiotomatiki
                ] : [],
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    let thumbnailUrl = null;
                    if (isVideo && result.eager && result.eager.length > 0) {
                        thumbnailUrl = result.eager[0].secure_url;
                    }
                    resolve({
                        url: result.secure_url,
                        resourceType: resourceType,
                        thumbnailUrl: thumbnailUrl,
                    });
                }
            }
        );
        uploadStream.end(fileBuffer);
    });
};

/**
 * Hupakia faili nyingi (picha na/au video) kwenye Cloudinary.
 * @param {Array} files - Safu ya vitu vya faili (kutoka multer).
 * @returns {Promise<Array<{url: string, resourceType: string, thumbnailUrl: string | null}>>}
 */
const uploadMultiple = async (files) => {
    const results = [];
    for (const file of files) {
        const result = await uploadToCloudinary(file.buffer, file.originalname);
        results.push(result);
    }
    return results;
};

module.exports = { uploadToCloudinary, uploadMultiple };