import express from 'express';
import webservice from '../services/webServiceAdmin.js';
const router = express.Router();

router.route('/ws').post(webservice.postWebService);
router.route('/ws').get(webservice.getWebService);
router.route('/ws/:id').get(webservice.getWebServiceById);
router.route('/ws/:id').put(webservice.putWebService);
router.route('/ws/:id').delete(webservice.deleteWebService);
router.route('/ws/getMap/:id').get(webservice.getWebServiceMap);

export default router;