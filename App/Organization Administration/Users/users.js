import { connectToMongoDB } from '../../../config/connection.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

  const post_users= async function (req, res, next) {
    try {
      const db = await connectToMongoDB();
      const usersCollectionName = process.env.USERS_COLLECTION;

      const newObjectId = new ObjectId();
      const networkId = new ObjectId();

      const userSchema = {
        _id: newObjectId,
        userId: newObjectId.toHexString(),
        userName: req.body.userName,
        networkId: networkId.toHexString(),
        orgId: req.body.orgId,
        shiftId: req.body.shiftId,
        groups: req.body.groups,
        roles: req.body.roles,
        createdOn: new Date()
      };

      const result = await db.collection(usersCollectionName).insertOne(userSchema);
      return res.json({ token: '200', response: 'Successfully created in database', Users: userSchema });
    } catch (err) {
      console.error('Error creating instance:', err);
      return res.status(500).json({ token: '500', response: 'Failed to create Users records', error: err.message });
    }
  };

  const get_users= async function (req, res, next) {
    try {
      const db = await connectToMongoDB();
      const usersCollectionName = process.env.USERS_COLLECTION;

      // const projection = { DataType: 1, _id: 0 };
      const result = await db.collection(usersCollectionName).find({}).toArray();
      if (result) {
        return res.json({ token: '200', Users: result });
      } else {
        return res.status(404).json({token: "404", error: 'Users not found' });
      }
    } catch (err) {
      console.error('Error fetching data from MongoDB:', err);
      return res.status(500).json({ error: 'Error fetching data from MongoDB', details: err.message });
    }
  };

  const get_user_ID= async function (req, res, next) {
    try {
      const db = await connectToMongoDB();
      const CollectionName = process.env.USERS_COLLECTION;

      const userId = req.params.id;

      if (!ObjectId.isValid(userId)) {
        return res.status(204).json({ error: 'Invalid userId' });
      }

      const userJson = await db.collection(CollectionName).find({ userId: userId }).toArray();

      if (userJson.length > 0) {
        return res.status(200).json({
          token: '200',
          response: 'Successfully fetched user Json',
          userJson
        });
      } else {
        return res.status(204).json({ error: 'No user found for this Id' });
      }
    } catch (err) {
      console.error('Error fetching userJson:', err);
      return res.status(500).json({
        error: 'Error fetching userJson',
        details: err.message
      });
    }
  };

  const update_users= async function (req, res, next) {
    try {
      const db = await connectToMongoDB();
      const CollectionName = process.env.USERS_COLLECTION;

      const { userId } = req.body;

      if (!userId || userId.trim() === "") {
        return res.status(400).json({
          token: "400",
          response: "userId is required and cannot be empty",
        });
      }

      const existingJson = await db
        .collection(CollectionName)
        .findOne({ userId });
      if (!existingJson) {
        return res.status(404).json({
          token: "404",
          response: "records not found with the provided userId",
        });
      }

      const updatedJson = {
        userName: req.body.userName || existingJson.userName,
        orgId: req.body.orgId || existingJson.orgId,
        shiftId: req.body.shiftId || existingJson.shiftId,
        groups: req.body.groups || existingJson.groups,
        roles: req.body.roles || existingJson.roles
      };

      await db
        .collection(CollectionName)
        .updateOne({ userId }, { $set: updatedJson });

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

  const get_users_app= async function (req, res, next) {
    try {
      const db = await connectToMongoDB();
      const usersCollection = process.env.USERS_COLLECTION;
      const appsCollection = process.env.APPS_COLLECTION;

      const { userId } = req.body;

      if (!userId || userId.trim() === "") {
        return res.status(400).json({
          token: "400",
          response: "userId is required and cannot be empty",
        });
      }

      // Find the user by userId
      const user = await db.collection(usersCollection).findOne({ userId });
      if (!user) {
        return res.status(404).json({
          token: "404",
          response: "User not found with the provided userId",
        });
      }

      const orgId = user.orgId?.id; // Extract orgId
      if (!orgId) {
        return res.status(404).json({
          token: "404",
          response: "Organization ID not found for the user",
        });
      }

      // Find applications associated with the orgId
      const apps = await db.collection(appsCollection).find({ "orgId.id": orgId }).toArray();
      if (!apps.length) {
        return res.status(404).json({
          token: "404",
          response: "No applications found for the user's organization",
        });
      }

      // Extract required app details
      const appDetails = apps.map(app => ({
        appId: app.appId,
        appName: app.appName
      }));

      return res.json({
        token: "200",
        response: "Successfully retrieved applications",
        user: {
          userId: user.userId,
          userName: user.userName,
          orgId: user.orgId,
        },
        apps: appDetails,
      });
    } catch (err) {
      console.error("Error while fetching user apps:", err);
      return res.status(500).json({
        token: "500",
        response: "Failed to retrieve user apps",
        error: err.message,
      });
    }
  };

  const delete_user = async function (req, res, next) {
    try {
      const db = await connectToMongoDB();
      const collectionName = process.env.USERS_COLLECTION;
  
      const id = req.params.id;
  
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ token: "400", response: "Invalid ID format" });
      }
  
      const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });
  
      if (result.deletedCount === 1) {
        return res.json({ token: "200", id, response: "user deleted successfully" });
      } else {
        return res.status(404).json({ token: "404", response: "user not found" });
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
export default {post_users, get_users, get_user_ID, get_users_app, update_users, delete_user};