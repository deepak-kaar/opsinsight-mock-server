import express from 'express';
import config from './config.js';
const router = express.Router();
    
router.route('/postConfig').post(config.post_config);
router.route('/getConfig').get(config.get_config);
router.route('/getConfigDropdown').get(config.get_config_dropdown);
router.route('/getConfig/:id').get(config.get_config_by_id);
router.route('/updateConfig/:id').post(config.update_config);
router.route('/deleteConfig/:id').get(config.delete_config);
router.route('/encrypt').post(config.encrypt_value);
router.route('/decrypt').post(config.decrypt_value);

export default router;