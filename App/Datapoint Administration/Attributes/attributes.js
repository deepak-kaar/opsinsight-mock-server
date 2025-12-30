import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";

import decodeToken from "../../../utils.js";
import dotenv from "dotenv";
import LoggerService from "../../../services/logger.service.js";
dotenv.config();

const get_attributebyId_sse = async function (req, res, next) {
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
        const collectionName = process.env.ATTRIBUTE_COLLECTION;

        const attributeId = req.params.id;
        if (!ObjectId.isValid(attributeId)) {
          return res.status(204).json({ error: "Invalid attributeId" });
        }

        const attributeJson = await db
          .collection(collectionName)
          .find({ attributeId: attributeId })
          .toArray();
        sendEvent(attributeJson);
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

const get_attribute = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.SENSOR_COLLECTION;

    const newObjectId = new ObjectId();

    const sensorName = req.body.sensorName;
    const currentValue = req.body.currentValue;
    const currentValueUnit = req.body.currentValueUnit;

    if (!sensorName || !currentValue || !currentValueUnit) {
      return res.status(400).json({
        token: "400",
        response: "Sensor details is required and cannot be empty",
      });
    }

    const sensorSchema = {
      _id: newObjectId,
      sensorId: newObjectId.toHexString(),
      sensorName: sensorName,
      currentValue: currentValue,
      currentValueUnit: currentValueUnit,
      createdOn: new Date(),
    };

    const result = await db.collection(collectionName).insertOne(sensorSchema);
    return res.json({
      token: "200",
      response: "Successfully created in database",
      Sensor: sensorSchema,
    });
  } catch (err) {
    console.error("Error creating Sensor:", err);
    return res.status(204).json({
      token: "500",
      response: "Failed to create Sensor",
      error: err.message,
    });
  }
};

const get_filtered_attributes = async (req, res) => {
  const startTime = process.hrtime();
  const correlationId = req.correlationId;
  const { appId, orgId, dataSource, frequency, entityId, instanceId } =
    req.body || {};
  try {
    const db = await connectToMongoDB();
    const orgs = [];
    let filter = {};
    if (orgId) {
      orgs.push(orgId?.orgId);

      const { dataAccess = [] } =
        (await db
          .collection("Organization")
          .findOne(
            { orgId: orgId?.orgId },
            { projection: { _id: 0, dataAccess: 1 } }
          )) || {};

      if (Array.isArray(dataAccess) && dataAccess.length) {
        orgs.push(...dataAccess.map((item) => item.orgId));
      }
      filter.attributeOrgLevel = { $in: orgs };
    }

    if (entityId) filter.entityId = entityId;
    if (appId) filter.attributeLevelName = appId;
    if (dataSource) filter.dataSource = dataSource;
    if (frequency) filter.timeFrequency = { $in: [frequency] };
    if (instanceId) filter.instanceId = instanceId;

    const queryStartTime = process.hrtime();
    const results = await db
      .collection("Attributes")
      .find(filter, {
        projection: { _id: 0, attributeId: 1, alias: 1, attributeName: 1 },
      })
      .toArray();
    const queryTime = LoggerService.calculateResponseTime(queryStartTime);

    // Log successful operation
    await LoggerService.logEvent({
      level: "info",
      category: "ATTRIBUTE_SEARCH",
      action: "FILTER_ATTRIBUTES_SUCCESS",
      correlationId,
      user: LoggerService.extractUserInfo(req),
      query: {
        appId,
        orgId: orgId?.orgId,
        dataSource,
        frequency,
        entityId,
        instanceId,
      },
      result: {
        attributeCount: results.length,
      },
      performance: {
        queryTime: parseFloat(queryTime),
        responseTime: LoggerService.calculateResponseTime(startTime),
      },
      message: `Filtered attributes returned ${results.length} results`,
    });

    return res.json({
      token: "200",
      response: "Successfully fetched attribute values",
      attributes: results,
    });
  } catch (err) {
    // Log error
    await LoggerService.logError({
      level: "error",
      category: "ATTRIBUTE_SEARCH",
      action: "FILTER_ATTRIBUTES_FAILED",
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

    return res.status(500).json({
      token: "500",
      response: err.message,
      error: err.message,
    });
  }
};

const post_attr_value = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const attributeValues = req.body.attributeValues;
    const entityOrInstanceId = req.body.id;
    const token = req.headers["authorization"]?.split(" ")[1];
    const decoded = await decodeToken(token);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const userName = decoded.payload.userName;
    if (!attributeValues || Object.keys(attributeValues).length === 0) {
      return res.status(400).json({
        token: "400",
        response: "attributeValues is required and cannot be empty",
      });
    }
    const attributeUpdates = await Promise.all(
      Object.entries(attributeValues).map(async ([key, obj]) => {
        const { attributeId, value, required, name, frequency, date } = obj;

        if (!attributeId) {
          throw new Error(`Missing id for key: ${key}`);
        }

        if (
          required &&
          (value === "" || value === undefined || value === null)
        ) {
          throw new Error(`${name} is required`);
        }
        const objectId = new ObjectId(attributeId);
        // Find the document using attributeId
        const existingAttribute = await db
          .collection(attributeCollectionName)
          .findOne({ attributeId: attributeId });

        if (!existingAttribute) {
          throw new Error(`No document found for id: ${attributeId}`);
        }
        await postFrequencyData(
          attributeId,
          frequency,
          date,
          value,
          name,
          required,
          userName
        );
      })
    );

    return res.json({
      token: "200",
      response: "Successfully updated attribute values in the database",
      updatedAttributes: attributeUpdates,
    });
  } catch (err) {
    console.error("Error updating attributes:", err);
    return res.status(500).json({
      token: "500",
      response: err.message,
      error: err.message,
    });
  }
};

