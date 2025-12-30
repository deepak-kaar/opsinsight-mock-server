import { connectToMongoDB } from '../../../config/connection.js';
// const utils = require('../../../utils');
import { ObjectId } from "mongodb";
import { all } from "axios";
import moment from "moment";

import dotenv from 'dotenv';
import { filter } from 'mathjs';
dotenv.config();

const post_entity = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const entityCollectionName = process.env.ENTITY_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const auditCollectionName = process.env.HISTORY_COLLECTION;
    const appCollectionName = process.env.APPS_COLLECTION;
    const orgsCollectionName = process.env.ORGANIZATION_COLLECTION;
    const newEntityObjectId = new ObjectId();
    const entityId = newEntityObjectId.toHexString();
    const entityName = req.body.entityName;

    if (!entityName || entityName.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "entityName is required and cannot be empty",
      });
    }

    const existingEntity = await db
      .collection(entityCollectionName)
      .findOne({ entityName });

    if (existingEntity) {
      return res.status(400).json({
        token: "400",
        response:
          "Entity with the provided entityName already exists",
      });
    }

    const entitySchema = {
      _id: newEntityObjectId,
      type: req.body.type,
      entityId,
      entityName,
      entityDesc: req.body.entityDesc,
      entityLevel: req.body.entityLevel,
      entityLevelName: req.body.entityLevelName,
      entityOrgLevel: req.body?.entityOrgLevel || null,
      entityLookupId: req.body.entityLookupId,
      isEntityOrInstance: req.body.isEntityOrInstance,
      entityFormId: req.body.entityFormId,
      createdOn: new Date(),
    };

    const entityResult = await db
      .collection(entityCollectionName)
      .insertOne(entitySchema);

    // Log entity creation in audit_logs
    const auditEntry = {
      entityId,
      collectionName: entityCollectionName,
      operation: "INSERT",
      before: null,
      after: entitySchema,
      modifiedFields: Object.keys(entitySchema),
      performedBy: req.user ? req.user.username : "system",
      timestamp: new Date(),
    };
    await db.collection(auditCollectionName).insertOne(auditEntry);

    // ----------------------------------------------
    // Load App & Organization (Optional)
    // ----------------------------------------------
    let projectApp = null;
    let projectOrg = null;

    const appId = req.body.appId;
    const orgId = req.body.orgId;

    // ---- APP LOOKUP ----
    if (appId) {
      const appDoc = await db
        .collection(appCollectionName)
        .findOne({ appId });

      // If found: take appId + appName
      if (appDoc) {
        projectApp = {
          appId: appDoc.appId,
          appName: appDoc.appName
        };
      }
    }

    // ---- ORG LOOKUP ----
    if (orgId) {
      const orgDoc = await db
        .collection(orgsCollectionName)
        .findOne({ orgId });

      if (orgDoc) {
        projectOrg = {
          orgId: orgDoc.orgId,
          orgName: orgDoc.orgName
        };
      }
    }


    const attributePromises = req.body.entityAttribute.map(
      async (attribute) => {
        const newAttributeObjectId = new ObjectId();

        //  added unique lookup and lookUp and commented min,max and parentEntity field and by rangarao
        const attributeDocument = {
          _id: newAttributeObjectId,
          entityId,
          attributeId: newAttributeObjectId.toHexString(),
          attrLevel: 'Entity',
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
          isNull: attribute.isNull,
          decimalPlaces: attribute.decimalPlaces,
          engineeringUnit: attribute.engineeringUnit,
          comments: attribute.comments,
          dataSource: attribute.dataSource,
          authorizationID: attribute.authorizationID,
          value: attribute.value,
          isActive: attribute.isActive,
          lookupId: attribute.lookupId,
          collection: attribute.collection,
          timeSeries: attribute.timeSeries,
          timeSeriesValue: attribute.timeSeriesValue,
          timeFrequency: attribute.timeFrequency,
          calculationTotal: attribute.calculationTotal,
          calculationAverage: attribute.calculationAverage,
          displayComponent: attribute.displayComponent,
          lookupAttribute: attribute.lookupAttribute,
          order: attribute.order,
          alias: attribute.alias,
          attributeLevel: req.body.entityLevel,
          tag: attribute.tag,
          dataTypeType: attribute.dataTypeType,
          attributeLevelName: req.body.entityLevelName,
          attributeOrgLevel: req.body.entityOrgLevel || null,
          attributes: attribute.attributes,
          appId: projectApp?.appId || "",
          appName: projectApp?.appName || "",
          orgId: projectOrg?.orgId || "",
          orgName: projectOrg?.orgName || ""

        };

        await db
          .collection(attributeCollectionName)
          .insertOne(attributeDocument);

        // Log attribute creation in audit_logs
        const attributeAuditEntry = {
          entityId,
          collectionName: attributeCollectionName,
          operation: "INSERT",
          before: null,
          after: attributeDocument,
          modifiedFields: Object.keys(attributeDocument),
          performedBy: req.user ? req.user.username : "system",
          timestamp: new Date(),
        };
        return db
          .collection(auditCollectionName)
          .insertOne(attributeAuditEntry);
      }
    );

    await Promise.all(attributePromises);

    return res.json({
      token: "200",
      response: "Successfully created entity and attributes in database",
      entity: entitySchema,
      attributes: req.body.entityAttribute,
    });
  } catch (err) {
    console.error("Error creating entity and attributes:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to create entity and attributes",
      error: err.message,
    });
  }
};
const get_entity_sse = async function (req, res, next) {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const fetchData = async () => {
      try {
        const db = await connectToMongoDB();
        const collectionName = process.env.ENTITY_COLLECTION;

        const projection = { entityId: 1, entityName: 1, _id: 0 };
        const result = await db
          .collection(collectionName)
          .find({}, { projection })
          .toArray();
        sendEvent(result);
      } catch (err) {
        console.error("Error fetching data from MongoDB:", err);
        sendEvent({
          error: "Error fetching data from MongoDB",
          details: err.message,
        });
      }
    };

    // Fetch data periodically
    const intervalId = setInterval(fetchData, 5000); // Fetch data every 5 seconds

    req.on("close", () => {
      clearInterval(intervalId);
      res.end();
    });
  } catch (err) {
    console.error("Error setting up event stream:", err);
    return next(err);
  }
};

