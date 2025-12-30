import express from 'express';
import webservice from '../services/webservice.js';
const router = express.Router();

router.route('/postWebService').post(webservice.post_webservice);
router.route('/getWebService').get(webservice.get_webservice);
router.route('/getWebService/:id').get(webservice.get_webservice_byId);
router.route('/updateWebService/:id').post(webservice.update_webservice);
router.route('/deleteWebService/:id').delete(webservice.delete_webservice);

export default router;