const get_attribute_logs = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.ATTRIBUTE_lOGS_COLLECTION;

    // const projection = { DataType: 1, _id: 0 };
    const result = await db.collection(collectionName).find({}).toArray();
    if (result) {
      return res.status(200).json({ token: "200", Attribute_logs: result });
      // return res.status(200).json(result);
    } else {
      return res.status(404).json({ error: "Attribute not found" });
    }
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};

const get_attribute_logs_ID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ATTRIBUTE_lOGS_COLLECTION;

    const sensorId = req.params.id;

    if (!ObjectId.isValid(sensorId)) {
      return res.status(204).json({ error: "Invalid sensorId" });
    }

    const sensorJson = await db
      .collection(CollectionName)
      .find({ attributeId: sensorId })
      .toArray();

    if (sensorJson.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched attributeJson",
        sensorJson,
      });
    } else {
      return res
        .status(204)
        .json({ error: "No sensor found for this attribute Id" });
    }
  } catch (err) {
    console.error("Error fetching attributeIdJson:", err);
    return res.status(500).json({
      error: "Error fetching attributeIdJson",
      details: err.message,
    });
  }
};

const get_attr_value = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollection = process.env.ATTRIBUTE_COLLECTION;

    const { attributeId } = req.body;
    if (!attributeId) {
      return res.status(400).json({ error: "attributeId is required" });
    }

    //Find the entityId from Attribute collection
    const attribute = await db
      .collection(attributeCollection)
      .findOne({ attributeId });
    if (!attribute) {
      return res.status(404).json({ error: "Attribute not found" });
    }

    const entityId = attribute.lookupId?.entityId;
    if (!entityId) {
      return res.status(404).json({ error: "EntityId not found in attribute" });
    }

    const values = await getLookupDatas(
      attribute.lookupId.entityId,
      attribute.lookupAttribute.attributeName
    );
    const result = values.map((item) => ({
      name: item,
    }));

    return res.json({ token: "200", values: result });
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};

const get_attr_list = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const entityId = req.params.id;
    const attributeCollection = process.env.ATTRIBUTE_COLLECTION;
    const attributes = await db
      .collection(attributeCollection)
      .find(
        { entityId: entityId },
        { projection: { attributeId: 1, attributeName: 1 } }
      )
      .toArray();
    return res.status(200).json({ token: 200, attributes });
  } catch (err) {
    console.error("Error fetching attribute collection:", err);
    return res.status(500).json({
      error: "Error fetching attribute collection",
      details: err.message,
    });
  }
};

