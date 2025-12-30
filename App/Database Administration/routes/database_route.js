import express from 'express';
import database from '../services/database.js';
import mongoConnectivity from '../services/mongo_connectivity.js';
const router = express.Router();

router.route('/postDatabase').post(database.post_database);
router.route('/getDatabase').get(database.get_database);
router.route('/getDatabase/:id').get(database.get_database_byId);
router.route('/updateDatabase/:id').post(database.update_database);
router.route('/deleteDatabase/:id').delete(database.delete_database);

router.route('/postDatabaseMapping').post(database.post_database_mapping);
router.route('/getDatabaseMapping').get(database.get_database_mapping);
router.route('/getDatabaseMapping/:id').get(database.get_database_mapping_byId);
router.route('/updateDatabaseMapping/:id').post(database.update_database_mapping);
router.route('/deleteDatabaseMapping/:id').delete(database.delete_database_mapping);

// MongoDB Connectivity Routes
router.route('/executeMongoQuery').post(mongoConnectivity.execute_mongo_query);
router.route('/testMongoConnection').post(mongoConnectivity.test_mongo_connection);

export default router;