const get_entity_attributeByID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const datapointCollectionName = process.env.DATAPOINT_COLLECTION;
    const entityCollectionName = process.env.ENTITY_COLLECTION;

    const entityId = req.params.id;

    if (!ObjectId.isValid(entityId)) {
      return res.status(400).json({ error: "Invalid entityId" });
    }

    const projection = { _id: 0 };
    const entityDocuments = await db
      .collection(entityCollectionName)
      .findOne({ entityId: entityId }, { projection });
    const attributes = await db
      .collection(attributeCollectionName)
      .aggregate([
        {
          $match: { entityId: entityId },
        },
        {
          $lookup: {
            from: datapointCollectionName,
            localField: "dataPointID",
            foreignField: "dataTypeId",
            as: "datapointInfo",
          },
        },
        {
          $unwind: {
            path: "$datapointInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        //  added unique and lookup field by rangarao
        {
          $project: {
            _id: 1,
            entityId: 1,
            attributeId: 1,
            attributeName: 1,
            dataPointID: 1,
            minValue: 1,
            maxValue: 1,
            defaultValue: 1,
            isNull: 1,
            comments: 1,
            dataSource: 1,
            unique: 1,
            isLookup: 1,
            value: 1,
            datapointDataType: "$datapointInfo.dataType",
            displayName: "$datapointInfo.display_name",
            authorizationID: 1,
            isActive: 1,
            sensorDetails: 1,
            parentEntity: 1,
            parentEntityId: 1,
            lookupId: 1,
            defaults: 1,
            displayComponent: 1,
            lookupAttribute: 1,
            order: 1,
            alias: 1,
            collection: 1,
            timeSeries: 1,
            calculationTotal: 1,
            calculationAverage: 1,
            timeFrequency: 1,
            validationRule: 1,
            acceptedQuality: 1,
            decimalPlaces: 1,
            tag: 1,
            dataTypeType: 1,
            attributes: 1,
          },
        },
      ])
      .toArray();

    const attributesList = await Promise.all(
      attributes.map(async (item) => {
        if (item.isLookup && item.lookupId !== null) {
          try {
            const attrList = await db
              .collection(attributeCollectionName)
              .find(
                { entityId: item.lookupId.entityId },
                { projection: { attributeId: 1, attributeName: 1 } }
              )
              .toArray();
            return {
              ...item,
              attrList,
            };
          } catch (error) {
            console.error("Error fetching entity attributes:", error);
            return item;
          }
        }
        return item;
      })
    );

    if (attributes.length > 0) {
      return res.status(200).json({
        token: "200",
        response:
          "Successfully fetched entity attributes with datapoint information",
        entityDocuments,
        attributes: attributesList,
      });
    } else {
      return res
        .status(404)
        .json({ error: "No attributes found for this entityId" });
    }
  } catch (err) {
    console.error("Error fetching entity attributes:", err);
    return res.status(500).json({
      error: "Error fetching entity attributes",
      details: err.message,
    });
  }
};