const post_monthlytarget_attr = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const { attributeId, startDate, endDate, value, frequency, attrName } =
      req.body;

    if (
      !attributeId ||
      !startDate ||
      !endDate ||
      !value ||
      value === undefined ||
      value === " " ||
      !frequency ||
      !attrName
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const attributeValueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;
    let currentDate = moment(startDate);
    const end = moment(endDate);
    let upsertCount = 0;

    while (currentDate.isSameOrBefore(end, "day")) {
      const date = currentDate.toDate();
      const existingRecord = await db
        .collection(attributeValueCollection)
        .findOne({
          attributeId: attributeId,
          date: date,
        });

      if (existingRecord) {
        await db.collection(attributeValueCollection).updateOne(
          { attributeId: attributeId, date: date },
          {
            $set: {
              value,
              frequency: frequency,
              name: attrName,
              updatedOn: new Date(),
            },
          }
        );
      } else {
        await db.collection(attributeValueCollection).insertOne({
          attributeId: attributeId,
          date: date,
          value,
          frequency: frequency,
          name: attrName,
          createdOn: new Date(),
        });
      }
      upsertCount++;
      currentDate.add(1, "day");
    }

    return res.json({
      status: "200",
      message: "Data inserted/updated successfully",
      count: upsertCount,
    });
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};

const get_freq_value_by_date = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ATTRIBUTE_VALUE_COLLECTION;

    const { attributeId, startDate, endDate } = req.body;

    if (!ObjectId.isValid(attributeId)) {
      return res.status(204).json({ error: "Invalid attrbuteId" });
    }

    const attributeJson = await db
      .collection(CollectionName)
      .find({
        attributeId: attributeId,
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      })
      .toArray();

    return res.status(200).json({
      token: "200",
      response: "Successfully fetched freq values",
      attributeJson,
    });
  } catch (err) {
    console.error("Error fetching attrbuteId:", err);
    return res.status(500).json({
      error: "Error fetching attrbuteId",
      details: err.message,
    });
  }
};

const get_freq_value_for_graph = async function (req, res, next) {
  try {
    const { startDate, endDate, attributeId } = req.body;

    if (!startDate || !endDate || !attributeId) {
      return res.status(400).json({
        success: false,
        message: "startDate, endDate, and attributeId are required",
      });
    }

    const db = await connectToMongoDB();
    const attributeValueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const query = {
      attributeId: attributeId,
      date: {
        $gte: startDateObj,
        $lte: endDateObj,
      },
    };

    const documents = await db
      .collection(attributeValueCollection)
      .find(query)
      .toArray();

    const labels = [];
    const data = [];
    const dateMap = {};

    documents.forEach((doc) => {
      const dateStr = new Date(doc.date).toISOString().split("T")[0];
      dateMap[dateStr] = doc.value;
    });

    let currentDate = new Date(startDateObj);
    while (currentDate <= endDateObj) {
      labels.push(await formatDateToDisplay(currentDate));
      const dateKey = currentDate.toISOString().split("T")[0];
      data.push(dateMap[dateKey] ? parseInt(dateMap[dateKey]) : 0);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return res.status(200).json({
      success: true,
      labels,
      data,
    });
  } catch (error) {
    console.error("Error fetching attribute data:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching attribute data",
      error: error.message,
    });
  }
};

const get_freq_value_for_excel = async function (req, res, next) {
  try {
    const { attributeName, startDate, endDate, attributeId } = req.body;

    if (!startDate || !endDate || !attributeId) {
      return res.status(400).json({
        success: false,
        message: "startDate, endDate, and attributeId are required",
      });
    }

    const db = await connectToMongoDB();
    const attributeValueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const query = {
      attributeId: attributeId,
      date: {
        $gte: startDateObj,
        $lte: endDateObj,
      },
    };

    const documents = await db
      .collection(attributeValueCollection)
      .find(query)
      .toArray();

    const labels = [];
    const data = [];
    const dateMap = {};

    documents.forEach((doc) => {
      const dateStr = new Date(doc.date).toISOString().split("T")[0];
      dateMap[dateStr] = doc.value;
    });

    let currentDate = new Date(startDateObj);
    while (currentDate <= endDateObj) {
      labels.push(await formatDateToDisplay(currentDate));
      const dateKey = currentDate.toISOString().split("T")[0];
      data.push(dateMap[dateKey] ? parseInt(dateMap[dateKey]) : 0);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Generate CSV content
    let csvContent = `Date,${attributeName}\n`;
    labels.forEach((label, index) => {
      csvContent += `${label},${data[index]}\n`;
    });

    // Set response headers
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="attribute_data.csv"'
    );
    res.setHeader("Content-Type", "text/csv");

    // Send CSV data as response
    res.send(csvContent);
  } catch (error) {
    console.error("Error fetching attribute data:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching attribute data",
      error: error.message,
    });
  }
};

