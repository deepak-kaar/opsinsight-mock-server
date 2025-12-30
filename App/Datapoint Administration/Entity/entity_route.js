import express from 'express';
import entity from './entity.js';
const router = express.Router();

router.route('/createEntity').post(entity.post_entity);
router.route('/getEntitySSE').get(entity.get_entity_sse);
router.route('/getEntity/:id').get(entity.get_entity_attributeByID);
router.route('/getEntityDetails/:id').get(entity.get_entity_details);
router.route('/getEntity').post(entity.get_entity_attribute);
router.route('/searchEntity').post(entity.search_entity_attribute);
router.route('/updateEntity').post(entity.update_entity);
router.route('/getEntiryOrInstanceCount').get(entity.get_count_entity);
router.route('/getAppEntityCount').post(entity.get_count_app_entity);
router.route('/getLogs').post(entity.get_entity_logs);
router.route('/deleteEntity/:id').get(entity.delete_entity);
router.route('/getEntityList').post(entity.get_entity_list);
// Added by rangarao on 14-02-2025
router.route('/getAttributes').post(entity.get_attribute_list);

// added by rangarao
router.route('/postEntityValue').post(entity.post_entity_values);


export default router;