const get_entity_attribute = async function (req, res, next) {
  try {

    const appId = req.body.appId;
    const orgId = req.body.orgId;


    let filters = {
      ...(appId && { entityLevelName: appId }),
      ...(orgId && { entityOrgLevel: orgId }),
      ...(!appId && !orgId && {
        $or: [
          { entityLevel: "Opsinsight" },
          { entityLevel: "Application" }
        ]
      })
    };

    const db = await connectToMongoDB();
    const collectionName = process.env.ENTITY_COLLECTION;

    let [allRecords, entities] = await Promise.all([
      db.collection('Instance').find({}).toArray(),
      db.collection(collectionName).find(filters).toArray()
    ]);

    let enrichedEntities = entities.map((entity) => {
      const instanceCount = allRecords.filter(
        (instance) =>
          instance.type === "Instance" &&
          instance.entityLookupId === entity.entityId
      ).length;

      return {
        ...entity,
        InstanceCount: instanceCount,
      };
    });

    if (appId) {
      enrichedEntities = enrichedEntities.filter(
        (entity) =>
          (entity.entityLevel === "Application" &&
            entity.entityLevelName === appId) ||
          entity.entityLevel === "Opsinsight"
      );
    }

    return res.json({
      token: "200",
      response: "Successfully fetched entities and counts",
      Entity_Attributes: enrichedEntities,
    });
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      token: "500",
      response: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};


const search_entity_attribute = async function (req, res, next) {
  try {
    const { appId, orgId, search = "", limit = 20 } = req.body || {};

    // ---- Base filters (same logic as get_entity_attribute) ----
    let filters = {
      ...(appId && { entityLevelName: appId }),
      ...(orgId && { entityOrgLevel: orgId }),
      ...(!appId && !orgId && {
        $or: [
          { entityLevel: "Opsinsight" },
          { entityLevel: "Application" }
        ]
      })
    };


    // ---- Add text search on entityId / entityName ----
    const trimmedSearch = (search || "").trim();
    if (trimmedSearch) {
      const regex = new RegExp(trimmedSearch, "i");
      filters = {
        ...filters,
        $or: [
          { entityId: regex },
          { entityName: regex }
        ]
      };
    }

    const db = await connectToMongoDB();
    const collectionName = process.env.ENTITY_COLLECTION;

    const entities = await db
      .collection(collectionName)
      .find(filters)
      .project({
        _id: 0,
        entityId: 1,
        entityName: 1,
        entityLevel: 1,
        entityLevelName: 1,
        entityOrgLevel: 1
      })
      .limit(Number(limit) || 20)
      .toArray();

    return res.json({
      token: "200",
      response: "Successfully fetched entity suggestions",
      Entity_Attributes: entities
    });

  } catch (err) {
    console.error("Error fetching entity suggestions:", err);
    return res.status(500).json({
      token: "500",
      response: "Error fetching data from MongoDB",
      details: err.message
    });
  }
};


const update_entity = async function (req, res, next) {
  try {
    const {
      entityId,
      type,
      entityName,
      entityDesc,
      entityAttribute,
      entityLevel,
      entityLevelName,
      entityOrgLevel,
      isEntityOrInstance,
      // entityLookupId,
      entityFormId,
    } = req.body;

    if (!entityId || entityId.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "entityId is required and cannot be empty",
      });
    }

    const db = await connectToMongoDB();
    const entityCollectionName = process.env.ENTITY_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const auditCollectionName = "audit_logs";

    // Fetch the existing entity before update
    const existingEntity = await db
      .collection(entityCollectionName)
      .findOne({ entityId });

    if (!existingEntity) {
      return res.status(404).json({
        token: "404",
        response: "Entity not found with the provided entityId",
      });
    }

    const updatedEntityDetails = {
      type,
      entityName,
      entityDesc,
      entityLevel,
      entityLevelName,
      entityOrgLevel,
      isEntityOrInstance,
      updatedOn: new Date(),
    };

    // Update the entity
    await db
      .collection(entityCollectionName)
      .updateOne({ entityId }, { $set: updatedEntityDetails });

    // Log the entity update in audit logs
    const entityAuditEntry = {
      entityId,
      collectionName: entityCollectionName,
      operation: "UPDATE",
      before: existingEntity,
      after: { ...existingEntity, ...updatedEntityDetails },
      modifiedFields: Object.keys(updatedEntityDetails),
      performedBy: req.user ? req.user.username : "system",
      timestamp: new Date(),
    };
    await db.collection(auditCollectionName).insertOne(entityAuditEntry);

    // Fetch existing attributes for audit comparison
    const existingAttributes = await db
      .collection(attributeCollectionName)
      .find({ entityId })
      .toArray();
    const attributePromises = entityAttribute.map(
      async (attribute) => {
        const filter = {
          entityId,
          attributeName: attribute.attributeName,
        };

        const existingAttribute = existingAttributes.find(
          (attr) => attr.attributeName === attribute.attributeName
        );

        // added lookup and unique field for update by rangarao
        const update = {
          $set: {
            // dataPointID: attribute.dataPointID,
            // authorizationID: attribute.authorizationID,
            // isLookup: attribute.isLookup,
            // unique: attribute.unique,
            // isActive: attribute.isActive,
            // lookupId: attribute.lookupId,
            // lookupAttribute: attribute.lookupAttribute,
            // order: attribute.order,
            // comments: attribute.comments,
            // dataSource: attribute.dataSource,
            // alias: attribute.alias

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
            isNull: attribute.isNull,
            decimalPlaces: attribute.decimalPlaces,
            engineeringUnit: attribute.engineeringUnit,
            comments: attribute.comments,
            dataSource: attribute.dataSource,
            authorizationID: attribute.authorizationID,
            value: attribute.value,
            isActive: attribute.isActive,
            lookupId: attribute.lookupId,
            collection: attribute.collection,
            timeSeries: attribute.timeSeries,
            timeSeriesValue: attribute.timeSeriesValue,
            timeFrequency: attribute.timeFrequency,
            calculationTotal: attribute.calculationTotal,
            calculationAverage: attribute.calculationAverage,
            displayComponent: attribute.displayComponent,
            lookupAttribute: attribute.lookupAttribute,
            order: attribute.order,
            alias: attribute.alias,
            attributeLevel: entityLevel,
            attributeLevelName: entityLevelName,
            attributeOrgLevel: entityOrgLevel,
            dataTypeType: attribute.dataTypeType,
            tag: attribute.tag,
            attributes: attribute.attributes
          },
          $setOnInsert: {
            _id: new ObjectId(),
            attributeId: new ObjectId().toHexString(),
          },
        };

        const result = await db
          .collection(attributeCollectionName)
          .updateOne(filter, update, { upsert: true });

        // Log attribute updates in audit logs
        const attributeAuditEntry = {
          entityId,
          collectionName: attributeCollectionName,
          operation: existingAttribute ? "UPDATE" : "INSERT",
          before: existingAttribute || null,
          after: { ...existingAttribute, ...update.$set },
          modifiedFields: Object.keys(update.$set),
          performedBy: req.user ? req.user.username : "system",
          timestamp: new Date(),
        };
        return db
          .collection(auditCollectionName)
          .insertOne(attributeAuditEntry);
      }
    );

    await Promise.all(attributePromises);

    return res.json({
      token: "200",
      response: "Successfully updated entity and attributes in database",
      entityUpdateResult: updatedEntityDetails,
      attributesUpdated: entityAttribute,
    });
  } catch (err) {
    console.error("Error updating entity and attributes:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to update entity and attributes",
      error: err.message,
    });
  }
};

