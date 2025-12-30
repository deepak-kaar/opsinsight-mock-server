import express from 'express';
import activity from '../../ActivityEngine/services/activityEngine.js';

const router = express.Router();

// Calculation Steps   
router.route('/postActivityFM').post(activity.post_activityFM);
router.route('/getActivityFM').post(activity.get_activityFM);
router.route('/getActivityFMById/:id').get(activity.get_activityFMById);
router.route('/executeActivityFM').post(activity.execute_activityFM);

router.route('/postActivityTemplate').post(activity.post_activityTemplate);
router.route('/getActivityTemplate').post(activity.get_activityTemplate);
router.route('/postActivityInstance').post(activity.post_activityInstance);
router.route('/getActivityInstance').post(activity.get_activityInstance);

router.route('/postActivitySteps').post(activity.post_activitySteps);
router.route('/getActivitySteps').post(activity.get_activitySteps);

router.route('/getActivityQueueSSE/:id').get(activity.get_activityQueue);

// router.route('/triggerQueue').get(activity.processPendingQueue);

// router.route('/executeActivityQueue').post(activity.executeActivityQueue);

export default router;