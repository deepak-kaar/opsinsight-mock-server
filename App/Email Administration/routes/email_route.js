import express from 'express';
import multer from 'multer';
import email from '../services/email.js';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB limit per file
    }
});

// Post email with optional multiple attachments
router.route('/postEmail').post(upload.array('attachments', 10), email.post_email);

router.route('/getEmail').get(email.get_email);
router.route('/getEmail/:id').get(email.get_email_by_id);

// Update email with optional multiple attachments
router.route('/updateEmail/:id').post(upload.array('attachments', 10), email.update_email);

router.route('/deleteEmail/:id').get(email.delete_email);

// Attachment routes
router.route('/attachment/:fileId').get(email.get_attachment);
router.route('/attachments').get(email.get_all_attachments);
router.route('/verifyChunks/:fileId').get(email.verify_attachment_chunks);

export default router;