const get_count_entity = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const Entitycollection = process.env.ENTITY_COLLECTION;
    const Eventcollection = process.env.EVENT_COLLECTION;
    const Sensorcollection = process.env.SENSOR_COLLECTION;
    const Flagcollection = process.env.FLAG_COLLECTION;
    const Idtcollection = process.env.IDT_COLLECTION;
    const Attributecollection = process.env.ATTRIBUTE_COLLECTION;
    const Instancecollection = process.env.INSTANCE_COLLECTION;

    const entityFilter = { type: "Entity" };
    const instanceFilter = { type: "Instance" };

    const entityCount = await db.collection(Entitycollection).countDocuments();
    const instanceCount = await db.collection(Instancecollection).countDocuments();
    const sensorCount = await db.collection(Sensorcollection).countDocuments();
    const flagCount = await db.collection(Flagcollection).countDocuments();
    const attributeCount = await db.collection(Attributecollection).countDocuments();
    const eventCount = await db.collection(Eventcollection).countDocuments();
    const reportCount = await db.collection(Idtcollection).countDocuments({ templateType: "Report Design" });
    const formCount = await db.collection(Idtcollection).countDocuments({ templateType: "Form Design" });
    return res.status(200).json([
      { label: "Total Entity", count: entityCount },
      { label: "Total Instance", count: instanceCount },
      { label: "Total Attribute", count: attributeCount },
      { label: "Total Sensors", count: sensorCount },
      { label: "Total Flags", count: flagCount },
      { label: "Total Events", count: eventCount },
      { label: "Report", count: reportCount },
      { label: "Data Update Screen", count: formCount },
    ]);
  } catch (err) {
    console.error("Error fetching collection count:", err);
    return res.status(500).json({
      error: "Error fetching collection count",
      details: err.message,
    });
  }
};


