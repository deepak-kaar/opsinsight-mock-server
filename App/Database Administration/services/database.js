import { connectToMongoDB } from "../../../config/connection.js";
import LoggerService from "../../../services/logger.service.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const post_database = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_COLLECTION;

    const {sysName, queryId, queryName, queryLanguage, query, sysId, description} = req.body;

    const newObjectId = new ObjectId();

    if (!query || !sysName) {
      return res.status(400).json({
        token: "400",
        response: "Database details is required and cannot be empty",
      });
    }

    const hashId = `${sysName}#${queryId}#${query}`;

    const dataBaseSchema = {
      _id: newObjectId,
      dataBaseId: newObjectId.toHexString(),
      hashId: hashId,
      sysName: sysName,
      queryId: queryId,
      queryName: queryName,
      queryLanguage: queryLanguage,
      query: query,
      description: description,
      sysId: sysId,
      createdOn: new Date()
    };

    const result = await db.collection(collectionName).insertOne(dataBaseSchema);
    
    await LoggerService.logEvent({
      level: "info",
      category: "DATABASE_CREATE",
      action: "CREATE_DATABASE_SUCCESS",
      user: LoggerService.extractUserInfo(req),
      data: { dataBaseId: dataBaseSchema.dataBaseId, sysName },
      performance: { responseTime: LoggerService.calculateResponseTime(process.hrtime()) }
    }, LoggerService.MODULES.DATABASE_ADMIN);
    
    return res.json({
      token: "200",
      response: "Successfully created in database",
      dataBaseData: dataBaseSchema,
    });
  } catch (err) {
    await LoggerService.logError({
      level: "error",
      category: "DATABASE_CREATE",
      action: "CREATE_DATABASE_FAILED",
      user: LoggerService.extractUserInfo(req),
      error: { message: err.message, stack: err.stack }
    }, LoggerService.MODULES.DATABASE_ADMIN);
    
    console.error("Error creating database Send:", err);
    return res
      .status(500)
      .json({
        token: "500",
        response: "Failed to create database Send",
        error: err.message,
      });
  }
};

const get_database = async function (req, res, next) {
  const startTime = process.hrtime();
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_COLLECTION;

    const { fields } = req.query;
    let projection = {};

    if (fields) {
      const fieldArray = fields.split(',').map(field => field.trim());
      fieldArray.forEach(field => {
        projection[field] = 1;
      });
    }

    const result = await db.collection(collectionName).find({}, { projection }).toArray();

    await LoggerService.logEvent({
      action: "FETCH_DATABASE_RECORDS",
      resourceType: "DATABASE",
      userInfo: LoggerService.extractUserInfo(req),
      requestMetadata: LoggerService.extractRequestMetadata(req),
      resultCount: result.length,
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATABASE_ADMIN);

    if (result && result.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched Database records",
        dataBaseData: result
      });
    } else {
      return res.status(204).json({
        token: "204",
        response: "No Database records found"
      });
    }
  } catch (err) {
    await LoggerService.logError({
      action: "FETCH_DATABASE_RECORDS",
      error: err,
      userInfo: LoggerService.extractUserInfo(req),
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATABASE_ADMIN);
    console.error("Error fetching Database records:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch Database records",
      error: err.message
    });
  }
};

const get_database_byId = async function (req, res, next) {
  const startTime = process.hrtime();
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_COLLECTION;

    const dataBaseId = req.params.id;
    const { fields } = req.query;

    if (!dataBaseId) {
      await LoggerService.logError({
        action: "FETCH_DATABASE_BY_ID",
        error: new Error("Database ID validation failed"),
        userInfo: LoggerService.extractUserInfo(req),
        responseTime: LoggerService.calculateResponseTime(startTime)
      }, LoggerService.MODULES.DATABASE_ADMIN);
      return res.status(400).json({
        token: "400",
        response: "Database ID is required"
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
      dataBaseId: dataBaseId
    }, { projection });

    await LoggerService.logEvent({
      action: "FETCH_DATABASE_BY_ID",
      resourceType: "DATABASE",
      resourceId: dataBaseId,
      userInfo: LoggerService.extractUserInfo(req),
      requestMetadata: LoggerService.extractRequestMetadata(req),
      found: !!result,
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATABASE_ADMIN);

    if (result) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched Database record",
        dataBaseData: result
      });
    } else {
      return res.status(404).json({
        token: "404",
        response: "Database record not found"
      });
    }
  } catch (err) {
    await LoggerService.logError({
      action: "FETCH_DATABASE_BY_ID",
      error: err,
      userInfo: LoggerService.extractUserInfo(req),
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATABASE_ADMIN);
    console.error("Error fetching Database record by ID:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch Database record",
      error: err.message
    });
  }
};

