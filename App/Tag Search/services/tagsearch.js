import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
import LoggerService from "../../../services/logger.service.js";
dotenv.config();

const get_tagSearchData = async function (req, res, next) {
  const startTime = process.hrtime();
  const correlationId = req.correlationId;

  try {
    const db = await connectToMongoDB();
    const attrCollName = process.env.ATTRIBUTE_COLLECTION;
    const calcCollName = process.env.FUNCTION_MODEL_COLLECTION;
    // const reportCollName = process.env.REPORT_COLLECTION; // for future

    const { appId, orgId } = req.query;
    let filters = {};

    if (appId) filters.appId = appId;
    if (orgId) filters.orgId = orgId;

    //  Fetch main attribute collection
    const queryStartTime = process.hrtime();
    const attrDocs = await db.collection(attrCollName).find().toArray();
    const queryTime = LoggerService.calculateResponseTime(queryStartTime);

    if (!attrDocs || attrDocs.length === 0) {
      await LoggerService.logEvent({
        level: "info",
        category: "TAG_SEARCH",
        action: "SEARCH_NO_RESULTS",
        correlationId,
        user: LoggerService.extractUserInfo(req),
        query: { appId, orgId },
        performance: {
          queryTime: parseFloat(queryTime),
          responseTime: LoggerService.calculateResponseTime(startTime),
        },
        message: "No tag search records found",
      });

      return res.status(200).json({
        token: "204",
        response: "No search records found",
        isData: false,
        searchResults: {}
      });
    }

    const calculationIds = new Set();
    // const reportIds = new Set(); // for future

    attrDocs.forEach(doc => {
      if (Array.isArray(doc.calculationIDS)) {
        doc.calculationIDS.forEach(id => calculationIds.add(id));
      }

      // if (Array.isArray(doc.reportIDS)) {
      //   doc.reportIDS.forEach(id => reportIds.add(id));
      // }
    });

    const calculationData =
      calculationIds.size > 0
        ? await db
          .collection(calcCollName)
          .find({ _id: { $in: Array.from(calculationIds).map(id => new ObjectId(id)) }, ...filters })
          .toArray()
        : [];

    // const reportData =
    //   reportIds.size > 0
    //     ? await db
    //         .collection(reportCollName)
    //         .find({ _id: { $in: Array.from(reportIds).map(id => new ObjectId(id)) },...filters })
    //         .toArray()
    //     : [];

    const isData = calculationData.length > 0 /* || reportData.length > 0 */;

    // Log successful operation
    await LoggerService.logEvent({
      level: "info",
      category: "TAG_SEARCH",
      action: "SEARCH_SUCCESS",
      correlationId,
      user: LoggerService.extractUserInfo(req),
      query: { appId, orgId, filters },
      result: {
        attributeCount: attrDocs.length,
        calculationCount: calculationData.length,
        hasData: isData,
      },
      performance: {
        queryTime: parseFloat(queryTime),
        responseTime: LoggerService.calculateResponseTime(startTime),
      },
      message: `Tag search returned ${calculationData.length} calculation records`,
    });

    return res.status(200).json({
      token: "200",
      response: "Successfully fetched search records",
      isData,
      searchResults: isData
        ? {
          calculationData,
          // reportData
        }
        : {}
    });
  } catch (err) {
    // Log error
    await LoggerService.logError({
      level: "error",
      category: "TAG_SEARCH",
      action: "SEARCH_FAILED",
      correlationId,
      user: LoggerService.extractUserInfo(req),
      error: {
        message: err.message,
        stack: err.stack,
      },
      performance: {
        responseTime: LoggerService.calculateResponseTime(startTime),
      },
    });

    console.error("Error fetching DataSource records:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch search records",
      error: err.message
    });
  }
};






