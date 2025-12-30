import express from 'express';
import templates from './template.js';
const router = express.Router();
    
router.route('/postTemplate').post(templates.post_template);
router.route('/getTemplate').post(templates.get_template);
router.route('/getTemplate/:id').get(templates.get_template_ID);
router.route('/deleteTemplate/:id').get(templates.delete_template);


export default router;