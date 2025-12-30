import { GridFSBucket } from 'mongodb';
import { connectToMongoDB } from '../../config/connection.js';

let bucket = null;

async function getGridFSBucket() {
    if (!bucket) {
        const db = await connectToMongoDB();
        bucket = new GridFSBucket(db, {
            bucketName: 'images'
        });
    }
    return bucket;
}

export async function uploadImage(fileBuffer, filename, contentType) {
    try {
        const bucket = await getGridFSBucket();

        return new Promise((resolve, reject) => {
            const uploadStream = bucket.openUploadStream(filename, {
                contentType: contentType,
                metadata: {
                    uploadDate: new Date()
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

            uploadStream.end(fileBuffer);
        });
    } catch (error) {
        throw new Error(`Error uploading image: ${error.message}`);
    }
}

export async function getImage(fileId) {
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
        throw new Error(`Error retrieving image: ${error.message}`);
    }
}

export async function getImageMetadata(fileId) {
    try {
        const db = await connectToMongoDB();
        const { ObjectId } = await import('mongodb');

        const filesCollection = db.collection('images.files');
        const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });

        if (!file) {
            throw new Error('Image not found');
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
        throw new Error(`Error retrieving image metadata: ${error.message}`);
    }
}

export async function deleteImage(fileId) {
    try {
        const bucket = await getGridFSBucket();
        const { ObjectId } = await import('mongodb');

        await bucket.delete(new ObjectId(fileId));
        return { success: true, message: 'Image deleted successfully' };
    } catch (error) {
        throw new Error(`Error deleting image: ${error.message}`);
    }
}

export async function getAllImages() {
    try {
        const db = await connectToMongoDB();
        const filesCollection = db.collection('images.files');

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
        throw new Error(`Error retrieving images: ${error.message}`);
    }
}
