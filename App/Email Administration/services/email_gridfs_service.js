import { GridFSBucket } from 'mongodb';
import { connectToMongoDB } from '../../../config/connection.js';
import { Readable } from 'stream';

async function getGridFSBucket() {
    const db = await connectToMongoDB();
    return new GridFSBucket(db, {
        bucketName: 'email_attachments',
        chunkSizeBytes: 261120 // 255KB chunks
    });
}

export async function uploadAttachment(fileBuffer, filename, contentType, metadata = {}) {
    try {
        const bucket = await getGridFSBucket();

        return new Promise((resolve, reject) => {
            // Create a readable stream from buffer
            const readableStream = Readable.from(fileBuffer);

            const uploadStream = bucket.openUploadStream(filename, {
                contentType: contentType,
                metadata: {
                    uploadDate: new Date(),
                    ...metadata
                }
            });

            uploadStream.on('error', (error) => {
                reject(error);
            });

            uploadStream.on('finish', () => {
                resolve({
                    fileId: uploadStream.id,
                    filename: filename,
                    contentType: contentType,
                    size: fileBuffer.length
                });
            });

            // Pipe the readable stream to upload stream
            readableStream.pipe(uploadStream);
        });
    } catch (error) {
        throw new Error(`Error uploading attachment: ${error.message}`);
    }
}

export async function getAttachment(fileId) {
    try {
        const bucket = await getGridFSBucket();
        const { ObjectId } = await import('mongodb');

        return new Promise((resolve, reject) => {
            const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
            const chunks = [];

            downloadStream.on('data', (chunk) => {
                chunks.push(chunk);
            });

            downloadStream.on('error', (error) => {
                reject(error);
            });

            downloadStream.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
        });
    } catch (error) {
        throw new Error(`Error retrieving attachment: ${error.message}`);
    }
}

export async function getAttachmentMetadata(fileId) {
    try {
        const db = await connectToMongoDB();
        const { ObjectId } = await import('mongodb');

        const filesCollection = db.collection('email_attachments.files');
        const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });

        if (!file) {
            throw new Error('Attachment not found');
        }

        return {
            fileId: file._id,
            filename: file.filename,
            contentType: file.contentType,
            size: file.length,
            uploadDate: file.uploadDate,
            metadata: file.metadata
        };
    } catch (error) {
        throw new Error(`Error retrieving attachment metadata: ${error.message}`);
    }
}

export async function deleteAttachment(fileId) {
    try {
        const bucket = await getGridFSBucket();
        const { ObjectId } = await import('mongodb');

        await bucket.delete(new ObjectId(fileId));
        return { success: true, message: 'Attachment deleted successfully' };
    } catch (error) {
        throw new Error(`Error deleting attachment: ${error.message}`);
    }
}

export async function deleteMultipleAttachments(fileIds) {
    try {
        const results = [];
        for (const fileId of fileIds) {
            try {
                const result = await deleteAttachment(fileId);
                results.push({ fileId, ...result });
            } catch (error) {
                results.push({ fileId, success: false, message: error.message });
            }
        }
        return results;
    } catch (error) {
        throw new Error(`Error deleting attachments: ${error.message}`);
    }
}

export async function getAllAttachments() {
    try {
        const db = await connectToMongoDB();
        const filesCollection = db.collection('email_attachments.files');

        const files = await filesCollection.find({}).toArray();

        return files.map(file => ({
            fileId: file._id,
            filename: file.filename,
            contentType: file.contentType,
            size: file.length,
            uploadDate: file.uploadDate,
            metadata: file.metadata
        }));
    } catch (error) {
        throw new Error(`Error retrieving attachments: ${error.message}`);
    }
}

// Helper function to verify chunks are stored
export async function verifyAttachmentChunks(fileId) {
    try {
        const db = await connectToMongoDB();
        const { ObjectId } = await import('mongodb');

        const filesCollection = db.collection('email_attachments.files');
        const chunksCollection = db.collection('email_attachments.chunks');

        const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });
        const chunks = await chunksCollection.find({ files_id: new ObjectId(fileId) }).toArray();

        return {
            fileExists: !!file,
            chunkCount: chunks.length,
            expectedChunks: file ? Math.ceil(file.length / (file.chunkSize || 261120)) : 0,
            fileSize: file ? file.length : 0
        };
    } catch (error) {
        throw new Error(`Error verifying chunks: ${error.message}`);
    }
}
