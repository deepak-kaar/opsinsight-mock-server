import express from 'express';
import schedulerjob from '../services/schedulerjob.js';
const router = express.Router();
    
router.route('/postJob').post(schedulerjob.post_job);
router.route('/getJobs').get(schedulerjob.get_job);
router.route('/getJobs/:id').get(schedulerjob.get_job_by_id);
router.route('/updateJob/:id').post(schedulerjob.update_job);
router.route('/deleteJob/:id').get(schedulerjob.delete_job);

export default router;