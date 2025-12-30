import { Readable } from "stream";
import { gfsBucket } from "../../../config/connection.js";

export default function registerVideoStreamingSockets(io) {
    let broadcaster = null;
    let currentStreamId = null;
    let streamStartTime = null;
    let chunkCounter = 0;

    // Create a new stream session
    function createNewStream() {
        currentStreamId = `stream-${Date.now()}`;
        streamStartTime = new Date();
        chunkCounter = 0;
        console.log(`New stream session created: ${currentStreamId}`);
        return currentStreamId;
    }


    // Save video chunk to GridFS
    async function saveChunkToGridFS(buffer, streamId, chunkIndex) {
        if (!gfsBucket) {
            console.error('GridFS Bucket not initialized');
            return null;
        }

        return new Promise((resolve, reject) => {
            try {
                const readableStream = Readable.from(buffer);
                const filename = `${streamId}-chunk-${chunkIndex}.webm`;

                const uploadStream = gfsBucket.openUploadStream(filename, {
                    contentType: 'video/webm',
                    metadata: {
                        streamId: streamId,
                        chunkIndex: chunkIndex,
                        timestamp: new Date(),
                        chunkType: 'live-stream',
                        size: buffer.length
                    }
                });

                readableStream.pipe(uploadStream);

                uploadStream.on('finish', () => {
                    console.log(`Chunk ${chunkIndex} saved: ${filename} (${buffer.length} bytes) - FileID: ${uploadStream.id}`);
                    resolve({
                        success: true,
                        fileId: uploadStream.id,
                        filename: filename,
                        chunkIndex: chunkIndex,
                        size: buffer.length
                    });
                });

                uploadStream.on('error', (error) => {
                    console.error(`Error saving chunk ${chunkIndex}:`, error);
                    reject(error);
                });
            } catch (error) {
                console.error('Error in saveChunkToGridFS:', error);
                reject(error);
            }
        });
    }


    // ============================
    //  SOCKET.IO EVENT HANDLERS
    // ============================
    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);

        // Broadcaster identifies itself
        socket.on('broadcaster', () => {
            broadcaster = socket.id;
            currentStreamId = createNewStream();
            console.log(`Broadcaster set: ${broadcaster}`);
            console.log(`Stream session: ${currentStreamId}`);

            // Send stream info back to broadcaster
            socket.emit('stream-started', {
                streamId: currentStreamId,
                timestamp: streamStartTime
            });

            // Notify everyone that a broadcaster is available
            socket.broadcast.emit('broadcaster', {
                available: true,
                streamId: currentStreamId
            });
        });

        // 📹 Viewer requests to watch stream
        socket.on('viewer', () => {
            if (broadcaster) {
                console.log(`Viewer ${socket.id} wants to connect to broadcaster ${broadcaster}`);

                // Send current stream info to viewer
                socket.emit('stream-info', {
                    streamId: currentStreamId,
                    broadcasterAvailable: true
                });

                io.to(broadcaster).emit('viewer', socket.id);
            } else {
                console.log('No broadcaster currently available.');
                socket.emit('stream-info', {
                    broadcasterAvailable: false
                });
            }
        });

        // Broadcaster sends an SDP offer → forward to viewer
        socket.on('offer', (viewerId, offer) => {
            io.to(viewerId).emit('offer', socket.id, offer);
        });

        // Viewer sends an SDP answer → forward to broadcaster
        socket.on('answer', (broadcasterId, answer) => {
            io.to(broadcasterId).emit('answer', socket.id, answer);
        });

        // ICE candidate exchange (both ways)
        socket.on('candidate', (targetId, candidate) => {
            io.to(targetId).emit('candidate', socket.id, candidate);
        });

        // ===== Receive video chunks from broadcaster =====
        socket.on('video-chunk', async (data) => {
            try {
                if (!currentStreamId) {
                    console.error('No active stream session');
                    socket.emit('chunk-error', { error: 'No active stream session' });
                    return;
                }

                const buffer = Buffer.from(data.chunk);
                const chunkIndex = data.chunkIndex || chunkCounter++;

                console.log(`Received chunk ${chunkIndex}: ${buffer.length} bytes for stream ${currentStreamId}`);

                // Save to GridFS
                const result = await saveChunkToGridFS(buffer, currentStreamId, chunkIndex);

                // Acknowledge to broadcaster
                socket.emit('chunk-saved', {
                    success: true,
                    chunkIndex: chunkIndex,
                    fileId: result.fileId,
                    streamId: currentStreamId
                });

                // Broadcast to all viewers that new chunk is available
                socket.broadcast.emit('new-chunk-available', {
                    streamId: currentStreamId,
                    chunkIndex: chunkIndex,
                    fileId: result.fileId,
                    size: result.size
                });

            } catch (error) {
                console.error('Error processing video chunk:', error);
                socket.emit('chunk-error', {
                    error: 'Failed to save chunk',
                    details: error.message
                });
            }
        });

        // Legacy support for 'recordChunk' event
        socket.on('recordChunk', async (buffer) => {
            try {
                if (!currentStreamId) {
                    console.error('No active stream session');
                    return;
                }

                const chunkIndex = chunkCounter++;
                const bufferData = Buffer.from(buffer);

                console.log(`Received chunk ${chunkIndex}: ${bufferData.length} bytes for stream ${currentStreamId}`);

                const result = await saveChunkToGridFS(bufferData, currentStreamId, chunkIndex);

                socket.emit('chunk-saved', {
                    success: true,
                    chunkIndex: chunkIndex,
                    fileId: result.fileId,
                    streamId: currentStreamId
                });

                // Broadcast to viewers
                socket.broadcast.emit('new-chunk-available', {
                    streamId: currentStreamId,
                    chunkIndex: chunkIndex,
                    fileId: result.fileId,
                    size: result.size
                });

            } catch (error) {
                console.error('Error processing recordChunk:', error);
            }
        });

        // Request live stream chunks (for viewers)
        socket.on('request-live-chunks', async (data) => {
            try {
                const { streamId, fromChunkIndex = 0 } = data;

                if (!gfsBucket) {
                    socket.emit('live-chunks-error', { error: 'Database not ready' });
                    return;
                }

                // Find chunks from the specified index
                const files = await gfsBucket.find({
                    'metadata.streamId': streamId,
                    'metadata.chunkIndex': { $gte: fromChunkIndex }
                })
                    .sort({ 'metadata.chunkIndex': 1 })
                    .toArray();

                socket.emit('live-chunks-list', {
                    streamId: streamId,
                    chunks: files.map(f => ({
                        fileId: f._id.toString(),
                        chunkIndex: f.metadata.chunkIndex,
                        size: f.length,
                        timestamp: f.uploadDate
                    })),
                    totalChunks: files.length
                });

            } catch (error) {
                console.error('Error fetching live chunks:', error);
                socket.emit('live-chunks-error', { error: 'Failed to fetch chunks' });
            }
        });

        // 📹 Handle disconnects
        socket.on('disconnect', () => {
            console.log(`Disconnected: ${socket.id}`);

            if (socket.id === broadcaster) {
                console.log('Broadcaster disconnected.');
                console.log(`Stream stats - Total chunks: ${chunkCounter}, StreamID: ${currentStreamId}`);

                broadcaster = null;
                const endedStreamId = currentStreamId;
                currentStreamId = null;
                streamStartTime = null;

                socket.broadcast.emit('broadcaster-disconnected', {
                    streamId: endedStreamId,
                    totalChunks: chunkCounter
                });

                chunkCounter = 0;
            }
        });
    });

}