const get_tagSearchData_byId = async function (req, res, next) {
  const startTime = process.hrtime();
  const correlationId = req.correlationId;
  const tagID = req.params.id;

  try {
    const db = await connectToMongoDB();
    const attrCollName = process.env.ATTRIBUTE_COLLECTION;
    const funcModelCollName = process.env.FUNCTION_MODEL_COLLECTION;
    const pageReportCollName = process.env.IDT_COLLECTION;
    const entityCollName = process.env.ENTITY_COLLECTION;
    const instanceCollName = process.env.INSTANCE_COLLECTION;
    const appCollName = process.env.APPS_COLLECTION;
    const orgCollName = process.env.ORGANIZATION_COLLECTION;
    const datapointCollectionName = process.env.DATAPOINT_COLLECTION;

    const { appId, orgId } = req.query;

    if (!tagID) {
      await LoggerService.logEvent({
        level: "warn",
        category: "VALIDATION",
        action: "INVALID_TAG_ID",
        correlationId,
        user: LoggerService.extractUserInfo(req),
        message: "Tag ID is required but not provided",
      });

      return res.status(400).json({
        token: "400",
        response: "Tag ID is required",
      });
    }

    const queryStartTime = process.hrtime();
    const queryTime = LoggerService.calculateResponseTime(queryStartTime);
    // 1️⃣ Attribute with datapoint lookup (using aggregate)
    const attributeAgg = await db
      .collection(attrCollName)
      .aggregate([
        {
          $match: { attributeId: tagID },
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
        // only add extra fields, keep everything else
        {
          $addFields: {
            datapointDataType: "$datapointInfo.dataType",
            displayName: "$datapointInfo.display_name",
          },
        },
        // optional: drop raw lookup array
        {
          $project: {
            datapointInfo: 0,
          },
        },
      ])
      .toArray();

    let doc = attributeAgg[0];

    if (!doc) {
      await LoggerService.logEvent({
        level: "info",
        category: "ATTRIBUTE_SEARCH",
        action: "ATTRIBUTE_NOT_FOUND",
        correlationId,
        user: LoggerService.extractUserInfo(req),
        tagId: tagID,
        performance: {
          queryTime: parseFloat(queryTime),
          responseTime: LoggerService.calculateResponseTime(startTime),
        },
        message: `ATTRIBUTE ${tagID} not found`,
      });

      return res.status(404).json({
        token: "404",
        response: "Search record not found",
        isData: false,
        searchResults: {},
      });
    }

    // 2️⃣ attrList enrichment (like entity.js / instance.js)
    if (doc.isLookup && doc.lookupId) {
      try {
        const lookup = doc.lookupId;
        let filter = null;

        if (lookup.entityId) {
          filter = { entityId: lookup.entityId };
        } else if (lookup.instanceId) {
          filter = { instanceId: lookup.instanceId };
        } else if (lookup.entityOrInstanceId) {
          filter = {
            $or: [
              { entityId: lookup.entityOrInstanceId },
              { instanceId: lookup.entityOrInstanceId },
              { entityOrInstanceId: lookup.entityOrInstanceId },
            ],
          };
        }

        if (filter) {
          const attrList = await db
            .collection(attrCollName)
            .find(filter, {
              projection: { attributeId: 1, attributeName: 1 },
            })
            .toArray();

          doc = {
            ...doc,
            attrList,
          };
        }
      } catch (error) {
        console.error("Error fetching lookup attrList:", error);
        // keep doc as-is if attrList fails
      }
    }

    // 3️⃣ IDs used for other lookups
    const calculationIds = doc.calculationIDS || [];
    const correlationIds = doc.correlationIDS || [];
    const activityIds = doc.activityIDS || [];
    const idtIds = doc.idtIDS || [];

    // 4️⃣ Entity / Instance resolving from attribute
    let entityData = null;
    let instanceData = null;

    const possibleEntityInstanceId =
      doc.entityOrInstanceId || doc.entityId || doc.instanceId || null;

    if (possibleEntityInstanceId) {
      let objId;
      try {
        objId = new ObjectId(possibleEntityInstanceId);
      } catch {
        objId = possibleEntityInstanceId;
      }

      const [foundEntity, foundInstance] = await Promise.all([
        db.collection(entityCollName).findOne({ _id: objId }),
        db.collection(instanceCollName).findOne({ _id: objId }),
      ]);

      if (foundEntity) entityData = foundEntity;
      if (foundInstance) instanceData = foundInstance;

      // 🔁 spread entity lookup into instanceData
      if (instanceData && instanceData.entityLookupId) {
        try {
          let lookupObjId;
          try {
            lookupObjId = new ObjectId(instanceData.entityLookupId);
          } catch {
            lookupObjId = instanceData.entityLookupId;
          }

          const lookupEntity = await db
            .collection(entityCollName)
            .findOne({ _id: lookupObjId });

          if (lookupEntity) {
            instanceData = {
              ...instanceData,
              entityLookUpDetails: lookupEntity, // keeps things safe, no _id overwrite
            };
          }
        } catch (e) {
          console.error("Error resolving entityLookUpId:", e.message);
        }
      }
    }

    // 5️⃣ App / Org resolving from attribute
    let appData = null;
    let orgData = null;

    if (doc.appId) {
      let appObjId;
      try {
        appObjId = new ObjectId(doc.appId);
      } catch {
        appObjId = doc.appId;
      }
      appData = await db.collection(appCollName).findOne({ _id: appObjId });
    }

    if (doc.orgId) {
      let orgObjId;
      try {
        orgObjId = new ObjectId(doc.orgId);
      } catch {
        orgObjId = doc.orgId;
      }
      orgData = await db.collection(orgCollName).findOne({ _id: orgObjId });
    }

    // 6️⃣ Query builders for function models
    const buildQuery = (ids, type) => {
      if (!ids.length) return null;

      const idConditions = ids.map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return id;
        }
      });

      const query = {
        type,
        $or: [
          { _id: { $in: idConditions } },
          { calculationId: { $in: ids } },
          { correlationId: { $in: ids } },
          { activityId: { $in: ids } },
        ],
      };

      if (appId || orgId) {
        query.$and = [];
        if (appId) query.$and.push({ appId });
        if (orgId) query.$and.push({ orgId });
      }

      return query;
    };

    // 7️⃣ Query builder for IDT
    const buildIdtQuery = (ids) => {
      if (!ids.length) return null;

      const idConditions = ids.map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return id;
        }
      });

      const query = {
        $or: [
          { _id: { $in: idConditions } },
          { idtId: { $in: ids } },
        ],
      };

      if (appId || orgId) {
        query.$and = [];
        if (appId) query.$and.push({ appId });
        if (orgId) query.$and.push({ orgId });
      }

      return query;
    };

    const fetchStartTime = process.hrtime();

    // 8️⃣ Fetch function models & IDT in parallel
    const [
      calculationData,
      correlationData,
      activityData,
      idtData,
    ] = await Promise.all([
      calculationIds.length
        ? db
          .collection(funcModelCollName)
          .find(buildQuery(calculationIds, "Calculation Engine"))
          .toArray()
        : [],
      correlationIds.length
        ? db
          .collection(funcModelCollName)
          .find(buildQuery(correlationIds, "Correlation Engine"))
          .toArray()
        : [],
      activityIds.length
        ? db
          .collection(funcModelCollName)
          .find(buildQuery(activityIds, "Activity Engine"))
          .toArray()
        : [],
      idtIds.length
        ? db
          .collection(pageReportCollName)
          .find(buildIdtQuery(idtIds))
          .toArray()
        : [],
    ]);
    const fetchTime = LoggerService.calculateResponseTime(fetchStartTime);

    const isData =
      calculationData.length > 0 ||
      correlationData.length > 0 ||
      activityData.length > 0 ||
      idtData.length > 0 ||
      entityData ||
      instanceData ||
      appData ||
      orgData;

    // Log successful operation
    await LoggerService.logEvent({
      level: "info",
      category: "ATTRIBUTE_SEARCH",
      action: "ATTRIBUTE_SEARCH_BY_ID_SUCCESS",
      correlationId,
      user: LoggerService.extractUserInfo(req),
      tagId: tagID,
      query: { appId, orgId },
      result: {
        calculationCount: calculationData.length,
        correlationCount: correlationData.length,
        activityCount: activityData.length,
        idtCount: idtData.length,
        hasData: isData,
      },
      performance: {
        queryTime: parseFloat(queryTime),
        fetchTime: parseFloat(fetchTime),
        responseTime: LoggerService.calculateResponseTime(startTime),
      },
      message: `ATTRIBUTE search by ID ${tagID} returned ${calculationData.length + correlationData.length + activityData.length + idtData.length} total records`,
    });

    return res.status(200).json({
      token: "200",
      response: "Successfully fetched search record",
      isData,
      searchResults: isData
        ? {
          attributeDetails: doc, // includes datapointDataType, displayName, attrList (if lookup)
          entityData,
          instanceData,
          appData,
          orgData,
          calculationData,
          correlationData,
          activityData,
          idtData,
        }
        : {},
    });
  } catch (err) {
    // Log error
    await LoggerService.logError({
      level: "error",
      category: "ATTRIBUTE_SEARCH",
      action: "ATTRIBUTE_SEARCH_BY_ID_FAILED",
      correlationId,
      tagId: tagID,
      user: LoggerService.extractUserInfo(req),
      error: {
        message: err.message,
        stack: err.stack,
      },
      performance: {
        responseTime: LoggerService.calculateResponseTime(startTime),
      },
    });

    console.error("Error fetching search record by ID:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch search record",
      error: err.message,
    });
  }
};


