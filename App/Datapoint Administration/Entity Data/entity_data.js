import { connectToMongoDB } from '../../../config/connection.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const get_entitydata = async function (req, res, next) {
    try {
        const entityId = req.params.id
        const db = await connectToMongoDB();
        // const result=[]
        // const entityDataCollectionName = process.env.ENTITY_DATA_COLLECTION;
        const entityCollectionName = process.env.ENTITY_COLLECTION;

        const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
        const instances = await db.collection('Instance')
            .find({ entityLookupId: entityId })
            .toArray();
        const instanceIds = instances.map(instance => instance.instanceId);
        const allAttributes = await db.collection(attributeCollectionName)
            .find(
                { instanceId: { $in: instanceIds } },
                { projection: { instanceId: 1, attributeName: 1, value: 1, _id: 0 } }
            )
            .toArray();

        const attributesByInstanceId = {};
        for (const attribute of allAttributes) {
            if (!attributesByInstanceId[attribute.instanceId]) {
                attributesByInstanceId[attribute.instanceId] = [];
            }
            attributesByInstanceId[attribute.instanceId].push(attribute);
        }

        const result = instances.map(instance => {
            const instanceAttributes = attributesByInstanceId[instance.instanceId] || [];
            const resObj = {};
            for (const attribute of instanceAttributes) {
                resObj[attribute.attributeName] = attribute.value;
            }

            return {
                data: resObj,
                entityOrInstanceId: instance.instanceId,
                type: 'Instance'
            };
        });



        // const projection = { DataType: 1, _id: 0 };
        // const result = await db.collection(entityDataCollectionName).find({ entityOrInstanceId: entityId }).toArray();
        if (result) {
            // return res.json({ token: '200', Entity_Attribute: result });
            return res.status(200).json(result);
        } else {
            return res.status(404).json({ error: 'Entity data not found' });
        }
    } catch (err) {
        console.error('Error fetching data from MongoDB:', err);
        return res.status(500).json({ error: 'Error fetching data from MongoDB', details: err.message });
    }
};
const post_entitydata = async function (req, res, next) {
    try {
        // const entityDataCollectionName = process.env.ENTITY_DATA_COLLECTION;
        // const instanceCollectionName = process.env.INSTANCE_COLLECTION;
        // const entityCollectionName = process.env.ENTITY_COLLECTION;
        // const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
        // const entityData = await db.collection(entityCollectionName).findOne({ entityId: req.body.entityOrInstanceId });
        // const attributeData = await db.collection(attributeCollectionName).find({ entityId: req.body.entityOrInstanceId }).toArray();
        // const inputData = req.body?.data;
        // const newObjectId = new ObjectId();
        // const instanceId = newObjectId.toHexString();

        // const instanceSchema = {
        //     _id: newObjectId,
        //     type: 'Instance',
        //     instanceId,
        //     instanceName: '',
        //     instanceDesc: '',
        //     instanceLevel: 'Application',
        //     instanceLevelName: entityData?.entityLevelName,
        //     entityLookupId: req.body.entityOrInstanceId,
        //     entityFormId: null,
        //     createdOn: new Date(),
        // }

        // const instanceResult = await db
        //     .collection(instanceCollectionName)
        //     .insertOne(instanceSchema);

        // for (let i = 0; i < attributeData.length; i++) {
        //     const attribute = attributeData[i];
        //     const newObjectId = new ObjectId();
        //     const attributeId = newObjectId.toHexString();

        //     const value = inputData.hasOwnProperty(attribute.attributeName)
        //         ? inputData[attribute.attributeName]
        //         : attribute.value;


        //     const attributeDocument = {
        //         _id: newObjectId,
        //         instanceId: attribute.entityId,
        //         attributeId: attributeId,
        //         attributeName: attribute.attributeName,
        //         dataPointID: {
        //             dataType: attribute.dataPointID.dataType,
        //             dataTypeId: attribute.dataPointID.dataTypeId,
        //         },
        //         minValue: attribute.minValue,
        //         maxValue: attribute.maxValue,
        //         defaults: attribute.defaults,
        //         isLookup: attribute.isLookup,
        //         validationRule: attribute.validationRule,
        //         acceptedQuality: attribute.acceptedQuality,
        //         unique: attribute.unique,
        //         isNull: attribute.nullable,
        //         decimalPlaces: attribute.decimalPlaces,
        //         engineeringUnit: attribute.engineeringUnit,
        //         comments: attribute.comments,
        //         dataSource: attribute.dataSource,
        //         authorizationID: attribute.authorizationID,
        //         value: value,
        //         isActive: attribute.isActive,
        //         lookupId: attribute.lookupId,
        //         collection: attribute.collection,
        //         timeSeries: attribute.timeSeries,
        //         timeFrequency: attribute.timeFrequency,
        //         calculationTotal: attribute.calculationTotal,
        //         calculationAverage: attribute.calculationAverage,
        //         displayComponent: attribute.displayComponent,
        //         lookupAttribute: attribute.lookupAttribute,
        //         alias: attribute.alias,
        //         createdOn: new Date(),
        //         order: i,
        //     };
        //     await db.collection(attributeCollectionName).insertOne(attributeDocument);
        // }

        // const entityDataSchema = {
        //     _id: newObjectId,
        //     dataId: newObjectId.toHexString(),
        //     entityOrInstanceId: req.body.entityOrInstanceId,
        //     type: req.body.type,
        //     data: req.body.data,
        //     createdOn: new Date()
        // };

        // const result = await db.collection(entityDataCollectionName).insertOne(entityDataSchema);

        const db = await connectToMongoDB();
        const instanceCollectionName = process.env.INSTANCE_COLLECTION;
        const entityCollectionName = process.env.ENTITY_COLLECTION;
        const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
        const entityOrInstanceId = req.body.entityOrInstanceId;
        const inputData = req.body?.data || {};

        const [entityData, attributeData] = await Promise.all([
            db.collection(entityCollectionName).findOne(
                { entityId: entityOrInstanceId }
            ),
            db.collection(attributeCollectionName).find(
                { entityId: entityOrInstanceId }
            ).toArray()
        ]);

        const newObjectId = new ObjectId();
        const instanceId = newObjectId.toHexString();

        const instanceSchema = {
            _id: newObjectId,
            type: 'Instance',
            instanceId,
            instanceName: Object.values(inputData)[0] + ' Instance',
            instanceDesc: 'Instance for ' + Object.values(inputData)[0],
            instanceLevel: entityData?.entityLevel,
            instanceLevelName: entityData?.entityLevelName,
            instanceOrgLevel: entityData?.entityOrgLevel,
            entityLookupId: entityOrInstanceId,
            entityFormId: null,
            isMasterDataInstance: true,
            createdOn: new Date(),
        };

        const attributeDocuments = attributeData.map((attribute, i) => {
            const newAttributeId = new ObjectId();
            return {
                _id: newAttributeId,
                instanceId: instanceId,
                attrLevel:'Instance',
                attributeId: newAttributeId.toHexString(),
                attributeName: attribute.attributeName,
                dataPointID: {
                    dataType: attribute.dataPointID.dataType,
                    dataTypeId: attribute.dataPointID.dataTypeId,
                },
                minValue: attribute.minValue,
                maxValue: attribute.maxValue,
                defaults: attribute.defaults,
                isLookup: attribute.isLookup,
                validationRule: attribute.validationRule,
                acceptedQuality: attribute.acceptedQuality,
                unique: attribute.unique,
                isNull: attribute.nullable,
                decimalPlaces: attribute.decimalPlaces,
                engineeringUnit: attribute.engineeringUnit,
                comments: attribute.comments,
                dataSource: attribute.dataSource,
                authorizationID: attribute.authorizationID,
                value: inputData.hasOwnProperty(attribute.attributeName)
                    ? inputData[attribute.attributeName]
                    : attribute.value,
                isActive: attribute.isActive,
                lookupId: attribute.lookupId,
                collection: attribute.collection,
                timeSeries: attribute.timeSeries,
                timeFrequency: attribute.timeFrequency,
                calculationTotal: attribute.calculationTotal,
                calculationAverage: attribute.calculationAverage,
                displayComponent: attribute.displayComponent,
                lookupAttribute: attribute.lookupAttribute,
                alias: attribute.alias,
                createdOn: new Date(),
                order: i,
            };
        });

        if (attributeDocuments.length > 0) {
            await Promise.all([
                db.collection(instanceCollectionName).insertOne(instanceSchema),
                db.collection(attributeCollectionName).insertMany(attributeDocuments)
            ]);
        } else {
            await db.collection(instanceCollectionName).insertOne(instanceSchema);
        }
        return res.json({ token: '200', response: 'Instance Created Successfully' });
    } catch (err) {
        console.error('Error creating entity data:', err);
        return res.status(500).json({ token: '500', response: 'Failed to create entity data', error: err.message });
    }
};
const get_data = async (req, res) => {
    try {
        const db = await connectToMongoDB();
        const instanceId = req.body.instanceId;
        // const dataId = req.body.dataId;
        // const entityOrInstanceId = req.body.entityId;
        // const entityCollectionName = process.env.ENTITY_DATA_COLLECTION;
        const attributeCollection = process.env.ATTRIBUTE_COLLECTION;
        // const data = await db.collection(entityCollectionName).findOne({ dataId: dataId });
        const schema = await db.collection(attributeCollection).find({ instanceId: instanceId }).toArray();
        // let finalSchema = await Promise.all(
        //     schema.map(async (item) => {
        //         // const formValue = data.data[item.attributeName];
        //         if (item.isLookup && item.lookupId !== null) {
        //             const attrList = await getLookupDatas(
        //                 item.lookupId.entityId,
        //                 item.lookupAttribute.attributeName
        //             );
        //             return { ...item, attrList };
        //         }

        //         return { ...item, formValue };
        //     })
        // );

        return res.json({ token: '200', response: 'Successfully created in database', data: schema });
        // return res.json({ token: '200', response: 'Successfully created in database', data: finalSchema });
    }
    catch (err) {
        console.error('Error getting entity data:', err);
        return res.status(500).json({ token: '500', response: 'Failed to get entity data', error: err.message });
    }

};
const update_entitydata = async function (req, res, next) {
    try {
        const db = await connectToMongoDB();
        const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
        const { instanceId, data } = req.body;

        if (!instanceId || !data) {
            return res.status(400).json({ token: '400', response: 'Missing required fields: dataId and data' });
        }

        const attributes = await db.collection(attributeCollectionName).find({ instanceId: instanceId }).toArray();

        // preparing data for bulk operation
        const bulkOps = attributes.map(attribute => {
            const value = data.hasOwnProperty(attribute.attributeName)
                ? data[attribute.attributeName]
                : attribute.value;

            return {
                updateOne: {
                    filter: { attributeId: attribute.attributeId },
                    update: { $set: { value: value } }
                }
            };
        });

        // Execute all updates in a single database operation if there are operations to perform
        if (bulkOps.length > 0) {
            const result = await db.collection(attributeCollectionName).bulkWrite(bulkOps);
            result;
            if (result.matchedCount === 0) {
                return res.status(404).json({ token: '404', response: 'No matching record found for the given dataId' });
            }
            return res.json({ token: '200', response: 'Successfully updated data', Flag: data });
        }

        // const entityCollectionName = process.env.ENTITY_DATA_COLLECTION;
        // const { dataId, data } = req.body;

        // if (!dataId || !data) {
        //     return res.status(400).json({ token: '400', response: 'Missing required fields: dataId and data' });
        // }

        // const filter = { dataId: dataId };
        // const update = { $set: { data: data } };

        // const result = await db.collection(entityCollectionName).updateOne(filter, update);

        // if (result.matchedCount === 0) {
        //     return res.status(404).json({ token: '404', response: 'No matching record found for the given dataId' });
        // }
        // return res.json({ token: '200', response: 'Successfully updated data', Flag: data });

    } catch (err) {
        console.error('Error updating entity data:', err);
        return res.status(500).json({ token: '500', response: 'Failed to update entity data', error: err.message });
    }
};
const delete_entitydata = async function (req, res, next) {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.ENTITY_DATA_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ token: "400", response: "Invalid ID format" });
        }

        const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
            return res.json({ token: "200", id, response: "entitydata deleted successfully" });
        } else {
            return res.status(404).json({ token: "404", response: "entitydata not found" });
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
async function getLookupDatas(entityId, attributeName) {
    try {
        const entityCollectionName = process.env.ENTITY_DATA_COLLECTION;
        const db = await connectToMongoDB();
        const results = await db.collection(entityCollectionName).find({ entityOrInstanceId: entityId }).project({ [`data.${attributeName}`]: 1, _id: 0 }).toArray();
        const values = results.map(item => item.data[attributeName]).filter(value => value !== undefined);
        return values;
    } catch (error) {
        console.error(error);
        return [];
    }
}

export default { get_entitydata, post_entitydata, get_data, update_entitydata, delete_entitydata };
