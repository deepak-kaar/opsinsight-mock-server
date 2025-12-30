import express from "express";
import multer from 'multer';
import controller from "../services/documentScanning.js";

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage
});

// POST - Create report image with optional file upload
router.post('/upload/document', upload.single('file'), controller.postDocument);

// GET - Retrieve all documents
router.get("/documents", controller.getDocuments);

// GET - Retrieve single document by ID
router.get('/document/:id', controller.getDocumentById);

export default router;