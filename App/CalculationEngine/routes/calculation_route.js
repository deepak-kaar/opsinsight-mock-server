import express from 'express';
import calculation from '../../CalculationEngine/services/generalCalculation.js';
import calculationSteps from '../../CalculationEngine/services/calculationSteps.js';

const router = express.Router(); 

// ========================================
// CALCULATION STEPS (Keep existing ones)
// ========================================
router.route('/postCalculationSteps').post(calculationSteps.post_calculationSteps);
router.route('/calculateEngine').post(calculationSteps.calculationEngine);
router.route('/postNewCalcEngine').post(calculationSteps.post_newCalculationSteps);
router.route('/getNewCalculation').post(calculation.get_Newcalculation);
router.route('/newCalculateEngine').post(calculationSteps.newCalculationEngine);
router.route('/postNewCalcMapping').post(calculationSteps.post_newCalculationMapping);
router.route('/getNewCalcuMapping').post(calculationSteps.getNewCalculationMapping);

// Calculation instance management
router.route('/getCalculationInstances').post(calculationSteps.getCalculationInstances);

// Enhanced calculation instance monitoring routes (similar to Activity Engine)
router.route('/getCalculationInstanceStatus').post(async (req, res, next) => {
  try {
    const { instanceId } = req.body;
    if (!instanceId) {
      return res.status(400).json({
        token: "400",
        response: "instanceId is required"
      });
    }
    const status = await calculationSteps.getCalculationInstanceStatus(instanceId);
    return res.json({
      token: "200",
      response: "Calculation instance status retrieved successfully",
      instanceStatus: status,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error getting calculation instance status:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to get calculation instance status",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.route('/getAllCalculationInstancesSummary').get(async (req, res, next) => {
  try {
    const summary = await calculationSteps.getAllCalculationInstancesSummary();
    return res.json({
      token: "200",
      response: "Calculation instances summary retrieved successfully",
      summary: summary,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error getting calculation instances summary:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to get calculation instances summary",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.route('/checkCalculationHeartbeatHealth').get(async (req, res, next) => {
  try {
    const healthCheck = await calculationSteps.checkCalculationHeartbeatHealth();
    return res.json({
      token: "200",
      response: "Calculation heartbeat health check completed",
      healthCheck: healthCheck,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error checking calculation heartbeat health:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to check calculation heartbeat health",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================
// GENERAL CALCULATION (Keep existing ones)
// ========================================
router.route('/postCaclculation').post(calculation.post_calculation);
router.route('/getCalculation').get(calculation.get_calculation);
router.route('/getCalculation/:id').get(calculation.get_calculation_ID);
router.route('/deleteCalculation/:id').get(calculation.delete_Calculation);

router.route('/monthToDate').post(calculationSteps.monthToDate);
router.route('/yearToDate').post(calculationSteps.yearToDate);
router.route('/collectionAggregation').post(calculationSteps.collectionAggregation);

export default router;