const get_freq_multi_value_for_graph = async function (req, res) {
  try {
    const { startDate, endDate, attributes } = req.body;

    if (
      !startDate ||
      !endDate ||
      !attributes ||
      !Array.isArray(attributes) ||
      attributes.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "startDate, endDate, and attributes array are required",
      });
    }
    const attributeIds = attributes.map((attr) => attr.attributeId);

    const attributeNames = {};
    attributes.forEach((attr) => {
      if (attr.attributeId && attr.name) {
        attributeNames[attr.attributeId] = attr.name;
      }
    });

    const db = await connectToMongoDB();
    const attributeValueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const query = {
      attributeId: { $in: attributeIds },
      date: {
        $gte: startDateObj,
        $lte: endDateObj,
      },
    };

    const documents = await db
      .collection(attributeValueCollection)
      .find(query)
      .toArray();

    const labels = [];
    let currentDate = new Date(startDateObj);
    while (currentDate <= endDateObj) {
      labels.push(await formatDateToDisplay(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const dataSets = [];

    // Processing each attribute
    for (const attribute of attributes) {
      const attributeId = attribute.attributeId;

      // Filterin documents for this attributeId
      const attributeDocs = documents.filter(
        (doc) => doc.attributeId === attributeId
      );

      // map of dates to values for this attribute
      const dateMap = {};
      attributeDocs.forEach((doc) => {
        const dateStr = new Date(doc.date).toISOString().split("T")[0];
        dateMap[dateStr] = doc.value;
      });

      // Generatin data array for this attribute
      const attributeData = [];
      currentDate = new Date(startDateObj);
      while (currentDate <= endDateObj) {
        const dateKey = currentDate.toISOString().split("T")[0];
        attributeData.push(dateMap[dateKey] ? parseInt(dateMap[dateKey]) : 0);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Adding dataset for this attribute
      dataSets.push({
        label: attribute.name || `Attribute ${attributeId.substring(0, 8)}...`,
        data: attributeData,
        attributeId: attributeId,
      });
    }

    return res.status(200).json({
      success: true,
      labels,
      dataSets,
    });
  } catch (error) {
    console.error("Error fetching multiple attribute data:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching attribute data",
      error: error.message,
    });
  }
};

const get_freq_multi_value_for_excel = async function (req, res) {
  try {
    const { startDate, endDate, attributes } = req.body;

    if (
      !startDate ||
      !endDate ||
      !attributes ||
      !Array.isArray(attributes) ||
      attributes.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "startDate, endDate, and attributes array are required",
      });
    }

    const attributeIds = attributes.map((attr) => attr.attributeId);
    const attributeNames = {};

    // Mapping the attributes' IDs to their names
    attributes.forEach((attr) => {
      if (attr.attributeId && attr.name) {
        attributeNames[attr.attributeId] = attr.name;
      }
    });

    const db = await connectToMongoDB();
    const attributeValueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    // MongoDB query to fetch data
    const query = {
      attributeId: { $in: attributeIds },
      date: {
        $gte: startDateObj,
        $lte: endDateObj,
      },
    };

    const documents = await db
      .collection(attributeValueCollection)
      .find(query)
      .toArray();

    // Generate labels (dates)
    const labels = [];
    let currentDate = new Date(startDateObj);
    while (currentDate <= endDateObj) {
      labels.push(currentDate.toISOString().split("T")[0]); // Format as YYYY-MM-DD
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Prepare the data sets for each attribute
    const dataSets = {};

    for (const attribute of attributes) {
      const attributeId = attribute.attributeId;
      const dateMap = {};

      // Filter documents for the current attributeId
      documents
        .filter((doc) => doc.attributeId === attributeId)
        .forEach((doc) => {
          const dateStr = new Date(doc.date).toISOString().split("T")[0]; // Format date as YYYY-MM-DD
          dateMap[dateStr] = doc.value;
        });

      // Generate data array for the current attribute
      const attributeData = labels.map((dateKey) =>
        dateMap[dateKey] ? parseInt(dateMap[dateKey]) : 0
      );

      // Add the data for the current attribute to the dataset
      dataSets[attribute.name] = attributeData;
    }

    // Generate CSV content
    let csvContent = `Date,${attributes.map((attr) => attr.name).join(",")}\n`;

    labels.forEach((date, index) => {
      const row = [
        date,
        ...attributes.map((attr) => dataSets[attr.name][index]),
      ].join(",");
      csvContent += `${row}\n`;
    });

    // Set response headers to indicate a file download
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="attribute_data.csv"'
    );
    res.setHeader("Content-Type", "text/csv");

    // Send the generated CSV content as the response
    res.send(csvContent);
  } catch (error) {
    console.error("Error generating CSV file:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while generating CSV file",
      error: error.message,
    });
  }
};