const update_database = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_COLLECTION;

    const dataBaseId = req.params.id;
    const updateData = req.body;

    if (!dataBaseId) {
      return res.status(400).json({
        token: "400",
        response: "Database ID is required"
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
        dataBaseId: { $ne: dataBaseId }
      });

      if (duplicateCheck) {
        return res.status(400).json({
          token: "400",
          response: "Database with same system ID already exists"
        });
      }
    }

    delete updateData._id;
    delete updateData.createdOn;
    updateData.dataBaseId = dataBaseId;
    updateData.updatedOn = new Date();

    const result = await db.collection(collectionName).updateOne(
      { dataBaseId: dataBaseId },
      {
        $set: updateData,
        $setOnInsert: {
          _id: new ObjectId(),
          createdOn: new Date()
        }
      },
      { upsert: true }
    );

    const upsertedDatabase = await db.collection(collectionName).findOne({
      dataBaseId: dataBaseId
    });

    const responseMessage = result.upsertedCount > 0
      ? "Database record created successfully"
      : "Database record updated successfully";

    return res.status(200).json({
      token: "200",
      response: responseMessage,
      dataBaseData: upsertedDatabase
    });
  } catch (err) {
    console.error("Error upserting Database record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to upsert Database record",
      error: err.message
    });
  }
};

const delete_database = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_COLLECTION;

    const dataBaseId = req.params.id;

    if (!dataBaseId) {
      return res.status(400).json({
        token: "400",
        response: "Database ID is required"
      });
    }

    console.log(dataBaseId);
    const existingDatabase = await db.collection(collectionName).findOne({
      dataBaseId: dataBaseId
    });

    if (!existingDatabase) {
      return res.status(404).json({
        token: "404",
        response: "Database record not found"
      });
    }

    const result = await db.collection(collectionName).deleteOne({
      dataBaseId: dataBaseId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        token: "404",
        response: "Database record not found"
      });
    }

    return res.status(200).json({
      token: "200",
      response: "Database record deleted successfully",
      deletedDatabase: existingDatabase
    });
  } catch (err) {
    console.error("Error deleting Database record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to delete Database record",
      error: err.message
    });
  }
};

const post_database_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_MAPPING_COLLECTION;

    const {dataBaseId, queryId, queryName, attributeId, attributeName, freq, sysId} = req.body;

    const newObjectId = new ObjectId();

    if (!dataBaseId || !attributeId || !attributeName) {
      return res.status(400).json({
        token: "400",
        response: "Database ID, attribute ID, and attribute name are required and cannot be empty",
      });
    }

    const hashId = `${dataBaseId}#${attributeName}#${freq}`;

    const databaseMappingSchema = {
      _id: newObjectId,
      mappingId: newObjectId.toHexString(),
      hashId: hashId,
      dataBaseId: dataBaseId,
      queryId: queryId,
      queryName: queryName,
      attributeId: attributeId,
      attributeName: attributeName,
      freq: freq,
      sysId: sysId,
      createdOn: new Date()
    };

    const result = await db.collection(collectionName).insertOne(databaseMappingSchema);
    return res.json({
      token: "200",
      response: "Successfully created database mapping",
      mappingData: databaseMappingSchema,
    });
  } catch (err) {
    console.error("Error creating database mapping:", err);
    return res
      .status(500)
      .json({
        token: "500",
        response: "Failed to create database mapping",
        error: err.message,
      });
  }
};

const get_database_mapping = async function (req, res, next) {
  const startTime = process.hrtime();
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_MAPPING_COLLECTION;

    const { fields } = req.query;
    let projection = {};

    if (fields) {
      const fieldArray = fields.split(',').map(field => field.trim());
      fieldArray.forEach(field => {
        projection[field] = 1;
      });
    }

    const result = await db.collection(collectionName).find({}, { projection }).toArray();

    await LoggerService.logEvent({
      action: "FETCH_DATABASE_MAPPING_RECORDS",
      resourceType: "DATABASE_MAPPING",
      userInfo: LoggerService.extractUserInfo(req),
      requestMetadata: LoggerService.extractRequestMetadata(req),
      resultCount: result.length,
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATABASE_ADMIN);

    if (result && result.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched Database mapping records",
        mappingData: result
      });
    } else {
      return res.status(204).json({
        token: "204",
        response: "No Database mapping records found"
      });
    }
  } catch (err) {
    await LoggerService.logError({
      action: "FETCH_DATABASE_MAPPING_RECORDS",
      error: err,
      userInfo: LoggerService.extractUserInfo(req),
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATABASE_ADMIN);
    console.error("Error fetching Database mapping records:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch Database mapping records",
      error: err.message
    });
  }
};

