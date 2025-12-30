import express from 'express';
import { connectToMongoDB } from '../../config/connection.js';

const router = express.Router();

// Get system-wide logging overview
router.get('/overview', async (req, res) => {
  try {
    const db = await connectToMongoDB();
    
    // Get total counts across all collections
    const [appLogs, auditLogs, errorLogs, securityLogs, perfLogs] = await Promise.all([
      db.collection('ApplicationLogs').countDocuments({}),
      db.collection('AuditTrail').countDocuments({}),
      db.collection('ErrorLogs').countDocuments({}),
      db.collection('SecurityEvents').countDocuments({}),
      db.collection('PerformanceMetrics').countDocuments({})
    ]);

    const totalLogs = appLogs + auditLogs + errorLogs + securityLogs + perfLogs;

    // Get module-wise breakdown
    const moduleBreakdown = await db.collection('ApplicationLogs').aggregate([
      {
        $group: {
          _id: "$module",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).toArray();

    // Get recent critical events
    const criticalEvents = await db.collection('ErrorLogs').find({})
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    // Get security alerts
    const securityAlerts = await db.collection('SecurityEvents').find({
      severity: { $in: ['high', 'critical'] }
    })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    // Get system health metrics
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentErrors, recentSecurity] = await Promise.all([
      db.collection('ErrorLogs').countDocuments({ timestamp: { $gte: last24Hours } }),
      db.collection('SecurityEvents').countDocuments({ timestamp: { $gte: last24Hours } })
    ]);

    // Timeline data for last 7 days
    const timelineData = await db.collection('ApplicationLogs').aggregate([
      {
        $match: {
          timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]).toArray();

    res.json({
      systemHealth: {
        totalLogs,
        recentErrors,
        recentSecurity,
        status: recentErrors > 100 ? 'critical' : recentErrors > 50 ? 'warning' : 'healthy'
      },
      logDistribution: {
        applicationLogs: appLogs,
        auditTrail: auditLogs,
        errorLogs: errorLogs,
        securityEvents: securityLogs,
        performanceMetrics: perfLogs
      },
      moduleBreakdown: {
        labels: moduleBreakdown.map(m => m._id || 'Unknown'),
        values: moduleBreakdown.map(m => m.count)
      },
      timeline: {
        labels: timelineData.map(t => t._id),
        values: timelineData.map(t => t.count)
      },
      criticalEvents,
      securityAlerts,
      insights: {
        mostActiveModule: moduleBreakdown[0]?._id || 'None',
        errorRate: totalLogs > 0 ? ((errorLogs / totalLogs) * 100).toFixed(2) : 0,
        securityIncidents: securityAlerts.length
      }
    });

  } catch (error) {
    console.error('Error fetching logging overview:', error);
    res.status(500).json({ error: 'Failed to fetch logging overview' });
  }
});

// Get available modules for dropdown
router.get('/modules', async (req, res) => {
  try {
    const db = await connectToMongoDB();
    
    const modules = await db.collection('ApplicationLogs').distinct('module');
    
    const moduleList = modules.filter(m => m).map(module => ({
      value: module,
      label: module,
      route: getModuleRoute(module)
    }));

    res.json({ modules: moduleList });

  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// Get logs by collection type
router.get('/collection/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const { limit = 100, module } = req.query;

    const validCollections = [
      'ApplicationLogs',
      'AuditTrail',
      'SecurityEvents',
      'ErrorLogs',
      'PerformanceMetrics'
    ];

    if (!validCollections.includes(collection)) {
      return res.status(400).json({ error: 'Invalid collection' });
    }

    const db = await connectToMongoDB();
    
    const filter = module ? { module } : {};
    const logs = await db.collection(collection)
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({ data: logs, collection, filter });

  } catch (error) {
    console.error('Error fetching collection logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

function getModuleRoute(module) {
  const routeMap = {
    'MongoDB Administration': '/mongoAdmin',
    'Attribute Search': '/attributeSearch',
    'Tag Utilization': '/tagUtilization',
    'Datapoint Administration': '/dataPoint',
    'SchedulerJob Administration': '/schedulerJob',
    'Email Administration': '/emailAdmin',
    'ReportImage Administration': '/reportImageAdmin',
    'Config Administration': '/configAdmin',
    'PI Administration': '/piAdmin',
    'Database Administration': '/databaseAdmin',
    'DataSource Administration': '/datasourceAdmin'
  };
  
  return routeMap[module] || '/logger';
}

export default router;