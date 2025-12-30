import express from 'express';
import organization from './organization.js';
const router = express.Router();
    
router.route('/getOrg').get(organization.get_organization);
router.route('/postOrg').post(organization.post_organization);
router.route('/getOrg/:id').get(organization.get_org_ID);
router.route('/updateOrg').post(organization.update_org);
router.route('/getCount').get(organization.get_count);
router.route('/getOrgByAppId/:id').get(organization.get_orgs_by_appId);
router.route('/deleteOrg/:id').get(organization.delete_org);
router.route('/updateOrgByRole').post(organization.update_org_roles);

export default router;
// export default router;