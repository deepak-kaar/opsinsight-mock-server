import express from 'express';
import roles from './roles.js';
const router = express.Router();

router.route('/postRoles').post(roles.post_roles);
router.route('/getRoles').post(roles.get_roles);
router.route('/getRoles/:id').get(roles.get_roles_ID);
router.route('/updateRoles').post(roles.update_roles);
router.route('/getFilteredRoles').post(roles.get_roles_by_app)
router.route('/deleteRoles/:id').get(roles.delete_role);

export default router;
// export default router;