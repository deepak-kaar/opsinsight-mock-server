import { connectToMongoDB } from "../../../config/connection.js";
import LoggerService from "../../../services/logger.service.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const post_pi_send = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.PI_COLLECTION;

    const {
      appId,
      appName,
      orgId,
      orgName,
      attributeId,
      attributeName,
      piDesc,
      piTagNumber,
      piTagDesc,
      tagNumber,
      tagStatus,
      systemName
    } = req.body;

    const newObjectId = new ObjectId();

    if (attributeName.trim() === "" || piDesc.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "PI Send details is required and cannot be empty",
      });
    }

    // const existingPi = await db
    //   .collection(collectionName)
    //   .findOne({ attributeName: attributeName });
    // if (existingPi) {
    //   return res.status(400).json({
    //     token: "400",
    //     response: "PI with same name already exists",
    //   });
    // }

    const piSchema = {
      _id: newObjectId,
      piId: newObjectId.toHexString(),
      piType: "Send",
      attributeId: attributeId,
      attributeName: attributeName,
      piDesc: piDesc,
      piTagNumber: piTagNumber,
      piTagDesc: piTagDesc,
      tagNumber: tagNumber,
      appId: appId,
      appName: appName,
      orgId: orgId,
      orgName: orgName,
      createdOn: new Date(),
      piSendStatus:tagStatus,
      systemName:systemName
    };

    const result = await db.collection(collectionName).insertOne(piSchema);
    
    await LoggerService.logEvent({
      level: "info",
      category: "PI_CREATE",
      action: "CREATE_PI_SEND_SUCCESS",
      user: LoggerService.extractUserInfo(req),
      data: { piId: piSchema.piId, attributeName },
      performance: { responseTime: LoggerService.calculateResponseTime(process.hrtime()) }
    }, LoggerService.MODULES.PI_ADMIN);
    
    return res.json({
      token: "200",
      response: "Successfully created in database",
      piData: piSchema,
    });
  } catch (err) {
    await LoggerService.logError({
      level: "error",
      category: "PI_CREATE",
      action: "CREATE_PI_SEND_FAILED",
      user: LoggerService.extractUserInfo(req),
      error: { message: err.message, stack: err.stack }
    }, LoggerService.MODULES.PI_ADMIN);
    
    console.error("Error creating pi Send:", err);
    return res.status(204).json({
      token: "500",
      response: "Failed to create pi Send",
      error: err.message,
    });
  }
};

const get_pi_send = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.PI_COLLECTION;

    const { fields } = req.query;
    let projection = {};

    let filters = {};
    const orgId = req.body.orgId;

    if (orgId) {
      filters.orgId = orgId;
    }

    if (fields) {
      const fieldArray = fields.split(",").map((field) => field.trim());
      fieldArray.forEach((field) => {
        projection[field] = 1;
      });
    }

    const result = await db
      .collection(collectionName)
      .find({ piType: "Send",...filters  }, { projection })
      .toArray();

    if (result && result.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched PI Send records",
        piData: result,
      });
    } else {
      return res.status(204).json({
        token: "204",
        response: "No PI Send records found",
      });
    }
  } catch (err) {
    console.error("Error fetching PI Send records:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch PI Send records",
      error: err.message,
    });
  }
};

const get_pi_send_byId = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.PI_COLLECTION;

    const piId = req.params.id;
    const { fields } = req.query;

    if (!piId) {
      return res.status(400).json({
        token: "400",
        response: "PI ID is required",
      });
    }

    let projection = {};
    if (fields) {
      const fieldArray = fields.split(",").map((field) => field.trim());
      fieldArray.forEach((field) => {
        projection[field] = 1;
      });
    }

    const result = await db.collection(collectionName).findOne(
      {
        piId: piId,
        piType: "Send",
      },
      { projection }
    );

    if (result) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched PI Send record",
        piData: result,
      });
    } else {
      return res.status(404).json({
        token: "404",
        response: "PI Send record not found",
      });
    }
  } catch (err) {
    console.error("Error fetching PI Send record by ID:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch PI Send record",
      error: err.message,
    });
  }
};

