import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const post_instance = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const instanceCollectionName = process.env.INSTANCE_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const auditCollectionName = process.env.HISTORY_COLLECTION;
    const appCollectionName = process.env.APPS_COLLECTION;
    const orgsCollectionName = process.env.ORGANIZATION_COLLECTION;
    const newEntityObjectId = new ObjectId();
    const instanceId = newEntityObjectId.toHexString();
    const instanceName = req.body.instanceName;

    if (!instanceName || instanceName.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "instanceName is required and cannot be empty",
      });
    }

    const existingInstance = await db
      .collection(instanceCollectionName)
      .findOne({ instanceName });

    if (existingInstance) {
      return res.status(400).json({
        token: "400",
        response: "Entity with the provided InstanceName already exists",
      });
    }

    const instanceSchema = {
      _id: newEntityObjectId,
      type: req.body.type,
      instanceId,
      instanceName,
      instanceDesc: req.body.instanceDesc,
      instanceLevel: req.body.instanceLevel,
      instanceLevelName: req.body.instanceLevelName,
      instanceOrgLevel: req.body.instanceOrgLevel,
      entityLookupId: req.body.entityLookupId,
      entityFormId: req.body.entityFormId,
      isMasterDataInstance: false,
      instanceLocation: req.body.instanceLocation,
      createdOn: new Date(),
    };

    const instanceResult = await db
      .collection(instanceCollectionName)
      .insertOne(instanceSchema);

    // Log entity creation in audit_logs
    const auditEntry = {
      instanceId,
      collectionName: instanceCollectionName,
      operation: "INSERT",
      before: null,
      after: instanceSchema,
      modifiedFields: Object.keys(instanceSchema),
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

    const attributePromises = req.body.instanceAttribute.map(
      async (attribute) => {
        const newAttributeObjectId = new ObjectId();

        //  added unique lookup and lookUp and commented min,max and parentEntity field and by rangarao
        const attributeDocument = {
          _id: newAttributeObjectId,
          instanceId,
          attrLevel: 'Instance',
          attributeId: newAttributeObjectId.toHexString(),
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
          attributeLevel: req.body.instanceLevel,
          attributeLevelName: req.body.instanceLevelName,
          attributeOrgLevel: req.body.instanceOrgLevel || null,
          tag: attribute.tag || '',
          dataTypeType: attribute.dataTypeType || '',
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
          instanceId,
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
      entity: instanceSchema,
      attributes: req.body.instanceAttribute,
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

const update_instance = async function (req, res, next) {
  try {
    const {
      instanceId,
      type,
      instanceName,
      instanceDesc,
      instanceAttribute,
      instanceLevel,
      instanceLevelName,
      instanceOrgLevel,
      instanceLocation,
      entityLookupId,
      entityFormId,
    } = req.body;

    if (!instanceId || instanceId.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "instanceId is required and cannot be empty",
      });
    }

    const db = await connectToMongoDB();
    const instanceCollectionName = process.env.INSTANCE_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const auditCollectionName = "audit_logs";

    // Fetch the existing Instance before update
    const existingInstance = await db
      .collection(instanceCollectionName)
      .findOne({ instanceId });

    if (!existingInstance) {
      return res.status(404).json({
        token: "404",
        response: "Instance not found with the provided instanceId",
      });
    }

    const updatedInstanceDetails = {
      type,
      instanceName,
      instanceDesc,
      instanceLevel,
      instanceLevelName,
      instanceOrgLevel,
      instanceLocation,
      entityLookupId,
      updatedOn: new Date(),
    };

    // Update the Instance
    await db
      .collection(instanceCollectionName)
      .updateOne({ instanceId }, { $set: updatedInstanceDetails });

    // Log the Instance update in audit logs
    const instanceAuditEntry = {
      instanceId,
      collectionName: instanceCollectionName,
      operation: "UPDATE",
      before: existingInstance,
      after: { ...existingInstance, ...updatedInstanceDetails },
      modifiedFields: Object.keys(updatedInstanceDetails),
      performedBy: req.user ? req.user.username : "system",
      timestamp: new Date(),
    };
    await db.collection(auditCollectionName).insertOne(instanceAuditEntry);

    // Fetch existing attributes for audit comparison
    const existingAttributes = await db
      .collection(attributeCollectionName)
      .find({ instanceId })
      .toArray();
    const attributePromises = instanceAttribute.map(async (attribute) => {
      const filter = {
        instanceId,
        attributeName: attribute.attributeName,
      };

      const existingAttribute = existingAttributes.find(
        (attr) => attr.attributeName === attribute.attributeName
      );

      // added lookup and unique field for update by rangarao
      const update = {
        $set: {
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
          dataTypeType: attribute.dataTypeType,
          tag: attribute.tag,
          attributes: attribute.attributes,
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
        instanceId,
        collectionName: attributeCollectionName,
        operation: existingAttribute ? "UPDATE" : "INSERT",
        before: existingAttribute || null,
        after: { ...existingAttribute, ...update.$set },
        modifiedFields: Object.keys(update.$set),
        performedBy: req.user ? req.user.username : "system",
        timestamp: new Date(),
      };
      return db.collection(auditCollectionName).insertOne(attributeAuditEntry);
    });

    await Promise.all(attributePromises);

    return res.json({
      token: "200",
      response: "Successfully updated Instance and attributes in database",
      instanceUpdateResult: updatedInstanceDetails,
      attributesUpdated: instanceAttribute,
    });
  } catch (err) {
    console.error("Error updating Instance and attributes:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to update Instance and attributes",
      error: err.message,
    });
  }
};

const get_instance_logs = async function (req, res, next) {
  try {
    const instanceId = req.body.instanceId;
    const db = await connectToMongoDB();
    const auditCollectionName = "audit_logs";

    const records = await db
      .collection(auditCollectionName)
      .find({ instanceId: instanceId })
      .toArray();

    return res.status(200).json({ token: 200, records });
  } catch (err) {
    console.error("Error fetching collection count:", err);
    return res.status(500).json({
      error: "Error fetching collection count",
      details: err.message,
    });
  }
};

const get_instance_details = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const datapointCollectionName = process.env.DATAPOINT_COLLECTION;
    const instanceCollectionName = process.env.INSTANCE_COLLECTION;

    const instanceId = req.params.id;

    if (!ObjectId.isValid(instanceId)) {
      return res.status(400).json({ error: "Invalid instanceId" });
    }

    const projection = { _id: 0 };
    const instanceDocuments = await db
      .collection(instanceCollectionName)
      .findOne({ instanceId: instanceId }, { projection });
    const attributes = await db
      .collection(attributeCollectionName)
      .aggregate([
        {
          $match: { instanceId: instanceId },
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
            instanceId: 1,
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
            alias: 1,
            tag: 1,
            dataTypeType: 1
          },
        },
      ])
      .toArray();

    const attributesList = await Promise.all(
      attributes.map(async (item) => {
        if (item.isLookup && item.lookupId !== null) {
          try {
            const attrList = await getLookupDatas(
              item.lookupId.instanceId,
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
        instanceDocuments,
        attributes: attributesList,
      });
    } else {
      return res
        .status(404)
        .json({ error: "No attributes found for this instanceId" });
    }
  } catch (err) {
    console.error("Error fetching entity attributes:", err);
    return res.status(500).json({
      error: "Error fetching entity attributes",
      details: err.message,
    });
  }
};

const get_attribute_list = async function (req, res, next) {
  try {
    const appId = req.body?.appId;
    const db = await connectToMongoDB();
    const Attributecollection = process.env.ATTRIBUTE_COLLECTION;
    const instanceCollection = process.env.INSTANCE_COLLECTION;
    let attributes;
    if (appId) {
      attributes = await db
        .collection(Attributecollection)
        .aggregate([
          {
            $lookup: {
              from: instanceCollection,
              localField: "instanceId",
              foreignField: "instanceId",
              as: "instance",
            },
          },
          {
            $unwind: "$instance",
          },
          {
            $match: {
              "instance.instanceLevel": "Application",
              "instance.instanceLevelName.id": appId,
            },
          },
        ])
        .toArray();
    } else {
      // attributes = await db.collection(Attributecollection).find().toArray();
      attributes = await db
        .collection(Attributecollection)
        .aggregate([
          {
            $lookup: {
              from: instanceCollection,
              localField: "instanceId",
              foreignField: "instanceId",
              as: "instance",
            },
          },
          { $unwind: "$instance" },
          {
            $addFields: {
              instanceName: "$instance.instanceName",
            },
          },
          {
            $project: {
              entity: 0,
            },
          },
        ])
        .toArray();
    }

    return res.status(200).json([{ token: 200, attributes: attributes }]);
  } catch (err) {
    console.error("Error fetching collection count:", err);
    return res.status(500).json({
      error: "Error fetching attributes list",
      details: err.message,
    });
  }
};

const get_instance_attributeByID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const datapointCollectionName = process.env.DATAPOINT_COLLECTION;
    const instanceCollectionName = process.env.INSTANCE_COLLECTION;

    const instanceId = req.params.id;

    if (!ObjectId.isValid(instanceId)) {
      return res.status(400).json({ error: "Invalid instanceId" });
    }

    const projection = { _id: 0 };
    const instanceDocuments = await db
      .collection(instanceCollectionName)
      .findOne({ instanceId: instanceId }, { projection });
    const attributes = await db
      .collection(attributeCollectionName)
      .aggregate([
        {
          $match: { instanceId: instanceId },
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
            instanceId: 1,
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
            parentinstanceId: 1,
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
                { instanceId: item.lookupId.instanceId },
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
        instanceDocuments,
        attributes: attributesList,
      });
    } else {
      return res
        .status(404)
        .json({ error: "No attributes found for this instanceId" });
    }
  } catch (err) {
    console.error("Error fetching entity attributes:", err);
    return res.status(500).json({
      error: "Error fetching entity attributes",
      details: err.message,
    });
  }
};