const get_tagSearchData_byDateRange = async function (req, res, next) {
  const startTime = process.hrtime();
  const correlationId = req.correlationId;

  try {
    const db = await connectToMongoDB();

    const funcModelCollName = process.env.FUNCTION_MODEL_COLLECTION;
    const pageReportCollName = process.env.IDT_COLLECTION;
    const entityCollName = process.env.ENTITY_COLLECTION;
    const instanceCollName = process.env.INSTANCE_COLLECTION;
    const attributeCollName = process.env.ATTRIBUTE_COLLECTION;
    const organizationCollName = process.env.ORGANIZATION_COLLECTION;
    const applicationCollName = process.env.APPS_COLLECTION;


    const { fromDate, toDate, appId, orgId } = req.query;

    if (!fromDate || !toDate) {
      await LoggerService.logEvent({
        level: "warn",
        category: "VALIDATION",
        action: "INVALID_DATE_RANGE",
        correlationId,
        user: LoggerService.extractUserInfo(req),
        message: "fromDate and toDate are required but not provided",
      });

      return res.status(400).json({
        token: "400",
        response: "fromDate and toDate are required",
      });
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);

    // Base filter
    const baseFilter = { createdOn: { $gte: from, $lte: to } };

    // Add optional dynamic filters
    if (appId || orgId) {
      baseFilter.$and = [];
      if (appId) baseFilter.$and.push({ appId });
      if (orgId) baseFilter.$and.push({ orgId });
    }

    // Specific queries
    const calculationQuery = { ...baseFilter, type: "Calculation Engine" };
    const correlationQuery = { ...baseFilter, type: "Correlation Engine" };
    const activityQuery = { ...baseFilter, type: "Activity Engine" };

    //Fetch all in parallel
    const queryStartTime = process.hrtime();
    const [
      calculationData,
      correlationData,
      activityData,
      idtData,
      entityData,
      instanceData,
      attributeData,
      orgData,
      appsData
    ] = await Promise.all([
      db.collection(funcModelCollName).find(calculationQuery).toArray(),
      db.collection(funcModelCollName).find(correlationQuery).toArray(),
      db.collection(funcModelCollName).find(activityQuery).toArray(),
      db.collection(pageReportCollName).find(baseFilter).toArray(),
      db.collection(entityCollName).find(baseFilter).toArray(),
      db.collection(instanceCollName).find(baseFilter).toArray(),
      db.collection(attributeCollName).find(baseFilter).toArray(),
      db.collection(organizationCollName).find(baseFilter).toArray(),
      db.collection(applicationCollName).find({}).toArray()
    ]);

    const appNameMap = appsData.reduce((acc, app) => {
      acc[app.appId] = app.appName;
      return acc;
    }, {});

 const stitchAppName = (dataArray) => {
  return dataArray.map(item => {
    const first = item.firstUsed ? new Date(item.firstUsed) : null;
    const last = item.lastUsed ? new Date(item.lastUsed) : null;

    let totalDays = null;

    if (first && last) {
      const diffMs = last - first; // milliseconds
      totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)); // convert to days
    }

    return {
      ...item,
      appName: appNameMap[item.appId] || null,
      totalDays
    };
  });
};


    const orgArr = stitchAppName(orgData);

    const queryTime = LoggerService.calculateResponseTime(queryStartTime);

    const isData =
      calculationData.length ||
      correlationData.length ||
      activityData.length ||
      idtData.length ||
      entityData.length ||
      instanceData.length ||
      attributeData.length ||
      orgData.length;

    const totalRecords = calculationData.length + correlationData.length + activityData.length +
      idtData.length + entityData.length + instanceData.length + attributeData.length;

    // Log successful operation
    await LoggerService.logEvent({
      level: "info",
      category: "TAG_SEARCH",
      action: "DATE_RANGE_SEARCH_SUCCESS",
      correlationId,
      user: LoggerService.extractUserInfo(req),
      query: { fromDate, toDate, appId, orgId },
      result: {
        calculationCount: calculationData.length,
        correlationCount: correlationData.length,
        activityCount: activityData.length,
        idtCount: idtData.length,
        entityCount: entityData.length,
        instanceCount: instanceData.length,
        attributeCount: attributeData.length,
        totalRecords,
        hasData: isData,
      },
      performance: {
        queryTime: parseFloat(queryTime),
        responseTime: LoggerService.calculateResponseTime(startTime),
      },
      message: `Date range search from ${fromDate} to ${toDate} returned ${totalRecords} total records`,
    });

  
    return res.status(200).json({
      token: "200",
      response: "Successfully fetched search record by date range",
      isData,
      summary: {
        entity: {
          count: entityData.length,
          firstCreatedOn: entityData[0]?.createdOn || null,
          lastCreatedOn: entityData[entityData.length - 1]?.createdOn || null
        },
        attribute: {
          count: attributeData.length,
          firstCreatedOn: attributeData[0]?.createdOn || null,
          lastCreatedOn: attributeData[attributeData.length - 1]?.createdOn || null
        },
        instance: {
          count: instanceData.length,
          firstCreatedOn: instanceData[0]?.createdOn || null,
          lastCreatedOn: instanceData[instanceData.length - 1]?.createdOn || null
        },
        calculation: {
          count: calculationData.length,
          firstCreatedOn: calculationData[0]?.createdOn || null,
          lastCreatedOn: calculationData[calculationData.length - 1]?.createdOn || null
        },
        correlation: {
          count: correlationData.length,
          firstCreatedOn: correlationData[0]?.createdOn || null,
          lastCreatedOn: correlationData[correlationData.length - 1]?.createdOn || null
        },
        activity: {
          count: activityData.length,
          firstCreatedOn: activityData[0]?.createdOn || null,
          lastCreatedOn: activityData[activityData.length - 1]?.createdOn || null
        },
        idt: {
          count: idtData.length,
          firstCreatedOn: idtData[0]?.createdOn || null,
          lastCreatedOn: idtData[idtData.length - 1]?.createdOn || null
        },
        org: {
          count: orgData.length,
          firstCreatedOn: orgData[0]?.createdOn || null,
          lastCreatedOn: orgData[orgData.length - 1]?.createdOn || null
        },
        totalRecords
      },
      searchResults: isData ? {
        calculationData,
        correlationData,
        activityData,
        idtData,
        entityData,
        instanceData,
        attributeData,
        orgArr
      } : {}
    });



  } catch (err) {
    // Log error
    await LoggerService.logError({
      level: "error",
      category: "TAG_SEARCH",
      action: "DATE_RANGE_SEARCH_FAILED",
      correlationId,
      user: LoggerService.extractUserInfo(req),
      query: req.query,
      error: {
        message: err.message,
        stack: err.stack,
      },
      performance: {
        responseTime: LoggerService.calculateResponseTime(startTime),
      },
    });

    console.error("Error fetching search record by date range:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch search record by date range",
      error: err.message,
    });
  }
};







export default { get_tagSearchData, get_tagSearchData_byId, get_tagSearchData_byDateRange };
