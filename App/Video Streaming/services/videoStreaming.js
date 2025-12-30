import { connectToMongoDB, gfsBucket } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const getStreams = async (req, res) => {
    try {

        await connectToMongoDB();

        const files = await gfsBucket.find({}).toArray();

        // Group files by streamId
        const streams = {};
        files.forEach(file => {
            const streamId = file.metadata?.streamId || 'unknown';
            if (!streams[streamId]) {
                streams[streamId] = {
                    streamId,
                    files: [],
                    totalSize: 0,
                    totalChunks: 0,
                    startTime: file.uploadDate,
                    endTime: file.uploadDate
                };
            }
            streams[streamId].files.push({
                fileId: file._id.toString(),
                filename: file.filename,
                chunkIndex: file.metadata?.chunkIndex,
                size: file.length,
                uploadDate: file.uploadDate
            });
            streams[streamId].totalSize += file.length;
            streams[streamId].totalChunks++;

            if (file.uploadDate < streams[streamId].startTime) {
                streams[streamId].startTime = file.uploadDate;
            }
            if (file.uploadDate > streams[streamId].endTime) {
                streams[streamId].endTime = file.uploadDate;
            }
        });

        res.json({
            success: true,
            streams: Object.values(streams),
            totalStreams: Object.keys(streams).length,
            currentLiveStream: currentStreamId
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch streams' });
    }
}

const getStreamById = async (req, res) => {
    try {
        await connectToMongoDB();
        const { streamId } = req.params;
        const files = await gfsBucket.find({
            'metadata.streamId': streamId
        })
            .sort({ 'metadata.chunkIndex': 1 })
            .toArray();

        if (files.length === 0) {
            return res.status(404).json({ error: 'Stream not found' });
        }

        res.json({
            success: true,
            streamId,
            isLive: streamId === currentStreamId,
            chunks: files.map(f => ({
                fileId: f._id.toString(),
                filename: f.filename,
                chunkIndex: f.metadata?.chunkIndex,
                size: f.length,
                uploadDate: f.uploadDate,
                contentType: f.contentType
            })),
            totalChunks: files.length,
            totalSize: files.reduce((sum, f) => sum + f.length, 0)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stream' });
    }
}

const getVideoById = async (req, res) => {
    try {
        await connectToMongoDB();
        const { fileId } = req.params;
        const _id = new ObjectId(fileId);

        // Get file info
        const files = await gfsBucket.find({ _id }).toArray();

        if (!files || files.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const file = files[0];

        // Set headers
        res.set('Content-Type', file.contentType || 'video/webm');
        res.set('Content-Length', file.length);
        res.set('Accept-Ranges', 'bytes');
        res.set('Cache-Control', 'public, max-age=31536000');

        // Stream the video
        const downloadStream = gfsBucket.openDownloadStream(_id);
        downloadStream.pipe(res);

        downloadStream.on('error', (error) => {
            console.error('Error streaming video:', error);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to stream video' });
    }
}

const getLiveStreamById = async (req, res) => {
    try {
        await connectToMongoDB();
        const { streamId } = req.params;
        const fromChunk = parseInt(req.query.fromChunk) || 0;

        // Find all chunks for this stream from the specified chunk index
        const files = await gfsBucket.find({
            'metadata.streamId': streamId,
            'metadata.chunkIndex': { $gte: fromChunk }
        })
            .sort({ 'metadata.chunkIndex': 1 })
            .toArray();

        if (files.length === 0) {
            return res.status(404).json({ error: 'No chunks found' });
        }

        res.set('Content-Type', 'video/webm');
        res.set('Cache-Control', 'no-cache');
        res.set('Connection', 'keep-alive');

        // Stream each chunk sequentially
        for (const file of files) {
            const downloadStream = gfsBucket.openDownloadStream(file._id);
            await new Promise((resolve, reject) => {
                downloadStream.pipe(res, { end: false });
                downloadStream.on('end', resolve);
                downloadStream.on('error', reject);
            });
        }

        res.end();
    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream video' });
        }
    }
}

const getLiveStreamStatusById = async (req, res) => {
    try {
        await connectToMongoDB();
        const { streamId } = req.params;

        const isLive = streamId === currentStreamId;

        let chunkCount = 0;
        let totalSize = 0;

        if (gfsBucket) {
            const files = await gfsBucket.find({
                'metadata.streamId': streamId
            }).toArray();

            chunkCount = files.length;
            totalSize = files.reduce((sum, f) => sum + f.length, 0);
        }

        res.json({
            success: true,
            streamId,
            isLive,
            chunkCount,
            totalSize,
            startTime: streamStartTime,
            broadcaster: broadcaster ? 'active' : 'inactive'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get stream status' });
    }
}

const getFullStreamByStreamId = async (req, res) => {
    try {
        const { streamId } = req.params;

        await connectToMongoDB();

        //  Get all chunks for this stream in order
        const files = await gfsBucket.find({ 'metadata.streamId': streamId })
            .sort({ 'metadata.chunkIndex': 1 })
            .toArray();

        if (files.length === 0) {
            return res.status(404).json({ error: 'Stream not found' });
        }

        // Calculate total size
        const totalSize = files.reduce((sum, f) => sum + f.length, 0);

        // Parse Range header (if provided)
        const range = req.headers.range;
        if (!range) {
            // No Range → send full stream sequentially
            res.setHeader('Content-Type', 'video/webm');
            res.setHeader('Content-Length', totalSize);
            res.setHeader('Cache-Control', 'no-cache');

            for (const file of files) {
                await new Promise((resolve, reject) => {
                    const stream = gfsBucket.openDownloadStream(file._id);
                    stream.pipe(res, { end: false });
                    stream.on('end', resolve);
                    stream.on('error', reject);
                });
            }
            return res.end();
        }

        // Handle Range request
        const parts = range.replace(/bytes=/, '').split('-');
        const rangeStart = parseInt(parts[0], 10);
        let rangeEnd = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        if (rangeEnd >= totalSize) rangeEnd = totalSize - 1;

        const chunkHeaders = {
            'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': rangeEnd - rangeStart + 1,
            'Content-Type': 'video/webm',
            'Cache-Control': 'no-cache',
        };

        res.writeHead(206, chunkHeaders);

        // Stream only the requested byte range
        let bytesSent = 0;
        for (const file of files) {
            if (bytesSent > rangeEnd) break;

            const fileStart = bytesSent;
            const fileEnd = bytesSent + file.length - 1;

            // Skip chunks before rangeStart
            if (fileEnd < rangeStart) {
                bytesSent += file.length;
                continue;
            }

            const streamStart = Math.max(0, rangeStart - fileStart);
            const streamEnd = Math.min(file.length - 1, rangeEnd - fileStart);

            await new Promise((resolve, reject) => {
                const stream = gfsBucket.openDownloadStream(file._id, { start: streamStart });
                let bytesToSend = streamEnd - streamStart + 1;

                stream.on('data', (chunk) => {
                    if (bytesToSend <= 0) return;

                    if (chunk.length > bytesToSend) {
                        res.write(chunk.slice(0, bytesToSend));
                        bytesToSend = 0;
                        stream.destroy(); // stop streaming this chunk
                    } else {
                        res.write(chunk);
                        bytesToSend -= chunk.length;
                    }
                });

                stream.on('end', resolve);
                stream.on('error', reject);
            });

            bytesSent += file.length;
        }

        res.end();
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

const deleteStreamById = async (req, res) => {
  try {
    if (!gfsBucket) {
      return res.status(503).json({ error: 'Database not ready' });
    }

    const { streamId } = req.params;
    
    const files = await gfsBucket.find({ 
      'metadata.streamId': streamId 
    }).toArray();

    if (files.length === 0) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Delete all chunks
    for (const file of files) {
      await gfsBucket.delete(file._id);
    }

    res.json({
      success: true,
      message: `Deleted ${files.length} chunks for stream ${streamId}`
    });
  } catch (error) {
    console.error('Error deleting stream:', error);
    res.status(500).json({ error: 'Failed to delete stream' });
  }
}

export default {
    getStreams,
    getStreamById,
    getVideoById,
    getLiveStreamById,
    getLiveStreamStatusById,
    getFullStreamByStreamId,
    deleteStreamById
}