const post_entity_values = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const entityDataCollection = process.env.ENTITY_DATA_COLLECTION;
    const newEntityDataId = new ObjectId();
    const entityDataId = newEntityDataId.toHexString();

    const { entityId } = req.body;
    if (!entityId) {
      return res.status(400).json({ error: "entity Id is required" });
    }

    const entityDataSchema = {
      _id: newEntityDataId,
      entityId: entityId,
      entityDesc: req.body.entityDesc,
      entityLevel: req.body.entityLevel,
      entityLevelName: req.body.entityLevelName,
      // entityLookupId: req.body.entityLookupId,
      entityFormId: req.body.entityFormId,
      createdOn: new Date(),
    };

    return res.json({ token: "200", values });
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};

const get_count_app_entity = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const Entitycollection = process.env.ENTITY_COLLECTION;
    const Eventcollection = process.env.EVENT_COLLECTION;
    const Appcollection = process.env.APPS_COLLECTION;
    const Sensorcollection = process.env.SENSOR_COLLECTION;
    const Flagcollection = process.env.FLAG_COLLECTION;
    const Attributecollection = process.env.ATTRIBUTE_COLLECTION;
    const Idtcollection = process.env.IDT_COLLECTION;
    const Instancecollection = process.env.INSTANCE_COLLECTION;
    const appId = req.body.appId;
    // const entityFilter = { type: "Entity" };

    const entityFilter = {
      type: "Entity",
      entityLevel: "Application",
    };
    const instanceFilter = { type: "Instance" };

    const appDetails = await db
      .collection(Appcollection)
      .findOne({ appId: appId });
    const orgIdArray = appDetails.orgId;

    const applicationEntities = await db
      .collection(Entitycollection)
      .find({
        type: "Entity",
        entityLevel: "Application",
      })
      .toArray();

    const applicationInstances = await db
      .collection(Instancecollection)
      .find({
        type: "Instance",
        entityLevel: "Organization",
      })
      .toArray();

    const filteredEntities = applicationEntities.filter(
      (entity) => entity.entityLevelName.id === appId
    );
    const orgIds = orgIdArray.map((org) => org.id);
    const filteredInstances = applicationInstances.filter((item) =>
      orgIds.includes(item.entityLevelName?.id)
    );
    const entityCount = filteredEntities.length;
    const instanceCount = filteredInstances.length;

    // const entityCount = await db.collection(Entitycollection).countDocuments(entityFilter);
    // const instanceCount = await db.collection(Entitycollection).countDocuments(instanceFilter);
    // const sensorCount = await db.collection(Sensorcollection).countDocuments();
    // const flagCount = await db.collection(Flagcollection).countDocuments();

    const attributes = await db
      .collection(Attributecollection)
      .aggregate([
        {
          $lookup: {
            from: Entitycollection,
            localField: "entityId",
            foreignField: "entityId",
            as: "entity",
          },
        },
        {
          $unwind: "$entity",
        },
        {
          $match: {
            "entity.entityLevel": "Application",
            "entity.entityLevelName.id": appId,
          },
        },
        {
          $count: "count",
        },
      ])
      .toArray();

    const attributeCount = attributes[0]?.count || 0;

    const eventCount = await db.collection(Eventcollection).countDocuments();

    const reportCount = await db
      .collection(Idtcollection)
      .countDocuments({ templateType: "Report Design", appId: appId });
    const formCount = await db
      .collection(Idtcollection)
      .countDocuments({ templateType: "Form Design", appId: appId });

    return res.status(200).json([
      { label: "Total Entity", count: entityCount },
      { label: "Total Instance", count: instanceCount },
      { label: "Total Attribute", count: attributeCount },
      { label: "Total Sensors", count: 0 },
      { label: "Total Flags", count: 0 },
      { label: "Total Events", count: 0 },
      { label: "Report", count: reportCount },
      { label: "Data Update Screen", count: formCount },
    ]);
  } catch (err) {
    console.error("Error fetching collection count:", err);
    return res
      .status(500)
      .json({
        error: "Error fetching collection count",
        details: err.message,
      });
  }
};

