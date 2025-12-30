import { connectToMongoDB } from '../../config/connection.js';
import LoggerService from '../../services/logger.service.js';
import dotenv from 'dotenv';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';

dotenv.config();

const post_config = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.CONFIG_COLLECTION;

        const { configName, configValue, configData, createdBy, createdOn, appId, appName } = req.body;

        const newObjectId = new ObjectId();

        if (!configName || !configValue) {
            return res.status(400).json({
                token: '400',
                response: 'Config details is required and cannot be empty'
            });
        }

        const ConfigSchema = {
            _id: newObjectId,
            configId: newObjectId.toHexString(),
            configName: configName,
            configValue: configValue,
            configData: configData,
            createdBy: createdBy,
            appId: appId,
            appName: appName,
            createdOn: new Date()
        };

        const result = await db.collection(collectionName).insertOne(ConfigSchema);

        await LoggerService.logEvent({
            level: "info",
            category: "CONFIG_CREATE",
            action: "CREATE_CONFIG_SUCCESS",
            user: LoggerService.extractUserInfo(req),
            data: { configId: ConfigSchema.configId, configName },
            performance: { responseTime: LoggerService.calculateResponseTime(process.hrtime()) }
        }, LoggerService.MODULES.CONFIG);

        return res.json({ token: '200', Config: ConfigSchema });
    } catch (err) {
        await LoggerService.logError({
            level: "error",
            category: "CONFIG_CREATE",
            action: "CREATE_CONFIG_FAILED",
            user: LoggerService.extractUserInfo(req),
            error: { message: err.message, stack: err.stack }
        }, LoggerService.MODULES.CONFIG);

        return next(err);
    }
};

const get_config = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.CONFIG_COLLECTION;

        let filters = {};
        const appId = req.query.appId;

        if (appId) {
            filters.appId = appId;
        }

        const result = await db.collection(collectionName).find({ ...filters }).toArray();

        await LoggerService.logEvent({
            action: "FETCH_CONFIG_RECORDS",
            resourceType: "CONFIG",
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            resultCount: result.length,
            filters: filters,
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);

        return res.json({ token: '200', Config: result });
    } catch (err) {
        await LoggerService.logError({
            action: "FETCH_CONFIG_RECORDS",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);
        return next(err);
    }
};

const get_config_dropdown = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.CONFIG_COLLECTION;

        const filters = {};
        const appId = req.query.appId;

        if (appId) {
            filters.appId = appId;
        }

        const result = await db.collection(collectionName)
            .find(filters, { projection: { _id: 1, configName: 1 } })
            .toArray();

        const formatted = result.map(item => ({
            id: item._id?.toString(),
            name: item.configName
        }));

        await LoggerService.logEvent({
            action: "FETCH_CONFIG_DROPDOWN",
            resourceType: "CONFIG",
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            resultCount: result.length,
            filters: filters,
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);

        return res.json({ token: '200', config: formatted });

    } catch (err) {
        await LoggerService.logError({
            action: "FETCH_CONFIG_DROPDOWN",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);
        return next(err);
    }
};


