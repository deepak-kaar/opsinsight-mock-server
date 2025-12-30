import express from "express";
import controller from "../services/videoStreaming.js";

const router = express.Router();

router.get("/streams", controller.getStreams);
router.get("/streams/:streamId", controller.getStreamById);
router.get('/video/:fileId', controller.getVideoById);
router.get('/stream/live/:streamId', controller.getLiveStreamById);
router.get('/stream/live/:streamId/status', controller.getLiveStreamStatusById);
router.get('/stream/full/:streamId', controller.getFullStreamByStreamId);

router.delete('/streams/:streamId', controller.deleteStreamById);

export default router;