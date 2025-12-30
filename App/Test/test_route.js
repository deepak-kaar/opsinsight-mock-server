import express from 'express';
import { connectToMongoDB } from '../../config/connection.js';
import multer from 'multer';
import nodemailer from 'nodemailer';
import {
    uploadImage,
    getImage,
    getImageMetadata,
    deleteImage,
    getAllImages
} from './gridfs_service.js';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

/**
 * @swagger
 * /test/upload:
 *   post:
 *     summary: Upload an image to GridFS
 *     tags: [Test]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const result = await uploadImage(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
        );

        res.status(200).json({
            message: 'Image uploaded successfully',
            data: result
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /test/images:
 *   get:
 *     summary: Get all images metadata
 *     tags: [Test]
 *     responses:
 *       200:
 *         description: List of all images
 *       500:
 *         description: Server error
 */
router.get('/images', async (req, res) => {
    try {
        const images = await getAllImages();
        res.status(200).json({
            message: 'Images retrieved successfully',
            count: images.length,
            data: images
        });
    } catch (error) {
        console.error('Get all images error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /test/image/{fileId}:
 *   get:
 *     summary: Get image by ID
 *     tags: [Test]
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The GridFS file ID
 *     responses:
 *       200:
 *         description: Image file
 *       404:
 *         description: Image not found
 *       500:
 *         description: Server error
 */
router.get('/image/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;

        // Get metadata first to set correct content type
        const metadata = await getImageMetadata(fileId);
        const imageBuffer = await getImage(fileId);

        res.set('Content-Type', metadata.contentType);
        res.set('Content-Disposition', `inline; filename="${metadata.filename}"`);
        res.send(imageBuffer);
    } catch (error) {
        console.error('Get image error:', error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: 'Image not found' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

/**
 * @swagger
 * /test/metadata/{fileId}:
 *   get:
 *     summary: Get image metadata by ID
 *     tags: [Test]
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The GridFS file ID
 *     responses:
 *       200:
 *         description: Image metadata
 *       404:
 *         description: Image not found
 *       500:
 *         description: Server error
 */
router.get('/metadata/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const metadata = await getImageMetadata(fileId);

        res.status(200).json({
            message: 'Metadata retrieved successfully',
            data: metadata
        });
    } catch (error) {
        console.error('Get metadata error:', error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: 'Image not found' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

/**
 * @swagger
 * /test/image/{fileId}:
 *   delete:
 *     summary: Delete image by ID
 *     tags: [Test]
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The GridFS file ID
 *     responses:
 *       200:
 *         description: Image deleted successfully
 *       404:
 *         description: Image not found
 *       500:
 *         description: Server error
 */
router.delete('/image/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const result = await deleteImage(fileId);

        res.status(200).json({
            message: result.message,
            success: result.success
        });
    } catch (error) {
        console.error('Delete image error:', error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: 'Image not found' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

/**
 * @swagger
 * /test/sendEmail:
 *   post:
 *     summary: Send email using Exchange SMTP
 *     tags: [Test]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 description: Recipient email address
 *               subject:
 *                 type: string
 *                 description: Email subject
 *               text:
 *                 type: string
 *                 description: Plain text email body
 *               html:
 *                 type: string
 *                 description: HTML email body
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       500:
 *         description: Server error
 */
router.get('/sendEmail', async (req, res) => {
    try {
        // Create transporter with Exchange SMTP configuration

        const db = await connectToMongoDB();
        const collectionName = process.env.EMAIL_USER_COLLECTION;

        const result = await db.collection(collectionName).findOne({user: 'eaiusrvc@Exchange.Aramco.com.sa'});
        const pass = result.pass;
        
        let transporter = nodemailer.createTransport({
            host: 'exchange.aramco.com.sa',
            port: 25,
            secure: false,
            secureProtocol: 'TLSv1_2_method',
            pool: true,
            requireTLS: false,
            auth: {
                user: 'eaiusrvc@Exchange.Aramco.com.sa',
                pass: pass
            },
            tls: {
                // servername: 'exchange.aramco.com.sa',
                rejectUnauthorized: false,
                ignoreTLS: true,
                logger: true,
                debug: true
            }
        });

        // Get email options from request body or use defaults
        const {
            to = 'santhoshkumar.santhanakrishnan@aramco.com',
            subject = 'Test Email from Node.js',
            text = 'Hello, this is a test email sent using Nodemailer and Exchange SMTP!',
            html = '<b>Hello,</b><br>This is a test email sent using Nodemailer and Exchange SMTP.'
        } = req.body;

        let mailOptions = {
            from: 'eaiusrvc@Exchange.Aramco.com.sa',
            to: to,
            subject: subject,
            text: text,
            html: html
        };

        let info = await transporter.sendMail(mailOptions);
        
        res.status(200).json({
            message: 'Email sent successfully',
            response: info.response,
            messageId: info.messageId
        });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({
            error: 'Error sending email',
            details: error.message
        });
    }
});

export default router;
