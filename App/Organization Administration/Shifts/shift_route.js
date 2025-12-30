import express from 'express';
import shift from './shift.js';
const router = express.Router();
    
router.route('/postShift').post(shift.post_shift);
router.route('/getShift').post(shift.get_shift);
router.route('/getShift/:id').get(shift.get_shift_ID);
router.route('/updateShift').post(shift.update_shifts);
router.route('/deleteShift/:id').get(shift.delete_shift);

export default router;
// export default router;