const get_config_by_id = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.CONFIG_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            await LoggerService.logError({
                action: "FETCH_CONFIG_BY_ID",
                error: new Error("Invalid ID format"),
                userInfo: LoggerService.extractUserInfo(req),
                requestData: { id },
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.CONFIG);
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        const result = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        await LoggerService.logEvent({
            action: "FETCH_CONFIG_BY_ID",
            resourceType: "CONFIG",
            resourceId: id,
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            found: !!result,
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);

        if (!result) {
            return res.status(404).json({ token: '404', response: 'Config not found' });
        }

        return res.json({ token: '200', Config: result });
    } catch (err) {
        await LoggerService.logError({
            action: "FETCH_CONFIG_BY_ID",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);
        return next(err);
    }
};

const update_config = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.CONFIG_COLLECTION;

        const id = req.params.id;
        const { configName, configValue, configData, modifiedBy } = req.body;

        if (!ObjectId.isValid(id)) {
            await LoggerService.logError({
                action: "UPDATE_CONFIG",
                error: new Error("Invalid ID format"),
                userInfo: LoggerService.extractUserInfo(req),
                requestData: LoggerService.sanitizePayload(req.body),
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.CONFIG);
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        const existingConfig = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        const updateData = {
            ...(configName && { configName }),
            ...(configValue && { configValue }),
            ...(configData !== undefined && { configData }),
            modifiedBy: modifiedBy,
            modifiedOn: new Date()
        };

        const result = await db.collection(collectionName).updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            await LoggerService.logError({
                action: "UPDATE_CONFIG",
                error: new Error("Config not found"),
                userInfo: LoggerService.extractUserInfo(req),
                requestData: LoggerService.sanitizePayload(req.body),
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.CONFIG);
            return res.status(404).json({ token: '404', response: 'Config not found' });
        }

        const updatedConfig = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        await LoggerService.logAudit({
            action: "UPDATE_CONFIG",
            resourceType: "CONFIG",
            resourceId: id,
            userInfo: LoggerService.extractUserInfo(req),
            dataBefore: LoggerService.sanitizePayload(existingConfig),
            dataAfter: LoggerService.sanitizePayload(updatedConfig),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);

        return res.json({ token: '200', Config: updatedConfig, response: 'Config updated successfully' });
    } catch (err) {
        await LoggerService.logError({
            action: "UPDATE_CONFIG",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            requestData: LoggerService.sanitizePayload(req.body),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);
        return next(err);
    }
};

const delete_config = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.CONFIG_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            await LoggerService.logError({
                action: "DELETE_CONFIG",
                error: new Error("Invalid ID format"),
                userInfo: LoggerService.extractUserInfo(req),
                requestData: { id },
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.CONFIG);
            return res.status(400).json({ token: '400', response: 'Invalid ID format' });
        }

        const existingConfig = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });

        const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
            await LoggerService.logAudit({
                action: "DELETE_CONFIG",
                resourceType: "CONFIG",
                resourceId: id,
                userInfo: LoggerService.extractUserInfo(req),
                dataBefore: LoggerService.sanitizePayload(existingConfig),
                requestMetadata: LoggerService.extractRequestMetadata(req),
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.CONFIG);
            return res.json({ token: '200', id, response: 'Config deleted successfully' });
        } else {
            await LoggerService.logError({
                action: "DELETE_CONFIG",
                error: new Error("Config not found"),
                userInfo: LoggerService.extractUserInfo(req),
                requestData: { id },
                responseTime: LoggerService.calculateResponseTime(startTime)
            }, LoggerService.MODULES.CONFIG);
            return res.status(404).json({ token: '404', response: 'Config not found' });
        }
    } catch (err) {
        await LoggerService.logError({
            action: "DELETE_CONFIG",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            requestData: { id },
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);
        return next(err);
    }
};
const encrypt_value = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const { value } = req.body;

        if (!value) {
            return res.status(400).json({
                token: '400',
                response: 'Value is required for encryption'
            });
        }

        // Use AES-256-CBC encryption
        const algorithm = 'aes-256-cbc';
        const secretKey = process.env.ENCRYPTION_KEY || 'default-secret-key-32-characters!';
        const key = crypto.scryptSync(secretKey, 'salt', 32);
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Combine IV and encrypted data
        const encryptedValue = iv.toString('hex') + ':' + encrypted;

        await LoggerService.logEvent({
            action: "ENCRYPT_VALUE",
            resourceType: "CONFIG_ENCRYPTION",
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);

        return res.json({
            token: '200',
            encryptedValue: encryptedValue,
            message: 'Value encrypted successfully'
        });
    } catch (err) {
        await LoggerService.logError({
            action: "ENCRYPT_VALUE",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);
        return next(err);
    }
};

const decrypt_value = async (req, res, next) => {
    const startTime = process.hrtime();
    try {
        const { encryptedValue } = req.body;

        if (!encryptedValue) {
            return res.status(400).json({
                token: '400',
                response: 'Encrypted value is required for decryption'
            });
        }

        // Use AES-256-CBC decryption
        const algorithm = 'aes-256-cbc';
        const secretKey = process.env.ENCRYPTION_KEY || 'default-secret-key-32-characters!';
        const key = crypto.scryptSync(secretKey, 'salt', 32);

        // Split IV and encrypted data
        const parts = encryptedValue.split(':');
        if (parts.length !== 2) {
            return res.status(400).json({
                token: '400',
                response: 'Invalid encrypted value format'
            });
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        await LoggerService.logEvent({
            action: "DECRYPT_VALUE",
            resourceType: "CONFIG_DECRYPTION",
            userInfo: LoggerService.extractUserInfo(req),
            requestMetadata: LoggerService.extractRequestMetadata(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);

        return res.json({
            token: '200',
            decryptedValue: decrypted,
            message: 'Value decrypted successfully'
        });
    } catch (err) {
        await LoggerService.logError({
            action: "DECRYPT_VALUE",
            error: err,
            userInfo: LoggerService.extractUserInfo(req),
            responseTime: LoggerService.calculateResponseTime(startTime)
        }, LoggerService.MODULES.CONFIG);

        return res.status(400).json({
            token: '400',
            response: 'Failed to decrypt value. Please check if the value is properly encrypted.'
        });
    }
};

export default { post_config, get_config, get_config_by_id, update_config, delete_config, get_config_dropdown, encrypt_value, decrypt_value };