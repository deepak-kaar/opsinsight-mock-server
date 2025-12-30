import { GridFSBucket } from 'mongodb';
import { connectToMongoDB } from '../../../config/connection.js';
import { Readable } from 'stream';

async function getGridFSBucket() {
    const db = await connectToMongoDB();
    return new GridFSBucket(db, {
        bucketName: 'report_images',
        chunkSizeBytes: 261120 // 255KB chunks
    });
}

export async function uploadReportImage(fileBuffer, filename, contentType, metadata = {}) {
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
        throw new Error(`Error uploading report image: ${error.message}`);
    }
}

export async function getReportImage(fileId) {
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
        throw new Error(`Error retrieving report image: ${error.message}`);
    }
}

export async function getReportImageMetadata(fileId) {
    try {
        const db = await connectToMongoDB();
        const { ObjectId } = await import('mongodb');

        const filesCollection = db.collection('report_images.files');
        const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });

        if (!file) {
            throw new Error('Report image not found');
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
        throw new Error(`Error retrieving report image metadata: ${error.message}`);
    }
}

export async function deleteReportImage(fileId) {
    try {
        const bucket = await getGridFSBucket();
        const { ObjectId } = await import('mongodb');

        await bucket.delete(new ObjectId(fileId));
        return { success: true, message: 'Report image deleted successfully' };
    } catch (error) {
        throw new Error(`Error deleting report image: ${error.message}`);
    }
}

export async function deleteMultipleReportImages(fileIds) {
    try {
        const results = [];
        for (const fileId of fileIds) {
            try {
                const result = await deleteReportImage(fileId);
                results.push({ fileId, ...result });
            } catch (error) {
                results.push({ fileId, success: false, message: error.message });
            }
        }
        return results;
    } catch (error) {
        throw new Error(`Error deleting report images: ${error.message}`);
    }
}

export async function getAllReportImages() {
    try {
        const db = await connectToMongoDB();
        const filesCollection = db.collection('report_images.files');

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
        throw new Error(`Error retrieving report images: ${error.message}`);
    }
}

// Helper function to verify chunks are stored
export async function verifyReportImageChunks(fileId) {
    try {
        const db = await connectToMongoDB();
        const { ObjectId } = await import('mongodb');

        const filesCollection = db.collection('report_images.files');
        const chunksCollection = db.collection('report_images.chunks');

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
