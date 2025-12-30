import { connectToMongoDB } from '../../../config/connection.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

    const post_sensor= async function (req, res, next) {
        try {
            const db = await connectToMongoDB();
            const collectionName = process.env.SENSOR_COLLECTION;

            const newObjectId = new ObjectId();

            const sensorName = req.body.sensorName;
            const currentValue= req.body.currentValue;
            const currentValueUnit= req.body.currentValueUnit;

            if (!sensorName || !currentValue || !currentValueUnit) {
                return res.status(400).json({
                    token: '400',
                    response: 'Sensor details is required and cannot be empty'
                });
            }

            const sensorSchema = {
                _id: newObjectId,
                sensorId: newObjectId.toHexString(),
                sensorName: sensorName,
                currentValue: currentValue,
                currentValueUnit: currentValueUnit,
                createdOn: new Date()
            };

            const result = await db.collection(collectionName).insertOne(sensorSchema);
            return res.json({ token: '200', response: 'Successfully created in database', Sensor: sensorSchema });
        } catch (err) {
            console.error('Error creating Sensor:', err);
            return res.status(204).json({ token: '500', response: 'Failed to create Sensor', error: err.message });
        }
    };
    const get_sensor= async function (req, res, next) {
        try {
            const db = await connectToMongoDB();
            const collectionName = process.env.SENSOR_COLLECTION;

            // const projection = { DataType: 1, _id: 0 };
            const result = await db.collection(collectionName).find({}).toArray();
            if (result) {
                return res.status(200).json({ token: '200', Sensors: result });
                // return res.status(200).json(result);
            } else {
                return res.status(404).json({ error: 'Sensors not found' });
            }
        } catch (err) {
            console.error('Error fetching data from MongoDB:', err);
            return res.status(500).json({ error: 'Error fetching data from MongoDB', details: err.message });
        }
    };

    const get_sensor_ID= async function (req, res, next) {
        try {
            const db = await connectToMongoDB();
            const CollectionName = process.env.SENSOR_COLLECTION;

            const sensorId = req.params.id;

            if (!ObjectId.isValid(sensorId)) {
                return res.status(204).json({ error: 'Invalid sensorId' });
            }

            const sensorJson = await db.collection(CollectionName).find({ sensorId: sensorId }).toArray();

            if (sensorJson.length > 0) {
                return res.status(200).json({
                    token: '200',
                    response: 'Successfully fetched sensorJson',
                    sensorJson
                });
            } else {
                return res.status(204).json({ error: 'No sensor found for this template Id' });
            }
        } catch (err) {
            console.error('Error fetching sensorJson:', err);
            return res.status(500).json({
                error: 'Error fetching sensorJson',
                details: err.message
            });
        }
    };

    const attribute_mapping= async function (req, res, next) {
        try {
          const db = await connectToMongoDB();
          const sensorCollectionName = process.env.SENSOR_COLLECTION;
          const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
      
          const { attributeId, sensorDetails } = req.body;
      
          if (!attributeId || !sensorDetails) {
            return res.status(400).json({
              token: "400",
              response: "Both attributeId and sensorId are required and cannot be empty",
            });
          }

          const sensorDetailsId = sensorDetails.sensorId;
      
          // Check if the sensorId exists in the sensor collection
          const sensorExists = await db
            .collection(sensorCollectionName)
            .findOne({ sensorId: sensorDetailsId });

            // console.log(sensorExists, sensorDetailsId);
      
          if (!sensorExists) {
            return res.status(404).json({
              token: "404",
              response: "Sensor with the provided sensorId does not exist",
            });
          }
      
          // Check if the attributeId exists in the attribute collection
          const attributeExists = await db
            .collection(attributeCollectionName)
            .findOne({ attributeId });
      
          if (!attributeExists) {
            return res.status(404).json({
              token: "404",
              response: "Attribute with the provided attributeId does not exist",
            });
          }
      
          // Update the attribute document with the sensorId
          const updateResult = await db
            .collection(attributeCollectionName)
            .updateOne(
              { attributeId },
              { $set: { sensorDetails } }
            );
      
          if (updateResult.modifiedCount === 0) {
            return res.status(204).json({
              token: "500",
              response: "Failed to update sensorId in the attribute document",
            });
          }
      
          return res.status(200).json({
            token: "200",
            response: "SensorId successfully mapped to the Attribute",
            updateResult
          });
        } catch (err) {
          console.error("Error mapping sensorId to attribute:", err);
          return res.status(500).json({
            token: "500",
            response: "Internal Server Error",
            error: err.message,
          });
        }
      };

      const delete_sensor = async function (req, res, next) {
        try {
          const db = await connectToMongoDB();
          const collectionName = process.env.SENSOR_COLLECTION;
      
          const id = req.params.id;
      
          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ token: "400", response: "Invalid ID format" });
          }
      
          const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });
      
          if (result.deletedCount === 1) {
            return res.json({ token: "200", id, response: "sensor deleted successfully" });
          } else {
            return res.status(404).json({ token: "404", response: "sensor not found" });
          }
        } catch (err) {
          console.error("Error deleting from MongoDB:", err);
          return res.status(500).json({
            token: "500",
            response: "Error deleting from MongoDB",
            error: err.message,
          });
        }
      };

  export default {post_sensor, get_sensor, get_sensor_ID, attribute_mapping, delete_sensor};
