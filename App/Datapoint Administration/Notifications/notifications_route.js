import express from 'express';
import notifications from './notifications.js';
const router = express.Router();

router.route('/postNotification').post(notifications.post_notification);
router.route('/getNotifications').post(notifications.get_notifications);
router.route('/getNotifications/:id').get(notifications.get_notification);
router.route('/updateNotification').post(notifications.update_notification);
router.route('/deleteNotification/:id').get(notifications.delete_notification);

export default router;