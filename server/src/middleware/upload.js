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

const requirePersistentPhotoStorage = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !hasCloudinaryConfig) {
    return res.status(503).json({
      success: false,
      error: 'Photo uploads are unavailable until Cloudinary is configured.'
    });
  }

  next();
};

let storage;
if (hasCloudinaryConfig) {
  cloudinary.config(cloudinaryConfig);
  storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'indus-hostel-maintenance',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
    }
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

// Filter to allow only image uploads
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // Limit image size to 5MB
});

module.exports = { upload, requirePersistentPhotoStorage };