const update_freq_value_by_id = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ATTRIBUTE_VALUE_COLLECTION;

    const attributeId = req.body.attributeId;
    const value = req.body.value;

    if (!ObjectId.isValid(attributeId)) {
      return res.status(204).json({ error: "Invalid attrbuteId" });
    }

    const attributeJson = await db
      .collection(CollectionName)
      .findOneAndUpdate(
        { _id: new ObjectId(attributeId) },
        { $set: { value: value } }
      );

    if (attributeJson.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Updated Successfully",
      });
    } else {
      return res
        .status(204)
        .json({ error: "No sensor found for this attrbute Id" });
    }
  } catch (err) {
    console.error("Error updating value:", err);
    return res.status(500).json({
      error: "Error updating value",
      details: err.message,
    });
  }
};

const get_monthlytarget_attr_ID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ATTRIBUTE_VALUE_COLLECTION;

    const attrbuteId = req.params.id;

    if (!ObjectId.isValid(attrbuteId)) {
      return res.status(204).json({ error: "Invalid attrbuteId" });
    }

    const attributeJson = await db
      .collection(CollectionName)
      .find({ attributeId: attrbuteId })
      .toArray();

    if (attributeJson.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched attrbuteId",
        attributeJson,
      });
    } else {
      return res
        .status(204)
        .json({ error: "No sensor found for this attrbute Id" });
    }
  } catch (err) {
    console.error("Error fetching attrbuteId:", err);
    return res.status(500).json({
      error: "Error fetching attrbuteId",
      details: err.message,
    });
  }
};

// added by rangarao on 13-02-2025
const get_attr_by_id = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const Attributecollection = process.env.ATTRIBUTE_COLLECTION;
    const attrbuteId = req.body?.attributeId;
    if (!attrbuteId) {
      return res.status(500).json({
        error: "Attribute Id is required",
        details: "Please provide the attribute Id",
      });
    }
    console.log(attrbuteId);
    const attribute = await db
      .collection(Attributecollection)
      .findOne({ attributeId: attrbuteId });
    return res.status(200).json({ token: 200, attribute: attribute });
  } catch (err) {
    console.error("Error fetching collection count:", err);
    return res.status(500).json({
      error: "Error fetching attributes list",
      details: err.message,
    });
  }
};

// added by rangarao on 13-02-2025
const create_attribute = async function (req, res, next) {
  try {
    const attribute = req.body;
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const newAttributeObjectId = new ObjectId();

    let levels = {};
    if (attribute.attrLevel === "Entity") {
      const entity = await db.collection("Entity").findOne(
        { entityId: attribute.entityId },
        {
          projection: {
            _id: 0,
            entityLevel: 1,
            entityLevelName: 1,
            entityOrgLevel: 1,
          },
        }
      );
      levels = {
        level: entity.entityLevel,
        levelName: entity.entityLevelName,
        orgLevel: entity.entityOrgLevel,
      };
    } else if (attribute.attrLevel === "Instance") {
      const instance = await db.collection("Instance").findOne(
        { instanceId: attribute.entityId },
        {
          projection: {
            _id: 0,
            instanceLevel: 1,
            instanceLevelName: 1,
            instanceOrgLevel: 1,
          },
        }
      );
      levels = {
        level: entity.instanceLevel,
        levelName: entity.instanceLevelName,
        orgLevel: entity.instanceOrgLevel,
      };
    }

    const attributeDocument = {
      _id: newAttributeObjectId,
      ...(attribute.attrLevel === "Entity" && { entityId: attribute.entityId }),
      ...(attribute.attrLevel === "Instance" && {
        instanceId: attribute.entityId,
      }),
      attrLevel: attribute.attrLevel,
      attributeId: newAttributeObjectId.toHexString(),
      attributeName: attribute.attributeName,
      dataPointID: {
        dataType: attribute.dataType.dataType,
        dataTypeId: attribute.dataType.dataTypeId,
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
      value: attribute.value,
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
      attributeLevel: levels.level || attribute.attributeLevel,
      attributeLevelName: levels.levelName || attribute.attributeLevelName,
      attributeOrgLevel: levels.orgLevel || attribute.attributeOrgLevel,
      createdOn: new Date(),
      order: 0,
    };
    await db.collection(attributeCollectionName).insertOne(attributeDocument);
    return res.json({
      token: "200",
      response: "Successfully created attribute in database",
      attributes: req.body,
    });
  } catch (err) {
    console.error("Error creating attribute:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to create attribute",
      error: err.message,
    });
  }
};

