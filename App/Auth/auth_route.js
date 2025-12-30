import express from 'express';
import dataPoint from '../Auth/auth.js';

const router = express.Router();

// Existing routes
router.route('/getToken').post(dataPoint.get_token);
router.route('/getLdapUsers').post(dataPoint.get_ldap_users);
router.route('/getLdapUsersGroup').post(dataPoint.get_ldap_group_members);
router.route('/checkLdapConnection').get(dataPoint.check_ldap_connection);
router.route('/getLdapUsersInGroup').post(dataPoint.get_ldap_users_in_group);
router.route('/getLdapUsersByPattern').post(dataPoint.get_ldap_users_by_pattern);
router.route('/checkUsersByGroup').post(dataPoint.check_user_in_group);
router.route('/getallGroups').get(dataPoint.get_all_ldap_groups);
router.route('/addUserToGroup').post(dataPoint.add_user_to_group);
router.route('/deleteUserFromGroup').post(dataPoint.delete_user_from_group);
export default router;