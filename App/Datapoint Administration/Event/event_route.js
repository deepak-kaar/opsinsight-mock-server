import express from 'express';
import event from './event.js';
const router = express.Router();
    
router.route('/postEvent').post(event.post_event);
router.route('/getEvent').post(event.get_event);
router.route('/getEvent/:id').get(event.get_event_ID);
router.route('/updateEvent').post(event.update_event);
router.route('/deleteEvent/:id').get(event.delete_event);
export default router;