const update_attribute = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const attribute = req.body.attribute;
    const attributeId = req.body.attributeId;

    let levels = {};
    if (attribute.attrLevel === "Entity") {
      const entity = await db.collection("Entity").findOne(
        { entityId: attribute.entityId },
        {
          projection: {
            _id: 0,
            entityLevel: 1,
            entityLevelName: 1,
            entityOrgLevel: 1,
          },
        }
      );
      levels = {
        level: entity.entityLevel,
        levelName: entity.entityLevelName,
        orgLevel: entity.entityOrgLevel,
      };
    } else if (attribute.attrLevel === "Instance") {
      const instance = await db.collection("Instance").findOne(
        { instanceId: attribute.entityId },
        {
          projection: {
            _id: 0,
            instanceLevel: 1,
            instanceLevelName: 1,
            instanceOrgLevel: 1,
          },
        }
      );
      levels = {
        level: entity.instanceLevel,
        levelName: entity.instanceLevelName,
        orgLevel: entity.instanceOrgLevel,
      };
    }

    const result = await db.collection(attributeCollectionName).updateOne(
      { attributeId: attributeId },
      {
        $set: {
          ...(attribute.attrLevel === "Entity" && {
            entityId: attribute.entityId,
          }),
          ...(attribute.attrLevel === "Instance" && {
            instanceId: attribute.entityId,
          }),
          attributeName: attribute.attributeName,
          dataPointID: {
            dataType: attribute.dataType.dataType,
            dataTypeId: attribute.dataType.dataTypeId,
          },
          attrLevel: attribute.attrLevel,
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
        },
      }
    );
    console.log(result);
    return res.json({
      token: "200",
      response: "Successfully updated attributes in database",
    });
  } catch (err) {
    console.error("Error updating attribute:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to update attribute",
      error: err.message,
    });
  }
};

