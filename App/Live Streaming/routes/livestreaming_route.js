import express from 'express';
import {
    uploadLiveFeed,
    streamLiveFeedToClient,
    streamLiveFeedWithRange,
    getLiveFeedsByCameraId,
    getLatestLiveFeed,
    deleteOldLiveFeeds,
    deleteLiveFeed,
    getAllLiveFeeds
} from '../services/livestreaming_service.js';

const router = express.Router();

/**
 * @swagger
 * /liveStreaming/upload:
 *   post:
 *     summary: Upload live feed from camera
 *     description: Receives video stream from camera and stores in GridFS
 *     tags:
 *       - Live Streaming
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cameraId:
 *                 type: string
 *                 description: Unique camera identifier
 *               location:
 *                 type: string
 *                 description: Camera location
 *               mimeType:
 *                 type: string
 *                 description: Video MIME type
 *               resolution:
 *                 type: string
 *                 description: Video resolution
 *               fps:
 *                 type: number
 *                 description: Frames per second
 *               videoData:
 *                 type: string
 *                 description: Base64 encoded video data
 *     responses:
 *       200:
 *         description: Video uploaded successfully
 *       500:
 *         description: Server error
 */
router.post('/upload', async (req, res) => {
    try {
        const { cameraId, location, mimeType, resolution, fps, videoData } = req.body;

        if (!cameraId || !videoData) {
            return res.status(400).json({ error: 'cameraId and videoData are required' });
        }

        // Convert base64 to buffer
        const videoBuffer = Buffer.from(videoData, 'base64');

        const cameraData = {
            cameraId,
            location,
            mimeType,
            resolution,
            fps
        };

        const result = await uploadLiveFeed(cameraData, videoBuffer);

        res.status(200).json({
            success: true,
            message: 'Live feed uploaded successfully',
            data: result
        });
    } catch (error) {
        console.error('Error uploading live feed:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /liveStreaming/stream/{fileId}:
 *   get:
 *     summary: Stream live feed by file ID
 *     description: Stream video to UI with range support
 *     tags:
 *       - Live Streaming
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: GridFS file ID
 *     responses:
 *       200:
 *         description: Video stream
 *       404:
 *         description: Video not found
 *       500:
 *         description: Server error
 */
router.get('/stream/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;

        if (!fileId) {
            return res.status(400).json({ error: 'fileId is required' });
        }

        // Use range-enabled streaming
        await streamLiveFeedWithRange(fileId, req, res);
    } catch (error) {
        console.error('Error streaming live feed:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

/**
 * @swagger
 * /liveStreaming/camera/{cameraId}:
 *   get:
 *     summary: Get all feeds for a specific camera
 *     description: Retrieve all video feeds from a camera
 *     tags:
 *       - Live Streaming
 *     parameters:
 *       - in: path
 *         name: cameraId
 *         required: true
 *         schema:
 *           type: string
 *         description: Camera ID
 *     responses:
 *       200:
 *         description: List of feeds
 *       500:
 *         description: Server error
 */
router.get('/camera/:cameraId', async (req, res) => {
    try {
        const { cameraId } = req.params;

        if (!cameraId) {
            return res.status(400).json({ error: 'cameraId is required' });
        }

        const feeds = await getLiveFeedsByCameraId(cameraId);

        res.status(200).json({
            success: true,
            cameraId: cameraId,
            count: feeds.length,
            data: feeds
        });
    } catch (error) {
        console.error('Error getting live feeds by camera:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /liveStreaming/camera/{cameraId}/latest:
 *   get:
 *     summary: Get latest feed for a camera
 *     description: Retrieve the most recent video feed from a camera
 *     tags:
 *       - Live Streaming
 *     parameters:
 *       - in: path
 *         name: cameraId
 *         required: true
 *         schema:
 *           type: string
 *         description: Camera ID
 *     responses:
 *       200:
 *         description: Latest feed data
 *       404:
 *         description: No feed found
 *       500:
 *         description: Server error
 */
router.get('/camera/:cameraId/latest', async (req, res) => {
    try {
        const { cameraId } = req.params;

        if (!cameraId) {
            return res.status(400).json({ error: 'cameraId is required' });
        }

        const feed = await getLatestLiveFeed(cameraId);

        if (!feed) {
            return res.status(404).json({ error: 'No feed found for this camera' });
        }

        res.status(200).json({
            success: true,
            data: feed
        });
    } catch (error) {
        console.error('Error getting latest live feed:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /liveStreaming/feeds:
 *   get:
 *     summary: Get all live feeds with pagination
 *     description: Retrieve all video feeds with pagination
 *     tags:
 *       - Live Streaming
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Paginated feeds list
 *       500:
 *         description: Server error
 */
router.get('/feeds', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const result = await getAllLiveFeeds(page, limit);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting all live feeds:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /liveStreaming/delete/{fileId}:
 *   delete:
 *     summary: Delete a specific live feed
 *     description: Remove a video feed from GridFS by file ID
 *     tags:
 *       - Live Streaming
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: GridFS file ID
 *     responses:
 *       200:
 *         description: Feed deleted successfully
 *       500:
 *         description: Server error
 */
router.delete('/delete/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;

        if (!fileId) {
            return res.status(400).json({ error: 'fileId is required' });
        }

        await deleteLiveFeed(fileId);

        res.status(200).json({
            success: true,
            message: 'Live feed deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting live feed:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /liveStreaming/cleanup:
 *   delete:
 *     summary: Delete old live feeds
 *     description: Remove feeds older than specified days
 *     tags:
 *       - Live Streaming
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Delete feeds older than this many days
 *     responses:
 *       200:
 *         description: Cleanup completed
 *       500:
 *         description: Server error
 */
router.delete('/cleanup', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;

        const deletedCount = await deleteOldLiveFeeds(days);

        res.status(200).json({
            success: true,
            message: `Deleted ${deletedCount} old live feeds`,
            deletedCount: deletedCount
        });
    } catch (error) {
        console.error('Error cleaning up old feeds:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Health check endpoint
 */
router.get('/health', (_req, res) => {
    res.json({ status: 'OK', message: 'Live streaming service is running' });
});

export default router;
