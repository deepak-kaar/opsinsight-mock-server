import { connectToMongoDB } from '../../../config/connection.js';
import dotenv from 'dotenv';
import { ObjectId, Long } from "mongodb";
dotenv.config();

const post_notification = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.NOTIFICATION_COLLECTION;
        const newNotificationObjectId = new ObjectId();
        const notificationId = newNotificationObjectId.toHexString();
        const notificationSchema = {
            _id: newNotificationObjectId,
            notificationId: notificationId,
            notificationName: req.body.notificationName,
            notificationDescription: req.body.notificationDescription,
            notificationType: req.body.notificationType,
            notificationLevel: req.body.notificationLevel,
            notificationBody: req.body.notificationBody,
            notificationLevelName: req.body.notificationLevelName,
            notificationOrgLevel: req.body.notificationOrgLevel,
            inputVariables: req.body.inputVariables
        };
        const result = await db.collection(collectionName).insertOne(notificationSchema);
        return res.json({ token: '200', message: 'Notification Created Successfully' });
    } catch (err) {
        return next(err);
    }
};

const update_notification = async function (req, res, next) {
    try {
        const { notificationId, notificationName, notificationDescription, notificationType, notificationBody,inputVariables } = req.body;
        if (!notificationId || notificationId.trim() === "") {
            return res.status(204).json({
                token: '204',
                response: 'notificationId is required and cannot be empty'
            });
        }

        const db = await connectToMongoDB();
        const notificationCollectionName = process.env.NOTIFICATION_COLLECTION;

        const existingFlag = await db.collection(notificationCollectionName).findOne({ notificationId });

        if (!existingFlag) {
            return res.status(204).json({
                token: '204',
                response: 'Notification not found with the provided Notification Id'
            });
        }

        const updatedNotificationDetails = {
            notificationName,
            notificationDescription,
            notificationType: notificationType,
            notificationBody: notificationBody,
            inputVariables: inputVariables
        };

        const notifUpdate = await db.collection(notificationCollectionName).updateOne(
            { notificationId },
            { $set: updatedNotificationDetails }
        );

        return res.json({
            token: '200',
            response: 'Successfully updated Notification in database',
        });
    } catch (err) {
        console.error('Error updating in Notification:', err);
        return res.status(500).json({
            token: '500',
            response: 'Failed to update Notification',
            error: err.message
        });
    }
};

const get_notifications = async (req, res, next) => {
    try {
        let filters = {};
        const appId = req.body.appId;
        const orgId = req.body.orgId;

        filters = {
            ...(appId && { notificationLevelName: appId }),
            ...(orgId && { notificationOrgLevel: orgId }),
            ...(!appId && !orgId && { entityLevel: 'Opsinsight' })
        };
        const db = await connectToMongoDB();
        const collectionName = process.env.NOTIFICATION_COLLECTION;

        const result = await db.collection(collectionName).find({}).toArray();
        return res.json({ token: '200', Notifications: result });
    } catch (err) {
        return next(err);
    }
};

const get_notification = async (req, res, next) => {
    try {
        const notificationId = req.params.id;
        if (!notificationId)
            return res.status(412).json({ token: '412', message: 'Notification Id is required' })
        const db = await connectToMongoDB();
        const collectionName = process.env.NOTIFICATION_COLLECTION;

        const result = await db.collection(collectionName).findOne({ notificationId: notificationId });
        return res.json({ token: '200', Notification: result });
    } catch (err) {
        return next(err);
    }
};

const delete_notification = async function (req, res, next) {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.NOTIFICATION_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ token: "400", response: "Invalid ID format" });
        }

        const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
            return res.json({ token: "200", id, response: "Notification deleted successfully" });
        } else {
            return res.status(404).json({ token: "404", response: "Notification not found" });
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
export default { post_notification, get_notifications, delete_notification, get_notification, update_notification };