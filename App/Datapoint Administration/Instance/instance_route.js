import express from 'express';
import instance from './instance.js';
const router = express.Router();
    
router.route('/createInstance').post(instance.post_instance);
router.route('/updateInstance').post(instance.update_instance);
router.route('/getLogs').post(instance.get_instance_logs);
router.route('/getInstanceDetails/:id').get(instance.get_instance_details);
router.route('/getAttributes').post(instance.get_attribute_list);
router.route('/getInstance/:id').get(instance.get_instance_attributeByID);
router.route('/getInstance').post(instance.get_instance_attribute);
router.route('/searchInstance').post(instance.search_instance_attribute);
router.route('/deleteInstance/:id').get(instance.delete_instance);

export default router;