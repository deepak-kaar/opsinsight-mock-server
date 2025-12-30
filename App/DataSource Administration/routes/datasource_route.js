import express from 'express';
import datasource from '../services/datasource.js';
const router = express.Router();


// DataSource Send
router.route('/postDataSource').post(datasource.post_datasource);
router.route('/getDataSource').get(datasource.get_datasource);
router.route('/getDataSource/:id').get(datasource.get_datasource_byId);
router.route('/updateDataSource/:id').post(datasource.update_datasource);
router.route('/deleteDataSource/:id').delete(datasource.delete_datasource);

export default router;