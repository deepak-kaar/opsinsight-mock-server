import express from 'express';
import sensor from './sensor.js';
const router = express.Router();
    
router.route('/getSensor').get(sensor.get_sensor);
router.route('/postSensor').post(sensor.post_sensor);
router.route('/getSensor/:id').get(sensor.get_sensor_ID);
router.route('/attributeMapping').post(sensor.attribute_mapping);
router.route('/deleteSensor/:id').get(sensor.delete_sensor);


export default router;