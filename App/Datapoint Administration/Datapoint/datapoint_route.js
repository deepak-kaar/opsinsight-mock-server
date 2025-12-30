import express from 'express';
import dataPoint from './datapoint.js';
const router = express.Router(); 
    
router.route('/getDatapoint').get(dataPoint.get_dataPoint);
router.route('/postDatapoint').post(dataPoint.post_dataType);
router.route('/deleteDatapoint/:id').get(dataPoint.delete_datapoint);

export default router;