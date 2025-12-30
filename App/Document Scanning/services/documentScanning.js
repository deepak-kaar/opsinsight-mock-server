import { connectToMongoDB, documentsBucket } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
import { Readable } from 'stream';
dotenv.config();


const postDocument = async (req, res) => {
    try {
        await connectToMongoDB();

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const buffer = req.file.buffer;
        const filename = req.file.originalname || `document-${Date.now()}.pdf`;
        const readable = Readable.from(buffer);

        const uploadStream = documentsBucket.openUploadStream(filename, {
            contentType: req.file.mimetype || 'application/pdf',
            metadata: { type: 'document', uploadedAt: new Date() }
        });

        readable.pipe(uploadStream);

        uploadStream.on('finish', () => {
            res.json({
                success: true,
                message: 'Document uploaded successfully',
                fileId: uploadStream.id,
                filename
            });
        });

        uploadStream.on('error', (err) => {
            res.status(500).json({ error: 'Failed to save document' });
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


/**
 * GET /api/documents
 * List all uploaded documents
 */
const getDocuments = async (req, res) => {
    try {
        await connectToMongoDB();
        const files = await documentsBucket.find({}).toArray();
        res.json({ success: true, documents: files });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

/**
* GET /api/document/:id
* Stream a single document by ObjectId
*/
const getDocumentById = async (req, res) => {
    try {
        await connectToMongoDB();
        const fileId = new ObjectId(req.params.id);
        const files = await documentsBucket.find({ _id: fileId }).toArray();
        if (!files.length) return res.status(404).json({ error: 'Document not found' });

        const file = files[0];
        res.set('Content-Type', file.contentType || 'application/pdf');

        const downloadStream = documentsBucket.openDownloadStream(fileId);
        downloadStream.pipe(res);

        downloadStream.on('error', (err) => {
            console.error('Stream error:', err);
            res.status(500).json({ error: 'Error streaming document' });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};



export default {
    postDocument,
    getDocuments,
    getDocumentById
}