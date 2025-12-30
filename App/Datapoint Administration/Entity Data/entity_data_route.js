import express from 'express';
import entity_data from './entity_data.js';
const router = express.Router();

router.route('/getEntityData/:id').get(entity_data.get_entitydata);
router.route('/getDatabyId').post(entity_data.get_data);
router.route('/postEntityData').post(entity_data.post_entitydata);
router.route('/updateEntityData').post(entity_data.update_entitydata);
router.route('/deleteEntityData/:id').get(entity_data.delete_entitydata);

export default router;