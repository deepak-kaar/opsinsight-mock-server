import { connectToMongoDB } from "../../../config/connection.js";
import LoggerService from "../../../services/logger.service.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const post_datasource = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATASOURCE_COLLECTION;

    const { sysId, sysName, sysType, active, userId, description, operatingFacility, lastConnectionDate, lastRunDuration, lastConnectionSts, userJson } = req.body;

    const newObjectId = new ObjectId();

    if (!sysId || !sysName) {
      return res.status(400).json({
        token: "400",
        response: "DataSource details is required and cannot be empty",
      });
    }

    const existingDataSource = await db.collection(collectionName).findOne({ sysId: sysId });
    if (existingDataSource) {
      return res.status(400).json({
        token: "400",
        response: "DataSource with same system ID already exists",
      });
    }

    const dataSourceSchema = {
      _id: newObjectId,
      dataSourceId: newObjectId.toHexString(),
      sysId: sysId,
      sysName: sysName,
      sysType: sysType,
      active: active,
      // userId: userId,
      description: description,
      operatingFacility: operatingFacility,
      lastConnectionDate: lastConnectionDate,
      lastRunDuration: lastRunDuration,
      lastConnectionSts: lastConnectionSts,
      createdOn: new Date(),
      userJson: userJson
    };

    const result = await db.collection(collectionName).insertOne(dataSourceSchema);

    await LoggerService.logEvent({
      level: "info",
      category: "DATASOURCE_CREATE",
      action: "CREATE_DATASOURCE_SUCCESS",
      user: LoggerService.extractUserInfo(req),
      data: { dataSourceId: dataSourceSchema.dataSourceId, sysName },
      performance: { responseTime: LoggerService.calculateResponseTime(process.hrtime()) }
    }, LoggerService.MODULES.DATASOURCE_ADMIN);

    return res.json({
      token: "200",
      response: "Successfully created in database",
      dataSourceData: dataSourceSchema,
    });
  } catch (err) {
    await LoggerService.logError({
      level: "error",
      category: "DATASOURCE_CREATE",
      action: "CREATE_DATASOURCE_FAILED",
      user: LoggerService.extractUserInfo(req),
      error: { message: err.message, stack: err.stack }
    }, LoggerService.MODULES.DATASOURCE_ADMIN);

    console.error("Error creating datasource Send:", err);
    return res
      .status(500)
      .json({
        token: "500",
        response: "Failed to create datasource Send",
        error: err.message,
      });
  }
};

const get_datasource = async function (req, res, next) {
  const startTime = process.hrtime();
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATASOURCE_COLLECTION;

    const { fields } = req.query;
    let projection = {};

    if (fields) {
      const fieldArray = fields.split(',').map(field => field.trim());
      fieldArray.forEach(field => {
        projection[field] = 1;
      });
    }

    const result = await db.collection(collectionName).find({
      sysType:
        "OSI PI"
    }, { projection }).toArray();

    await LoggerService.logEvent({
      action: "FETCH_DATASOURCE_RECORDS",
      resourceType: "DATASOURCE",
      userInfo: LoggerService.extractUserInfo(req),
      requestMetadata: LoggerService.extractRequestMetadata(req),
      resultCount: result.length,
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATASOURCE_ADMIN);

    if (result && result.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched DataSource records",
        dataSourceData: result
      });
    } else {
      return res.status(204).json({
        token: "204",
        response: "No DataSource records found"
      });
    }
  } catch (err) {
    await LoggerService.logError({
      action: "FETCH_DATASOURCE_RECORDS",
      error: err,
      userInfo: LoggerService.extractUserInfo(req),
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATASOURCE_ADMIN);
    console.error("Error fetching DataSource records:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch DataSource records",
      error: err.message
    });
  }
};

