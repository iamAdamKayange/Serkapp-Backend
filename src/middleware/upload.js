const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedImageMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedVideoMimes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/3gpp'];
  
  // Check file extension as additional security layer
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedImageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const allowedVideoExts = ['.mp4', '.mpeg', '.mov', '.avi', '.webm', '.3gp'];
  
  const isAllowedMime = allowedImageMimes.includes(file.mimetype) || allowedVideoMimes.includes(file.mimetype);
  const isAllowedExt = allowedImageExts.includes(ext) || allowedVideoExts.includes(ext);
  
  if (isAllowedMime && isAllowedExt) {
    cb(null, true);
  } else {
    cb(new Error('Aina ya faili haikubaliki. Tafadhali pakia picha au video pekee.'), false);
  }
};

const upload = multer({
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 20 // Maximum number of files
  },
  fileFilter,
});

module.exports = { upload };