const get_entity_logs = async function (req, res, next) {
  try {
    const entityId = req.body.entityId;
    const db = await connectToMongoDB();
    const auditCollectionName = "audit_logs";

    const records = await db
      .collection(auditCollectionName)
      .find({ entityId: entityId })
      .toArray();

    return res.status(200).json({ token: 200, records });
  } catch (err) {
    console.error("Error fetching collection count:", err);
    return res
      .status(500)
      .json({
        error: "Error fetching collection count",
        details: err.message,
      });
  }
};

const get_entity_details = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const datapointCollectionName = process.env.DATAPOINT_COLLECTION;
    const entityCollectionName = process.env.ENTITY_COLLECTION;

    const entityId = req.params.id;

    if (!ObjectId.isValid(entityId)) {
      return res.status(400).json({ error: "Invalid entityId" });
    }

    const projection = { _id: 0 };
    const entityDocuments = await db
      .collection(entityCollectionName)
      .findOne({ entityId: entityId }, { projection });
    const attributes = await db
      .collection(attributeCollectionName)
      .aggregate([
        {
          $match: { entityId: entityId },
        },
        {
          $lookup: {
            from: datapointCollectionName,
            localField: "dataPointID",
            foreignField: "dataTypeId",
            as: "datapointInfo",
          },
        },
        {
          $unwind: {
            path: "$datapointInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        //  added unique and lookup field by rangarao
        {
          $project: {
            _id: 1,
            entityId: 1,
            attributeId: 1,
            attributeName: 1,
            dataPointID: 1,
            defaultValue: 1,
            isNull: 1,
            comments: 1,
            dataSource: 1,
            unique: 1,
            isLookup: 1,
            value: 1,
            datapointDataType: "$datapointInfo.dataType",
            displayName: "$datapointInfo.display_name",
            authorizationID: 1,
            isActive: 1,
            sensorDetails: 1,
            lookupId: 1,
            lookupAttribute: 1,
            order: 1,
            alias: 1
          },
        },
      ])
      .toArray();

    const attributesList = await Promise.all(
      attributes.map(async (item) => {
        if (item.isLookup && item.lookupId !== null) {
          try {
            const attrList = await getLookupDatas(
              item.lookupId.entityId,
              item.lookupAttribute.attributeName
            );
            return {
              ...item,
              attrList,
            };
          } catch (error) {
            console.error("Error fetching entity attributes:", error);
            return item;
          }
        }
        return item;
      })
    );

    if (attributes.length > 0) {
      return res.status(200).json({
        token: "200",
        response:
          "Successfully fetched entity attributes with datapoint information",
        entityDocuments,
        attributes: attributesList,
      });
    } else {
      return res
        .status(404)
        .json({ error: "No attributes found for this entityId" });
    }
  } catch (err) {
    console.error("Error fetching entity attributes:", err);
    return res.status(500).json({
      error: "Error fetching entity attributes",
      details: err.message,
    });
  }
};

