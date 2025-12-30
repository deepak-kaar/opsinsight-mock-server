import express from 'express';
import users from './users.js';
const router = express.Router();
    
router.route('/postUsers').post(users.post_users);
router.route('/getUsers').get(users.get_users);
router.route('/getUsers/:id').get(users.get_user_ID);
router.route('/updateUsers').post(users.update_users);
router.route('/getUserApps').post(users.get_users_app);
router.route('/deleteUser/:id').get(users.delete_user);

export default router;
// export default router;