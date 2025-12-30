import express from 'express';
import group from './groups.js';
const router = express.Router();
    
router.route('/postGroup').post(group.post_group);
router.route('/getGroup').post(group.get_group);
router.route('/getGroup/:id').get(group.get_group_ID);
router.route('/updateGroup').post(group.update_group);
router.route('/deleteGroup/:id').get(group.delete_group);

export default router;
// export default router;