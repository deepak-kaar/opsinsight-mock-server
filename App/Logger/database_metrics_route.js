import express from 'express';
import { connectToMongoDB, getDbPoolMetrics, getDbHealthSnapshot } from '../../config/connection.js';
import { getSystemMetrics } from './systemMetrics.js';

const router = express.Router();

// GET /db/health - Database health snapshot
router.get('/db/health', async (req, res) => {
    try {
        const health = await getDbHealthSnapshot();
        res.json(health);
    } catch (error) {
        console.error('Error fetching database health:', error);
        res.status(500).json({
            status: 'DOWN',
            error: 'Failed to fetch database health'
        });
    }
});

// GET /db/pool - Connection pool metrics
router.get('/db/pool', async (req, res) => {
    try {
        const poolMetrics = getDbPoolMetrics();
        res.json(poolMetrics);
    } catch (error) {
        console.error('Error fetching pool metrics:', error);
        res.status(500).json({ error: 'Failed to fetch pool metrics' });
    }
});

// GET /system/cpu - CPU usage metrics
router.get('/system/cpu', (req, res) => {
    try {
        const metrics = getSystemMetrics();

        // Flatten structure for backward compatibility with frontend
        res.json({
            current: metrics.cpu.current,
            average5m: metrics.cpu.average5m,
            peak: metrics.cpu.peak5m,
            cores: metrics.cpu.cores,
            loadAverage: metrics.cpu.loadAverage,
            totalMemoryGB: metrics.memory.totalGB,
            freeMemoryGB: metrics.memory.freeGB,
            memoryUsagePercent: metrics.memory.usedPercent,
            uptimeSec: metrics.uptimeSec
        });
    } catch (error) {
        console.error('Error fetching CPU metrics:', error);
        res.status(500).json({ error: 'Failed to fetch CPU metrics' });
    }
});

// GET /db/analysis - Database query analysis and slow queries
router.get('/db/analysis', async (req, res) => {
    try {
        const health = await getDbHealthSnapshot();
        const pool = getDbPoolMetrics();

        const slowQueryRisk =
            health.latencyMs > 300 || pool.waitQueueSize > 5;

        res.json({
            status: health.status,
            latencyMs: health.latencyMs,
            slowQueryRisk,
            poolUtilization: pool.utilizationRate,
            waitQueueSize: pool.waitQueueSize,
            errorRate1m: pool.errorRate1m,
            timestamp: new Date()
        });

    } catch (err) {
        res.status(503).json({
            status: "DOWN",
            error: "Database analysis unavailable"
        });
    }
});


// GET /db/summary - Combined metrics for dashboard
let cachedCollectionStats = {
    totalCollections: 0,
    lastUpdated: 0
};

async function getCollectionSummary(db) {
    const now = Date.now();

    // Refresh every 5 minutes
    if (now - cachedCollectionStats.lastUpdated < 5 * 60 * 1000) {
        return cachedCollectionStats;
    }

    const collections = await db.listCollections().toArray();

    cachedCollectionStats = {
        totalCollections: collections.length,
        lastUpdated: now
    };

    return cachedCollectionStats;
}

router.get('/db/summary', async (req, res) => {
    try {
        const db = await connectToMongoDB();

        const [health, pool, analysis] = await Promise.all([
            getDbHealthSnapshot(),
            getDbPoolMetrics(),
            getCollectionSummary(db)
        ]);

        res.json({
            health,
            pool,
            analysis: {
                totalCollections: analysis.totalCollections
            },
            timestamp: new Date()
        });

    } catch (error) {
        console.error('Error fetching database summary:', error);
        res.status(503).json({
            status: "DOWN",
            error: 'Failed to fetch database summary'
        });
    }
});


export default router;