const delete_attribute = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.ATTRIBUTE_COLLECTION;

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db
      .collection(collectionName)
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({
        token: "200",
        id,
        response: "attribute deleted successfully",
      });
    } else {
      return res
        .status(404)
        .json({ token: "404", response: "attribute not found" });
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

async function postFrequencyData(
  attributeId,
  frequency,
  date,
  value,
  name,
  required,
  userName
) {
  const attributeLogsCollectionName = process.env.ATTRIBUTE_lOGS_COLLECTION;
  const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
  const attributevalueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;
  const db = await connectToMongoDB();
  const inputDate = new Date(date);
  const year = inputDate.getFullYear();
  const month = inputDate.getMonth();
  const day = inputDate.getDate();
  const hour = inputDate.getHours();

  // Helper function for inserting logs
  const insertLog = async (modifiedValue) => {
    await db.collection(attributeLogsCollectionName).insertOne({
      attributeId,
      attributeName: name,
      modifiedBy: userName,
      modifiedOn: new Date(),
      modifiedValue,
    });
  };

  if (frequency === null || frequency === undefined) {
    const result = await db
      .collection(attributeCollectionName)
      .findOneAndUpdate(
        {
          attributeId: attributeId,
          dataSource: { $ne: "Sensor" },
          value: { $ne: value },
        },
        { $set: { value } }
      );
    if (result) await insertLog(value);
    return;
  } else {
    /**
     * Determines the date range for different frequency types.
     * Supports Hourly, Daily, Weekly, Monthly, Quarterly, Semi-Annual, and Yearly.
     */
    const getDateRange = (frequency, inputDate) => {
      switch (frequency) {
        case "Hour":
          return {
            date: {
              $gte: new Date(year, month, day, hour, 0, 0),
              $lt: new Date(year, month, day, hour + 1, 0, 0),
            },
          };
        case "Day":
          return {
            date: {
              $gte: new Date(year, month, day),
              $lt: new Date(year, month, day + 1),
            },
          };
        case "Week":
          const startOfWeek = new Date(inputDate);
          startOfWeek.setDate(day - inputDate.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 7);
          return { date: { $gte: startOfWeek, $lt: endOfWeek } };
        case "Month":
          return {
            date: {
              $gte: new Date(year, month, 1),
              $lt: new Date(year, month + 1, 1),
            },
          };
        case "Quarter":
          const quarterStartMonth = Math.floor(month / 3) * 3;
          return {
            date: {
              $gte: new Date(year, quarterStartMonth, 1),
              $lt: new Date(year, quarterStartMonth + 3, 1),
            },
          };
        case "Semi-Annual":
          return {
            date: {
              $gte: new Date(year, month < 6 ? 0 : 6, 1),
              $lt: new Date(year, month < 6 ? 6 : 12, 1),
            },
          };
        case "Year":
          return {
            date: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1),
            },
          };
        default:
          return { date: inputDate };
      }
    };

    const query = {
      attributeId,
      frequency,
      ...getDateRange(frequency, inputDate),
    };

    const existingEntry = await db
      .collection(attributevalueCollection)
      .findOne(query);

    if (existingEntry && value !== existingEntry?.value) {
      await db
        .collection(attributevalueCollection)
        .updateOne({ _id: existingEntry._id }, { $set: { value } });
      await insertLog(value);
    } else {
      await db.collection(attributevalueCollection).insertOne({
        attributeId,
        value,
        required,
        name,
        frequency,
        date: inputDate,
        createdBy: userName,
        createdOn: new Date(),
      });
      await insertLog(value);
    }
  }
}

async function getLookupDatas(entityId, attributeName) {
  try {
    const entityCollectionName = process.env.ENTITY_DATA_COLLECTION;
    const db = await connectToMongoDB();
    const results = await db
      .collection(entityCollectionName)
      .find({ entityOrInstanceId: entityId })
      .project({ [`data.${attributeName}`]: 1, _id: 0 })
      .toArray();
    const values = results
      .map((item) => item.data[attributeName])
      .filter((value) => value !== undefined);
    return values;
  } catch (error) {
    console.error(error);
    return [];
  }
}

const get_attribute_by_orgs = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = "Attributes";
    const orgId = req.body?.orgId;
    // if (!orgId) {
    //   return res.status(400).json({
    //     token: "422",
    //     response: "OrgId is required",
    //   });
    // }
    const attributes = await db
      .collection(attributeCollectionName)
      .find({ attributeOrgLevel: orgId })
      .toArray();
    return res.status(200).json({
      token: "200",
      response: "Successfully fetched attribute by orgs",
      attributes,
    });
  } catch (err) {
    console.error("Error fetching attribute by orgs:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch attribute by orgs",
      error: err.message,
    });
  }
};


const get_attributes = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const attributes = await db
      .collection(attributeCollectionName)
      .find({}, { projection: { attributeId: 1, attributeName: 1, _id: 0 } })
      .toArray();
    return res.status(200).json({
      token: "200",
      response: "Successfully fetched attributes",
      attributes,
    });
  } catch (err) {
    console.error("Error fetching attributes:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch attributes",
      error: err.message,
    });
  }
};

async function formatDateToDisplay(date) {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export default {
  get_attributebyId_sse,
  get_attribute,
  post_attr_value,
  get_attribute_logs,
  get_attribute_logs_ID,
  get_attr_value,
  get_attr_list,
  post_monthlytarget_attr,
  get_freq_value_by_date,
  get_freq_value_for_graph,
  get_freq_value_for_excel,
  get_freq_multi_value_for_graph,
  get_freq_multi_value_for_excel,
  update_freq_value_by_id,
  get_monthlytarget_attr_ID,
  get_attr_by_id,
  create_attribute,
  update_attribute,
  delete_attribute,
  get_filtered_attributes,
  get_attribute_by_orgs,
  get_attributes
};
