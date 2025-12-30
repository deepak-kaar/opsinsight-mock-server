import { connectToMongoDB } from '../../../config/connection.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

  const post_group= async function (req, res, next) {
        try {
            const db = await connectToMongoDB();
            const groupsCollectionName = process.env.GROUPS_COLLECTION;

            const newObjectId = new ObjectId();

            const groupSchema = {
                _id: newObjectId,
                groupId: newObjectId.toHexString(),
                groupName: req.body.groupName,
                groupName: req.body.groupName,
                groupDescription: req.body.groupDescription,
                orgId: req.body.orgId,
                appId: req.body.appId,
                roles: req.body.roles,
                createdOn: new Date()
            };

            const result = await db.collection(groupsCollectionName).insertOne(groupSchema);
            return res.json({ token: '200', response: 'Successfully created in database', Group: groupSchema });
        } catch (err) {
            console.error('Error creating instance:', err);
            return res.status(500).json({ token: '500', response: 'Failed to create Groups records', error: err.message });
        }
    };

  const get_group= async function (req, res, next) {
        try {
            const db = await connectToMongoDB();
            const groupsCollectionName = process.env.GROUPS_COLLECTION;
            const orgId = req.body.orgId;

            // const projection = { DataType: 1, _id: 0 };
            const result = await db.collection(groupsCollectionName).find({orgId: orgId}).toArray();
            if (result) {
                return res.json({ token: '200', Groups: result });
            } else {
                return res.status(404).json({token: "404", error: 'Groups not found' });
            }
        } catch (err) {
            console.error('Error fetching data from MongoDB:', err);
            return res.status(500).json({ error: 'Error fetching data from MongoDB', details: err.message });
        }
    };

  const get_group_ID= async function (req, res, next) {
        try {
            const db = await connectToMongoDB();
            const CollectionName = process.env.GROUPS_COLLECTION;

            const grpId = req.params.id;

            if (!ObjectId.isValid(grpId)) {
                return res.status(204).json({ error: 'Invalid grpId' });
            }

            const grpJson = await db.collection(CollectionName).find({ groupId: grpId }).toArray();

            if (grpJson.length > 0) {
                return res.status(200).json({
                    token: '200',
                    response: 'Successfully fetched grp Json',
                    grpJson
                });
            } else {
                return res.status(204).json({ error: 'No grp found for this Id' });
            }
        } catch (err) {
            console.error('Error fetching grpJson:', err);
            return res.status(500).json({
                error: 'Error fetching grpJson',
                details: err.message
            });
        }
    };

  const update_group= async function (req, res, next) {
        try {
          const db = await connectToMongoDB();
          const CollectionName = process.env.GROUPS_COLLECTION;
    
          const { groupId } = req.body;
    
          if (!groupId || groupId.trim() === "") {
            return res.status(400).json({
              token: "400",
              response: "groupId is required and cannot be empty",
            });
          }
    
          const existingGroup = await db
            .collection(CollectionName)
            .findOne({ groupId });
          if (!existingGroup) {
            return res.status(404).json({
              token: "404",
              response:"records not found with the provided groupId",
            });
          }
    
          const updatedGroup = {
            groupName: req.body.groupName || existingGroup.groupName,
            orgId:
              req.body.orgId || existingGroup.orgId,
              roles:
              req.body.roles || existingGroup.roles,
              groupName: req.body.groupName || existingGroup.groupName,
                groupDescription: req.body.groupDescription || existingGroup.groupDescription,
                appId: req.body.appId || existingGroup.appId,
          };
    
          await db
            .collection(CollectionName)
            .updateOne({ groupId }, { $set: updatedGroup });
    
          return res.json({
            token: "200",
            response: "Successfully updated",
            updatedGroup,
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

  const delete_group = async function (req, res, next) {
        try {
          const db = await connectToMongoDB();
          const collectionName = process.env.GROUPS_COLLECTION;
      
          const id = req.params.id;
      
          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ token: "400", response: "Invalid ID format" });
          }
      
          const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });
      
          if (result.deletedCount === 1) {
            return res.json({ token: "200", id, response: "Group deleted successfully" });
          } else {
            return res.status(404).json({ token: "404", response: "Group not found" });
          }
        } catch (err) {
          console.error("Error deleting Group from MongoDB:", err);
          return res.status(500).json({
            token: "500",
            response: "Error deleting Group from MongoDB",
            error: err.message,
          });
        }
      };
export default {post_group, get_group, get_group_ID, update_group, delete_group};