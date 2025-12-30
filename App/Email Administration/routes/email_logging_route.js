import express from 'express';
import { connectToMongoDB } from '../../../config/connection.js';

const router = express.Router();

router.get('/category/:category', async (req, res) => {
  try {
    const db = await connectToMongoDB();
    const category = req.params.category;
    
    const collectionMap = {
      'ApplicationLogs': 'ApplicationLogs',
      'AuditTrail': 'AuditTrail', 
      'SecurityEvents': 'SecurityEvents',
      'ErrorLogs': 'ErrorLogs',
      'PerformanceMetrics': 'PerformanceMetrics'
    };

    const collectionName = collectionMap[category];
    if (!collectionName) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const logs = await db.collection(collectionName)
      .find({ module: 'Email Administration' })
      .sort({ timestamp: -1 })
      .limit(1000)
      .toArray();

    res.json({ data: logs });
  } catch (error) {
    console.error('Error fetching email logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

router.get('/logger/summary', async (req, res) => {
  try {
    const db = await connectToMongoDB();
    
    const [appLogs, auditLogs, errorLogs, securityLogs, perfLogs] = await Promise.all([
      db.collection('ApplicationLogs').countDocuments({ module: 'Email Administration' }),
      db.collection('AuditTrail').countDocuments({ module: 'Email Administration' }),
      db.collection('ErrorLogs').countDocuments({ module: 'Email Administration' }),
      db.collection('SecurityEvents').countDocuments({ module: 'Email Administration' }),
      db.collection('PerformanceMetrics').countDocuments({ module: 'Email Administration' })
    ]);

    const total = appLogs + auditLogs + errorLogs + securityLogs + perfLogs;

    const chartData = {
      pie: [appLogs, auditLogs, errorLogs, securityLogs, perfLogs],
      topUsers: { labels: ['System'], values: [total] },
      timeline: { labels: ['Today'], values: [total] }
    };

    res.json({
      total,
      errors: errorLogs,
      security: securityLogs,
      audit: auditLogs,
      chartData
    });
  } catch (error) {
    console.error('Error fetching email summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

export default router;