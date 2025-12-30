import { GridFSBucket } from 'mongodb';
import { connectToMongoDB } from '../../../config/connection.js';
import { Readable } from 'stream';

let gridFSBucket = null;

/**
 * Initialize GridFS bucket for video streaming
 */
async function initializeGridFS() {
    if (!gridFSBucket) {
        const db = await connectToMongoDB();
        gridFSBucket = new GridFSBucket(db, {
            bucketName: 'livestreams'
        });
        console.log('GridFS Bucket initialized for live streaming');
    }
    return gridFSBucket;
}

/**
 * Handle incoming live feed from camera and store in GridFS
 * @param {Object} cameraData - Camera metadata (cameraId, location, etc.)
 * @param {Buffer|Stream} videoStream - Video stream data
 * @returns {Promise<Object>} Upload result with file ID
 */
async function uploadLiveFeed(cameraData, videoStream) {
    try {
        const bucket = await initializeGridFS();

        const metadata = {
            cameraId: cameraData.cameraId,
            location: cameraData.location,
            timestamp: new Date(),
            mimeType: cameraData.mimeType || 'video/mp4',
            resolution: cameraData.resolution,
            fps: cameraData.fps
        };

        const filename = `live_feed_${cameraData.cameraId}_${Date.now()}`;

        // Create upload stream
        const uploadStream = bucket.openUploadStream(filename, {
            metadata: metadata,
            contentType: metadata.mimeType
        });

        // Convert buffer to stream if needed
        let readableStream;
        if (Buffer.isBuffer(videoStream)) {
            readableStream = Readable.from(videoStream);
        } else {
            readableStream = videoStream;
        }

        return new Promise((resolve, reject) => {
            readableStream.pipe(uploadStream)
                .on('error', (error) => {
                    console.error('Error uploading live feed:', error);
                    reject(error);
                })
                .on('finish', () => {
                    console.log(`Live feed uploaded successfully: ${filename}`);
                    resolve({
                        fileId: uploadStream.id,
                        filename: filename,
                        metadata: metadata
                    });
                });
        });
    } catch (error) {
        console.error('Error in uploadLiveFeed:', error);
        throw error;
    }
}

/**
 * Stream live feed to UI client
 * @param {String} fileId - GridFS file ID
 * @param {Object} res - Express response object
 */
