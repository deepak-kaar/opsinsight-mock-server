import express from 'express';
import app from './app.js';
const router = express.Router();

router.route('/postApp').post(app.post_app);
router.route('/getApp').get(app.get_app);
router.route('/getApp/:id').get(app.get_app_ID);
router.route('/updateApp').post(app.update_app);
router.route('/deleteApp/:id').get(app.delete_app);

// Added by Rangarao for Frequency admin
router.route('/freq/createFreq').post(app.create_freq);
router.route('/freq/getFreq').post(app.get_freqs);
router.route('/freq/getFreq/:id').get(app.get_freq_id);
router.route('/freq/updateFreq').post(app.update_freq);
router.route('/freq/deleteFreq/:id').get(app.delete_freq);

export default router;
// export default router;