const update_pi_send = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.PI_COLLECTION;

    const piId = req.params.id; // This is the _id from frontend
    const updateData = req.body;

    if (!piId) {
      return res.status(400).json({
        token: "400",
        response: "PI ID is required",
      });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        token: "400",
        response: "Update data is required",
      });
    }

    // Find existing record by _id
    const existingPI = await db.collection(collectionName).findOne({
      _id: new ObjectId(piId),
      piType: "Send"
    });

    if (!existingPI) {
      return res.status(404).json({
        token: "404",
        response: "PI Send record not found",
      });
    }

    // Check for duplicate attributeName if it's being changed
    if (updateData.attributeName && updateData.attributeName !== existingPI.attributeName) {
      const duplicateCheck = await db.collection(collectionName).findOne({
        attributeName: updateData.attributeName,
        orgId: existingPI.orgId,
        piType: "Send",
        _id: { $ne: new ObjectId(piId) }
      });

      if (duplicateCheck) {
        return res.status(400).json({
          token: "400",
          response: "PI with same attribute name already exists in this organization",
        });
      }
    }

    // Prepare update - remove fields that shouldn't be updated
    delete updateData._id;
    delete updateData.piId;
    delete updateData.createdOn;
    delete updateData.createdBy;
    delete updateData.piType;
    
    updateData.updatedOn = new Date();

    // Update the record
    const result = await db.collection(collectionName).updateOne(
      { _id: new ObjectId(piId), piType: "Send" },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        token: "404",
        response: "PI Send record not found",
      });
    }

    // Fetch updated record
    const updatedPI = await db.collection(collectionName).findOne({
      _id: new ObjectId(piId),
      piType: "Send"
    });

    await LoggerService.logEvent({
      level: "info",
      category: "PI_UPDATE",
      action: "UPDATE_PI_SEND_SUCCESS",
      user: LoggerService.extractUserInfo(req),
      data: { piId: updatedPI.piId, attributeName: updatedPI.attributeName },
      performance: { responseTime: LoggerService.calculateResponseTime(process.hrtime()) }
    }, LoggerService.MODULES.PI_ADMIN);

    return res.status(200).json({
      token: "200",
      response: "PI Send record updated successfully",
      piData: updatedPI,
    });
  } catch (err) {
    await LoggerService.logError({
      level: "error",
      category: "PI_UPDATE",
      action: "UPDATE_PI_SEND_FAILED",
      user: LoggerService.extractUserInfo(req),
      error: { message: err.message, stack: err.stack }
    }, LoggerService.MODULES.PI_ADMIN);

    console.error("Error updating PI Send record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to update PI Send record",
      error: err.message,
    });
  }
};

const delete_pi_send = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.PI_COLLECTION;

    const piId = req.params.id;

    if (!piId) {
      return res.status(400).json({
        token: "400",
        response: "PI ID is required",
      });
    }

    const existingPI = await db.collection(collectionName).findOne({
      piId: piId,
      piType: "Send",
    });

    if (!existingPI) {
      return res.status(404).json({
        token: "404",
        response: "PI Send record not found",
      });
    }

    const result = await db.collection(collectionName).deleteOne({
      piId: piId,
      piType: "Send",
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        token: "404",
        response: "PI Send record not found",
      });
    }

    return res.status(200).json({
      token: "200",
      response: "PI Send record deleted successfully",
      deletedPI: existingPI,
    });
  } catch (err) {
    console.error("Error deleting PI Send record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to delete PI Send record",
      error: err.message,
    });
  }
};

export default {
  post_pi_send,
  get_pi_send,
  get_pi_send_byId,
  update_pi_send,
  delete_pi_send,
};
 