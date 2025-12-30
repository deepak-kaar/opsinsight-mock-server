import express from 'express';
import correlation from '../../CorrelationEngine/services/correlation.js';

const router = express.Router(); 
// Core correlation management
router.route('/postCorrelation').post(correlation.post_correlation);
router.route('/getCorrelationList').post(correlation.get_correlation_list);

// Correlation execution
router.route('/correlationEngine').post(correlation.correlationEngine);
router.route('/executeCorrelationByName').post(correlation.executeCorrelationByName);
router.route('/correlationJs').post(correlation.correlationJs);

// Correlation instance management
router.route('/getCorrelationInstances').post(correlation.getCorrelationInstances);

// Enhanced correlation instance monitoring routes (similar to Activity Engine)
router.route('/getCorrelationInstanceStatus').post(async (req, res, next) => {
  try {
    const { instanceId } = req.body;
    if (!instanceId) {
      return res.status(400).json({
        token: "400",
        response: "instanceId is required"
      });
    }
    const status = await correlation.getCorrelationInstanceStatus(instanceId);
    return res.json({
      token: "200",
      response: "Correlation instance status retrieved successfully",
      instanceStatus: status,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error getting correlation instance status:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to get correlation instance status",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.route('/getAllCorrelationInstancesSummary').get(async (req, res, next) => {
  try {
    const summary = await correlation.getAllCorrelationInstancesSummary();
    return res.json({
      token: "200",
      response: "Correlation instances summary retrieved successfully",
      summary: summary,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error getting correlation instances summary:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to get correlation instances summary",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.route('/checkCorrelationHeartbeatHealth').get(async (req, res, next) => {
  try {
    const healthCheck = await correlation.checkCorrelationHeartbeatHealth();
    return res.json({
      token: "200",
      response: "Correlation heartbeat health check completed",
      healthCheck: healthCheck,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error checking correlation heartbeat health:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to check correlation heartbeat health",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Stage preview and debugging
router.route('/previewCorrelationStages').post(correlation.previewCorrelationStages);
router.route('/getStageInfo').post(correlation.getStageInfo);

// Template validation
router.route('/validateCorrelationTemplate').post(correlation.validateCorrelationTemplate);

// router.route('/getPipelineStatements').post(correlation.getPipelineStatements);

export default router;