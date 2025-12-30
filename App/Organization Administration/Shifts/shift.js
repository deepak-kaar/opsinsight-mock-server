import { connectToMongoDB } from '../../../config/connection.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const post_shift = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const shiftCollectionName = process.env.SHIFT_COLLECTION;

    const newObjectId = new ObjectId();

    const shiftSchema = {
      _id: newObjectId,
      shiftId: newObjectId.toHexString(),
      shiftName: req.body.shiftName,
      shiftDescription: req.body.shiftDescription,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      orgId: req.body.orgId,
      appId: req.body.appId,
      hourFormat: req.body.hourFormat,
      createdOn: new Date()
    };

    const result = await db.collection(shiftCollectionName).insertOne(shiftSchema);
    return res.json({ token: '200', response: 'Successfully created in database', Shift: shiftSchema });
  } catch (err) {
    console.error('Error creating instance:', err);
    return res.status(500).json({ token: '500', response: 'Failed to create Users records', error: err.message });
  }
};

const get_shift = async function (req, res, next) {
  try {

    const appId = req.body.appId;
    const orgId = req.body.orgId;

    let filters = {
      ...(appId && { appId: appId }),
      ...(orgId) && { orgId: orgId }
    }
    const db = await connectToMongoDB();
    const shiftCollectionName = process.env.SHIFT_COLLECTION;

    // const projection = { DataType: 1, _id: 0 };
    const result = await db.collection(shiftCollectionName).find(filters).toArray();
    if (result) {
      return res.json({ token: '200', Shifts: result });
    } else {
      return res.status(404).json({ token: "404", error: 'Users not found' });
    }
  } catch (err) {
    console.error('Error fetching data from MongoDB:', err);
    return res.status(500).json({ error: 'Error fetching data from MongoDB', details: err.message });
  }
};

const get_shift_ID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.SHIFT_COLLECTION;

    const shiftId = req.params.id;

    if (!ObjectId.isValid(shiftId)) {
      return res.status(204).json({ error: 'Invalid shiftId' });
    }

    const shiftJson = await db.collection(CollectionName).find({ shiftId: shiftId }).toArray();

    if (shiftJson.length > 0) {
      return res.status(200).json({
        token: '200',
        response: 'Successfully fetched shift Json',
        shiftJson
      });
    } else {
      return res.status(204).json({ error: 'No shift found for this Id' });
    }
  } catch (err) {
    console.error('Error fetching shiftJson:', err);
    return res.status(500).json({
      error: 'Error fetching shiftJson',
      details: err.message
    });
  }
};

const update_shifts = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.SHIFT_COLLECTION;

    const { shiftId } = req.body;

    if (!shiftId || shiftId.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "shiftId is required and cannot be empty",
      });
    }

    const existingJson = await db
      .collection(CollectionName)
      .findOne({ shiftId });
    if (!existingJson) {
      return res.status(404).json({
        token: "404",
        response: "records not found with the provided shiftId",
      });
    }

    const updatedJson = {
      shiftName: req.body.shiftName || existingJson.shiftName,
      shiftDescription: req.body.shiftDescription || existingJson.shiftDescription,
      startTime: req.body.startTime || existingJson.startTime,
      endTime: req.body.endTime || existingJson.endTime,
      orgId: req.body.orgId || existingJson.orgId,
      appId: req.body.appId || existingJson.appId,
      hourFormat: req.body.hourFormat || existingJson.hourFormat,
    };

    await db
      .collection(CollectionName)
      .updateOne({ shiftId }, { $set: updatedJson });

    return res.json({
      token: "200",
      response: "Successfully updated",
      updatedJson,
    });
  } catch (err) {
    console.error("Error while updating:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to update",
      error: err.message,
    });
  }
};

const delete_shift = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.SHIFT_COLLECTION;

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({ token: "200", id, response: "Shift deleted successfully" });
    } else {
      return res.status(404).json({ token: "404", response: "Shift not found" });
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
export default { post_shift, get_shift, get_shift_ID, update_shifts, delete_shift };