async function streamLiveFeedToClient(fileId, res) {
    try {
        const bucket = await initializeGridFS();
        const { ObjectId } = await import('mongodb');

        // Get file info
        const files = await bucket.find({ _id: new ObjectId(fileId) }).toArray();

        if (!files || files.length === 0) {
            throw new Error('Live feed not found');
        }

        const file = files[0];

        // Set response headers
        res.set({
            'Content-Type': file.metadata.mimeType || 'video/mp4',
            'Content-Length': file.length,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache'
        });

        // Create download stream and pipe to response
        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));

        downloadStream.on('error', (error) => {
            console.error('Error streaming live feed:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming video' });
            }
        });

        downloadStream.pipe(res);
    } catch (error) {
        console.error('Error in streamLiveFeedToClient:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
}

/**
 * Stream live feed with range support (for seeking/progressive loading)
 * @param {String} fileId - GridFS file ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function streamLiveFeedWithRange(fileId, req, res) {
    try {
        const bucket = await initializeGridFS();
        const { ObjectId } = await import('mongodb');

        // Get file info
        const files = await bucket.find({ _id: new ObjectId(fileId) }).toArray();

        if (!files || files.length === 0) {
            return res.status(404).json({ error: 'Live feed not found' });
        }

        const file = files[0];
        const fileSize = file.length;
        const range = req.headers.range;

        if (range) {
            // Parse range header
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            // Set partial content headers
            res.status(206).set({
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': file.metadata.mimeType || 'video/mp4',
                'Cache-Control': 'no-cache'
            });

            // Create download stream with range
            const downloadStream = bucket.openDownloadStream(new ObjectId(fileId), {
                start: start,
                end: end
            });

            downloadStream.pipe(res);
        } else {
            // No range, stream entire file
            res.set({
                'Content-Length': fileSize,
                'Content-Type': file.metadata.mimeType || 'video/mp4',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache'
            });

            const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
            downloadStream.pipe(res);
        }
    } catch (error) {
        console.error('Error in streamLiveFeedWithRange:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
}

/**
 * Get all live feeds by camera ID
 * @param {String} cameraId - Camera identifier
 * @returns {Promise<Array>} List of live feeds
 */
async function getLiveFeedsByCameraId(cameraId) {
    try {
        const bucket = await initializeGridFS();

        const feeds = await bucket.find({
            'metadata.cameraId': cameraId
        }).sort({ uploadDate: -1 }).toArray();

        return feeds.map(feed => ({
            fileId: feed._id.toString(),
            filename: feed.filename,
            cameraId: feed.metadata.cameraId,
            location: feed.metadata.location,
            timestamp: feed.metadata.timestamp,
            uploadDate: feed.uploadDate,
            size: feed.length,
            mimeType: feed.metadata.mimeType
        }));
    } catch (error) {
        console.error('Error in getLiveFeedsByCameraId:', error);
        throw error;
    }
}

/**
 * Get latest live feed for a camera
 * @param {String} cameraId - Camera identifier
 * @returns {Promise<Object>} Latest feed info
 */
async function getLatestLiveFeed(cameraId) {
    try {
        const bucket = await initializeGridFS();

        const feeds = await bucket.find({
            'metadata.cameraId': cameraId
        }).sort({ uploadDate: -1 }).limit(1).toArray();

        if (feeds.length === 0) {
            return null;
        }

        const feed = feeds[0];
        return {
            fileId: feed._id.toString(),
            filename: feed.filename,
            cameraId: feed.metadata.cameraId,
            location: feed.metadata.location,
            timestamp: feed.metadata.timestamp,
            uploadDate: feed.uploadDate,
            size: feed.length,
            mimeType: feed.metadata.mimeType
        };
    } catch (error) {
        console.error('Error in getLatestLiveFeed:', error);
        throw error;
    }
}

/**
 * Delete old live feeds (cleanup)
 * @param {Number} daysOld - Delete feeds older than this many days
 * @returns {Promise<Number>} Number of deleted files
 */
async function deleteOldLiveFeeds(daysOld = 7) {
    try {
        const bucket = await initializeGridFS();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const oldFeeds = await bucket.find({
            uploadDate: { $lt: cutoffDate }
        }).toArray();

        let deletedCount = 0;
        for (const feed of oldFeeds) {
            await bucket.delete(feed._id);
            deletedCount++;
        }

        console.log(`Deleted ${deletedCount} old live feeds`);
        return deletedCount;
    } catch (error) {
        console.error('Error in deleteOldLiveFeeds:', error);
        throw error;
    }
}

/**
 * Delete specific live feed by file ID
 * @param {String} fileId - GridFS file ID
 * @returns {Promise<Boolean>} Success status
 */
async function deleteLiveFeed(fileId) {
    try {
        const bucket = await initializeGridFS();
        const { ObjectId } = await import('mongodb');

        await bucket.delete(new ObjectId(fileId));
        console.log(`Live feed ${fileId} deleted successfully`);
        return true;
    } catch (error) {
        console.error('Error in deleteLiveFeed:', error);
        throw error;
    }
}

/**
 * Get all live feeds with pagination
 * @param {Number} page - Page number
 * @param {Number} limit - Items per page
 * @returns {Promise<Object>} Paginated feeds list
 */
async function getAllLiveFeeds(page = 1, limit = 10) {
    try {
        const bucket = await initializeGridFS();
        const skip = (page - 1) * limit;

        const feeds = await bucket.find({})
            .sort({ uploadDate: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        const totalCount = await bucket.find({}).toArray();

        return {
            feeds: feeds.map(feed => ({
                fileId: feed._id.toString(),
                filename: feed.filename,
                cameraId: feed.metadata?.cameraId,
                location: feed.metadata?.location,
                timestamp: feed.metadata?.timestamp,
                uploadDate: feed.uploadDate,
                size: feed.length,
                mimeType: feed.metadata?.mimeType
            })),
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount.length / limit),
                totalItems: totalCount.length,
                itemsPerPage: limit
            }
        };
    } catch (error) {
        console.error('Error in getAllLiveFeeds:', error);
        throw error;
    }
}

export {
    initializeGridFS,
    uploadLiveFeed,
    streamLiveFeedToClient,
    streamLiveFeedWithRange,
    getLiveFeedsByCameraId,
    getLatestLiveFeed,
    deleteOldLiveFeeds,
    deleteLiveFeed,
    getAllLiveFeeds
};
