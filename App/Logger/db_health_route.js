import express from 'express';
import { connectToMongoDB, getDbHealthSnapshot, getDbPoolMetrics } from '../../config/connection.js';

const router = express.Router();

// GET /logger/db/health - current DB health snapshot

// GET /logger/audit - fetch audit trail with filters
// Supported query params: module, entity, entityId, userId, from, to, limit
router.get('/audit', async (req, res) => {
  try {
    const db = await connectToMongoDB();
    const {
      module,
      entity,
      entityId,
      userId,
      from,
      to,
      limit = 100
    } = req.query;

    const filter = {};
    if (module) filter.module = module;
    if (entity) filter.entity = entity;
    if (entityId) filter.entityId = entityId;
    if (userId) filter.userId = userId;

    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }

    const data = await db.collection('AuditTrail')
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({ data, filter });
  } catch (e) {
    console.error('Error fetching audit:', e);
    res.status(500).json({ error: 'Failed to fetch audit' });
  }
});

// SSE stream for realtime updates: health, pool, audit
router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let intervalId;
  const send = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Initial state
  try {
    send('dbHealth', await getDbHealthSnapshot());
    send('dbPool', getDbPoolMetrics());
  } catch {}

  intervalId = setInterval(async () => {
    try {
      send('dbHealth', await getDbHealthSnapshot());
      send('dbPool', getDbPoolMetrics());
    } catch {}
  }, 5000);

  req.on('close', () => {
    if (intervalId) clearInterval(intervalId);
  });
});

export default router;