// added by rangarao on 13-02-2025
const get_attribute_list = async function (req, res, next) {
  try {

    let filters = {};
    const appId = req.body.appId;
    const orgId = req.body.orgId;

    filters = {
      ...(appId && { attributeLevelName: appId }),
      ...(orgId && { attributeOrgLevel: orgId }),
      ...(!appId && !orgId && { attributeLevel: 'Opsinsight' }),
      ...({ attrLevel: 'Orphan' })
    };

    const db = await connectToMongoDB();
    const Attributecollection = process.env.ATTRIBUTE_COLLECTION;

    const attributes = await db.collection(Attributecollection).aggregate([
      // First: filter documents with entityId only
      { $match: { ...filters, entityId: { $exists: true } } },

      {
        $lookup: {
          from: "Entity",
          let: { eId: "$entityId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$entityId", "$$eId"] } } },
            { $project: { entityName: 1, _id: 0 } }
          ],
          as: "entityDetails"
        }
      },
      {
        $set: {
          entityOrInstanceName: { $arrayElemAt: ["$entityDetails.entityName", 0] }
        }
      },
      {
        $project: { entityDetails: 0 }
      },

      // Second: filter documents with instanceId only
      {
        $unionWith: {
          coll: Attributecollection,
          pipeline: [
            { $match: { ...filters, instanceId: { $exists: true } } },
            {
              $lookup: {
                from: "Instance",
                let: { iId: "$instanceId" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$instanceId", "$$iId"] } } },
                  { $project: { instanceName: 1, _id: 0 } }
                ],
                as: "instanceDetails"
              }
            },
            {
              $set: {
                entityOrInstanceName: { $arrayElemAt: ["$instanceDetails.instanceName", 0] }
              }
            },
            {
              $project: { instanceDetails: 0 }
            }
          ]
        }
      },

      // to include orphan attribute
      {
        $unionWith: {
          coll: Attributecollection,
          pipeline: [
            {
              $match: {
                ...filters,
                entityId: { $exists: false },
                instanceId: { $exists: false }
              }
            },
            {
              $set: {
                entityOrInstanceName: null
              }
            }
          ]
        }
      }
    ]).toArray();
    return res.status(200).json([{ token: 200, attributes: attributes }]);
  } catch (err) {
    console.error("Error fetching collection count:", err);
    return res
      .status(500)
      .json({
        error: "Error fetching attributes list",
        details: err.message,
      });
  }
};

const delete_entity = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.ENTITY_COLLECTION;

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({ token: "200", id, response: "Entity deleted successfully" });
    } else {
      return res.status(404).json({ token: "404", response: "Entity not found" });
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

const get_entity_list = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ENTITY_COLLECTION;
    const appId = req.body.appId;
    const orgId = req.body.orgId;
    let filters = {
      ...(appId && { entityLevelName: appId }),
      ...(orgId && { entityOrgLevel: orgId }),
      ...(!appId && !orgId && {
        $or: [
          { entityLevel: "Opsinsight" },
          { entityLevel: "Application" }
        ]
      })
    };

    console.log("filters", filters);

    const entityList = await db
      .collection(CollectionName)
      .find(filters)
      .toArray();
    return res.json({ token: "200", entityList: entityList });
  } catch (err) {
    console.error("Error fetching Idt List:", err);
    return res.status(500).json({
      error: "Error fetching Idt List",
      details: err.message,
    });
  }
};

export default { post_entity, get_entity_sse, get_entity_attributeByID, get_entity_attribute, update_entity, get_count_entity, post_entity_values, get_count_app_entity, get_attribute_list, get_entity_details, get_entity_logs, delete_entity, get_entity_list, search_entity_attribute };