const get_instance_attribute = async function (req, res, next) {
  try {

    const appId = req.body.appId;
    const orgId = req.body.orgId;

    let filters = {
      isMasterDataInstance: false
    };

    if (appId || orgId) {
      filters.$or = [
        {
          ...(appId && { instanceLevelName: appId }),
          ...(orgId && { instanceOrgLevel: orgId })
        },
        {
          instanceLevel: "Opsinsight"
        }
      ];
    } else {
      filters.instanceLevel = "Opsinsight";
    }

    const db = await connectToMongoDB();
    const collectionName = process.env.INSTANCE_COLLECTION;

    let allRecords = await db.collection(collectionName).aggregate([
      { $match: filters },
      {
        $lookup: {
          from: "Entity",
          localField: "entityLookupId",
          foreignField: "entityId",
          as: "entityDetails"
        }
      },
      {
        $unwind: {
          path: "$entityDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          entityName: "$entityDetails.entityName"
        }
      },
      {
        $lookup: {
          from: "Apps",
          localField: "instanceLevelName",
          foreignField: "appId",
          as: "appDetails"
        }
      },
      {
        $lookup: {
          from: "Organization",
          localField: "instanceOrgLevel",
          foreignField: "orgId",
          as: "orgDetails"
        }
      },
      {
        $unwind: {
          path: "$appDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: "$orgDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          appName: {
            $cond: {
              if: { $ne: ["$instanceLevel", "Opsinsight"] },
              then: "$appDetails.appName",
              else: null
            }
          },
          orgName: {
            $cond: {
              if: { $ne: ["$instanceLevel", "Opsinsight"] },
              then: "$orgDetails.orgName",
              else: null
            }
          }
        }
      },
      {
        $project: {
          entityDetails: 0,
          appDetails: 0,
          orgDetails: 0
        }
      }
    ]).toArray();


    return res.json({
      token: "200",
      response: "Successfully fetched instances",
      Instances: allRecords,
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

const search_instance_attribute = async function (req, res, next) {
  try {
    const { appId, orgId, search = "", limit = 20 } = req.body || {};

    // --- Build filters (same logic as existing) ---
    let filters = {
      isMasterDataInstance: false,
      ...(appId && { instanceLevelName: appId }),
      ...(orgId && { instanceOrgLevel: orgId }),
      ...(!appId && !orgId && { instanceLevel: 'Opsinsight' })
    };

    // --- Add text search on instanceId / instanceName ---
    const trimmedSearch = (search || "").trim();
    if (trimmedSearch) {
      const regex = new RegExp(trimmedSearch, "i");
      filters = {
        ...filters,
        $or: [
          { instanceId: regex },
          { instanceName: regex }
        ]
      };
    }

    const db = await connectToMongoDB();
    const collectionName = process.env.INSTANCE_COLLECTION;

    const pipeline = [
      { $match: filters },

      // If you still need entity/app/org info for UI, keep these lookups.
      {
        $lookup: {
          from: "Entity",
          localField: "entityLookupId",
          foreignField: "entityId",
          as: "entityDetails"
        }
      },
      {
        $unwind: {
          path: "$entityDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          entityName: "$entityDetails.entityName"
        }
      },
      {
        $lookup: {
          from: "Apps",
          localField: "instanceLevelName",
          foreignField: "appId",
          as: "appDetails"
        }
      },
      {
        $lookup: {
          from: "Organization",
          localField: "instanceOrgLevel",
          foreignField: "orgId",
          as: "orgDetails"
        }
      },
      {
        $unwind: {
          path: "$appDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: "$orgDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          appName: {
            $cond: {
              if: { $ne: ["$instanceLevel", "Opsinsight"] },
              then: "$appDetails.appName",
              else: null
            }
          },
          orgName: {
            $cond: {
              if: { $ne: ["$instanceLevel", "Opsinsight"] },
              then: "$orgDetails.orgName",
              else: null
            }
          }
        }
      },

      // Only send what dropdown really needs (+ any extra for UI)
      {
        $project: {
          _id: 0,
          instanceId: 1,
          instanceName: 1,
          entityName: 1,
          appName: 1,
          orgName: 1
        }
      },

      // Limit suggestions for performance
      { $limit: Number(limit) || 20 }
    ];

    const results = await db.collection(collectionName).aggregate(pipeline).toArray();

    return res.json({
      token: "200",
      response: "Successfully fetched instance suggestions",
      Instances: results
    });

  } catch (err) {
    console.error("Error fetching instance suggestions:", err);
    return res.status(500).json({
      token: "500",
      response: "Error fetching data from MongoDB",
      details: err.message
    });
  }
};


const delete_instance = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.INSTANCE_COLLECTION;

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({ token: "200", id, response: "instance deleted successfully" });
    } else {
      return res.status(404).json({ token: "404", response: "instance not found" });
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

export default {
  post_instance,
  update_instance,
  get_instance_logs,
  get_instance_details,
  get_attribute_list,
  get_instance_attributeByID,
  get_instance_attribute,
  delete_instance,
  search_instance_attribute
};
