import express from 'express';
import multer from 'multer';
import reportImage from '../services/report_image.js';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB limit per file
    },
    fileFilter: (_req, file, cb) => {
        // Accept images only
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// POST - Create report image with optional file upload
router.post('/reportImage', upload.single('fileName'), reportImage.post_reportImage);

// GET - Retrieve all report images with optional filters (appId, orgId)
router.get('/reportImage', reportImage.get_reportImage);

// GET - Retrieve single report image by ID
router.get('/reportImage/:id', reportImage.get_reportImage_by_id);

// PUT - Update report image with optional file upload/removal
router.put('/reportImage/:id', upload.single('fileName'), reportImage.update_reportImage);

// DELETE - Delete report image and associated file
router.delete('/reportImage/:id', reportImage.delete_reportImage);

// File routes
router.get('/file/:fileId', reportImage.get_file);
router.get('/files', reportImage.get_all_files);
router.get('/verifyChunks/:fileId', reportImage.verify_file_chunks);

// GET - Retrieve single report image by name
router.get('/file/by-name/:filename', reportImage.get_file_by_filename);


export default router;