const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
};
const hasCloudinaryConfig = Object.values(cloudinaryConfig).every(Boolean);
const persistentStorageError = 'Media uploads are unavailable until Cloudinary is configured.';

let storage;
if (hasCloudinaryConfig) {
  cloudinary.config(cloudinaryConfig);
  storage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => ({
      folder: 'indus-hostel-maintenance',
      resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
      allowed_formats: file.mimetype.startsWith('video/')
        ? ['mp4', 'mov', 'webm']
        : ['jpg', 'jpeg', 'png', 'webp']
    })
  });
} else {
  const uploadDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
}

const fileFilter = (req, file, cb) => {
  if (process.env.NODE_ENV === 'production' && !hasCloudinaryConfig) {
    return cb(new Error(persistentStorageError), false);
  }

  const isImage = file.mimetype.startsWith('image/');
  const isSupportedVideo = ['video', 'progressVideo', 'completionVideo'].includes(file.fieldname) &&
    ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.mimetype);

  if (isImage || isSupportedVideo) {
    cb(null, true);
  } else {
    cb(new Error('Upload an image or an MP4, WebM, or MOV video.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 20 * 1024 * 1024, files: 2 }
});

const requestMediaUpload = (req, res, next) => {
  handleMediaUpload([
    { name: 'photo', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ])(req, res, next);
};

const completionMediaUpload = (req, res, next) => {
  handleMediaUpload([
    { name: 'photo', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'completionPhoto', maxCount: 1 },
    { name: 'progressPhoto', maxCount: 1 },
    { name: 'progressVideo', maxCount: 1 },
    { name: 'completionVideo', maxCount: 1 }
  ])(req, res, next);
};

const handleMediaUpload = (fields) => (req, res, next) => {
  upload.fields(fields)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const error = err.code === 'LIMIT_FILE_SIZE'
        ? 'Each attachment must be 20 MB or smaller.'
        : err.message;
      return res.status(400).json({ success: false, error });
    }

    if (err.message === persistentStorageError) {
      return res.status(503).json({ success: false, error: err.message });
    }

    if (err.message === 'Upload an image or an MP4, WebM, or MOV video.') {
      return res.status(400).json({ success: false, error: err.message });
    }

    console.error('Media storage failed during upload:', {
      name: err.name,
      message: err.message,
      http_code: err.http_code
    });
    const authenticationFailed = err.http_code === 401 || err.http_code === 403;
    return res.status(502).json({
      success: false,
      error: authenticationFailed
        ? 'Media storage authentication failed. Check the Cloudinary credentials configured on the backend.'
        : 'Media storage could not save this file. Check the Cloudinary configuration on the backend and retry.'
    });
  });
};

module.exports = { requestMediaUpload, completionMediaUpload };