const get_datasource_byId = async function (req, res, next) {
  const startTime = process.hrtime();
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATASOURCE_COLLECTION;

    const dataSourceId = req.params.id;
    const { fields } = req.query;

    if (!dataSourceId) {
      await LoggerService.logError({
        action: "FETCH_DATASOURCE_BY_ID",
        error: new Error("DataSource ID validation failed"),
        userInfo: LoggerService.extractUserInfo(req),
        responseTime: LoggerService.calculateResponseTime(startTime)
      }, LoggerService.MODULES.DATASOURCE_ADMIN);
      return res.status(400).json({
        token: "400",
        response: "DataSource ID is required"
      });
    }

    let projection = {};
    if (fields) {
      const fieldArray = fields.split(',').map(field => field.trim());
      fieldArray.forEach(field => {
        projection[field] = 1;
      });
    }

    const result = await db.collection(collectionName).findOne({
      dataSourceId: dataSourceId
    }, { projection });

    await LoggerService.logEvent({
      action: "FETCH_DATASOURCE_BY_ID",
      resourceType: "DATASOURCE",
      resourceId: dataSourceId,
      userInfo: LoggerService.extractUserInfo(req),
      requestMetadata: LoggerService.extractRequestMetadata(req),
      found: !!result,
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATASOURCE_ADMIN);

    if (result) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched DataSource record",
        dataSourceData: result
      });
    } else {
      return res.status(404).json({
        token: "404",
        response: "DataSource record not found"
      });
    }
  } catch (err) {
    await LoggerService.logError({
      action: "FETCH_DATASOURCE_BY_ID",
      error: err,
      userInfo: LoggerService.extractUserInfo(req),
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATASOURCE_ADMIN);
    console.error("Error fetching DataSource record by ID:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch DataSource record",
      error: err.message
    });
  }
};

const update_datasource = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATASOURCE_COLLECTION;

    const dataSourceId = req.params.id;
    const updateData = req.body;

    if (!dataSourceId) {
      return res.status(400).json({
        token: "400",
        response: "DataSource ID is required"
      });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        token: "400",
        response: "Update data is required"
      });
    }

    if (updateData.sysId) {
      const duplicateCheck = await db.collection(collectionName).findOne({
        sysId: updateData.sysId,
        dataSourceId: { $ne: dataSourceId }
      });

      if (duplicateCheck) {
        return res.status(400).json({
          token: "400",
          response: "DataSource with same system ID already exists"
        });
      }
    }

    delete updateData._id;
    delete updateData.createdOn;
    updateData.dataSourceId = dataSourceId;
    updateData.updatedOn = new Date();

    const result = await db.collection(collectionName).updateOne(
      { dataSourceId: dataSourceId },
      {
        $set: updateData,
        $setOnInsert: {
          _id: new ObjectId(),
          createdOn: new Date()
        }
      },
      { upsert: true }
    );

    const upsertedDataSource = await db.collection(collectionName).findOne({
      dataSourceId: dataSourceId
    });

    const responseMessage = result.upsertedCount > 0
      ? "DataSource record created successfully"
      : "DataSource record updated successfully";

    return res.status(200).json({
      token: "200",
      response: responseMessage,
      dataSourceData: upsertedDataSource
    });
  } catch (err) {
    console.error("Error upserting DataSource record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to upsert DataSource record",
      error: err.message
    });
  }
};

const delete_datasource = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATASOURCE_COLLECTION;

    const dataSourceId = req.params.id;

    if (!dataSourceId) {
      return res.status(400).json({
        token: "400",
        response: "DataSource ID is required"
      });
    }

    const existingDataSource = await db.collection(collectionName).findOne({
      dataSourceId: dataSourceId
    });

    if (!existingDataSource) {
      return res.status(404).json({
        token: "404",
        response: "DataSource record not found"
      });
    }

    const result = await db.collection(collectionName).deleteOne({
      dataSourceId: dataSourceId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        token: "404",
        response: "DataSource record not found"
      });
    }

    return res.status(200).json({
      token: "200",
      response: "DataSource record deleted successfully",
      deletedDataSource: existingDataSource
    });
  } catch (err) {
    console.error("Error deleting DataSource record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to delete DataSource record",
      error: err.message
    });
  }
};

export default { post_datasource, get_datasource, get_datasource_byId, update_datasource, delete_datasource };