const get_database_mapping_byId = async function (req, res, next) {
  const startTime = process.hrtime();
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_MAPPING_COLLECTION;

    const mappingId = req.params.id;
    const { fields } = req.query;

    if (!mappingId) {
      await LoggerService.logError({
        action: "FETCH_DATABASE_MAPPING_BY_ID",
        error: new Error("Mapping ID validation failed"),
        userInfo: LoggerService.extractUserInfo(req),
        responseTime: LoggerService.calculateResponseTime(startTime)
      }, LoggerService.MODULES.DATABASE_ADMIN);
      return res.status(400).json({
        token: "400",
        response: "Mapping ID is required"
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
      mappingId: mappingId
    }, { projection });

    await LoggerService.logEvent({
      action: "FETCH_DATABASE_MAPPING_BY_ID",
      resourceType: "DATABASE_MAPPING",
      resourceId: mappingId,
      userInfo: LoggerService.extractUserInfo(req),
      requestMetadata: LoggerService.extractRequestMetadata(req),
      found: !!result,
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATABASE_ADMIN);

    if (result) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched Database mapping record",
        mappingData: result
      });
    } else {
      return res.status(404).json({
        token: "404",
        response: "Database mapping record not found"
      });
    }
  } catch (err) {
    await LoggerService.logError({
      action: "FETCH_DATABASE_MAPPING_BY_ID",
      error: err,
      userInfo: LoggerService.extractUserInfo(req),
      responseTime: LoggerService.calculateResponseTime(startTime)
    }, LoggerService.MODULES.DATABASE_ADMIN);
    console.error("Error fetching Database mapping record by ID:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch Database mapping record",
      error: err.message
    });
  }
};

const update_database_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_MAPPING_COLLECTION;

    const mappingId = req.params.id;
    const updateData = req.body;

    if (!mappingId) {
      return res.status(400).json({
        token: "400",
        response: "Mapping ID is required"
      });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        token: "400",
        response: "Update data is required"
      });
    }

    delete updateData._id;
    delete updateData.createdOn;
    updateData.mappingId = mappingId;
    updateData.updatedOn = new Date();

    if (updateData.dataBaseId && updateData.attributeName && updateData.freq) {
      updateData.mappingId = `${updateData.dataBaseId}#${updateData.attributeName}#${updateData.freq}`;
    }

    const result = await db.collection(collectionName).updateOne(
      { mappingId: mappingId },
      {
        $set: updateData,
        $setOnInsert: {
          _id: new ObjectId(),
          createdOn: new Date()
        }
      },
      { upsert: true }
    );

    const upsertedMapping = await db.collection(collectionName).findOne({
      mappingId: mappingId
    });

    const responseMessage = result.upsertedCount > 0
      ? "Database mapping record created successfully"
      : "Database mapping record updated successfully";

    return res.status(200).json({
      token: "200",
      response: responseMessage,
      mappingData: upsertedMapping
    });
  } catch (err) {
    console.error("Error upserting Database mapping record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to upsert Database mapping record",
      error: err.message
    });
  }
};

const delete_database_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.DATABASE_MAPPING_COLLECTION;

    const mappingId = req.params.id;

    if (!mappingId) {
      return res.status(400).json({
        token: "400",
        response: "Mapping ID is required"
      });
    }

    const existingMapping = await db.collection(collectionName).findOne({
      mappingId: mappingId
    });

    if (!existingMapping) {
      return res.status(404).json({
        token: "404",
        response: "Database mapping record not found"
      });
    }

    const result = await db.collection(collectionName).deleteOne({
      mappingId: mappingId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        token: "404",
        response: "Database mapping record not found"
      });
    }

    return res.status(200).json({
      token: "200",
      response: "Database mapping record deleted successfully",
      deletedMapping: existingMapping
    });
  } catch (err) {
    console.error("Error deleting Database mapping record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to delete Database mapping record",
      error: err.message
    });
  }
};

export default { post_database, get_database, get_database_byId, update_database, delete_database, post_database_mapping, get_database_mapping, get_database_mapping_byId, update_database_mapping, delete_database_mapping};