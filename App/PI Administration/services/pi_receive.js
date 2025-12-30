import { connectToMongoDB } from "../../../config/connection.js";
import LoggerService from "../../../services/logger.service.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const post_pi_receive = async function (req, res, next) {
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
      tagNumber,
      piReceiveStatus,
      extType,
      freqType,
      systemName
    } = req.body;

    const newObjectId = new ObjectId();

    // Validate required fields
    if (!attributeName || attributeName.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "Attribute name is required and cannot be empty",
      });
    }

    if (!tagNumber || tagNumber.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "Tag number is required and cannot be empty",
      });
    }

    // if (!orgId || orgId.trim() === "") {
    //   return res.status(400).json({
    //     token: "400",
    //     response: "Organization ID is required",
    //   });
    // }

    // Check for duplicate tagNumber within the SAME organization
    // Different organizations CAN have the same tag number
    const existingPi = await db
      .collection(collectionName)
      .findOne({ 
        tagNumber: tagNumber,
        orgId: orgId,
        piType: "Receive"
      });

    if (existingPi) {
      return res.status(400).json({
        token: "400",
        response: "PI receive with same tag number already exists in this organization",
      });
    }

    const piSchema = {
      _id: newObjectId,
      piId: newObjectId.toHexString(),
      piType: "Receive",
      attributeId: attributeId || "",
      attributeName: attributeName,
      piDesc: piDesc || "",
      piTagNumber: piTagNumber || "",
      tagNumber: tagNumber,
      piReceiveStatus: piReceiveStatus || "active",
      extType: extType || "",
      freqType: freqType || "",
      systemName: systemName || "",
      appId: appId || "",
      appName: appName || "",
      orgId: orgId,
      orgName: orgName || "",
      createdOn: new Date(),
      createdBy: req.user?.username || "system"
    };

    const result = await db.collection(collectionName).insertOne(piSchema);
    
    await LoggerService.logEvent({
      level: "info",
      category: "PI_CREATE",
      action: "CREATE_PI_RECEIVE_SUCCESS",
      user: LoggerService.extractUserInfo(req),
      data: { piId: piSchema.piId, attributeName, tagNumber },
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
      action: "CREATE_PI_RECEIVE_FAILED",
      user: LoggerService.extractUserInfo(req),
      error: { message: err.message, stack: err.stack }
    }, LoggerService.MODULES.PI_ADMIN);
    
    console.error("Error creating pi Receive:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to create pi Receive",
      error: err.message,
    });
  }
};

const get_pi_receive = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.PI_COLLECTION;

    const { fields } = req.query;
    let projection = {};

    let filters = { piType: "Receive" };
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
      .find(filters, { projection })
      .toArray();

    if (result && result.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched PI Receive records",
        piData: result,
      });
    } else {
      return res.status(204).json({
        token: "204",
        response: "No PI Receive records found",
      });
    }
  } catch (err) {
    console.error("Error fetching PI Receive records:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch PI Receive records",
      error: err.message,
    });
  }
};

const get_pi_receive_byId = async function (req, res, next) {
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
        piType: "Receive",
      },
      { projection }
    );

    if (result) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched PI Receive record",
        piData: result,
      });
    } else {
      return res.status(404).json({
        token: "404",
        response: "PI Receive record not found",
      });
    }
  } catch (err) {
    console.error("Error fetching PI Receive record by ID:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch PI Receive record",
      error: err.message,
    });
  }
};

const update_pi_receive = async function (req, res, next) {
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
      piType: "Receive"
    });

    if (!existingPI) {
      return res.status(404).json({
        token: "404",
        response: "PI Receive record not found",
      });
    }

    // Check for duplicate tagNumber if it's being changed
    // Only check within the same organization
    if (updateData.tagNumber && updateData.tagNumber !== existingPI.tagNumber) {
      const duplicateCheck = await db.collection(collectionName).findOne({
        tagNumber: updateData.tagNumber,
        orgId: existingPI.orgId,
        piType: "Receive",
        _id: { $ne: new ObjectId(piId) }
      });

      if (duplicateCheck) {
        return res.status(400).json({
          token: "400",
          response: "PI receive with same tag number already exists in this organization",
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
    updateData.modifiedBy = req.user?.username || "system";

    // Update the record
    const result = await db.collection(collectionName).updateOne(
      { _id: new ObjectId(piId), piType: "Receive" },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        token: "404",
        response: "PI Receive record not found",
      });
    }

    // Fetch updated record
    const updatedPI = await db.collection(collectionName).findOne({
      _id: new ObjectId(piId),
      piType: "Receive"
    });

    await LoggerService.logEvent({
      level: "info",
      category: "PI_UPDATE",
      action: "UPDATE_PI_RECEIVE_SUCCESS",
      user: LoggerService.extractUserInfo(req),
      data: { piId: updatedPI.piId, attributeName: updatedPI.attributeName, tagNumber: updatedPI.tagNumber },
      performance: { responseTime: LoggerService.calculateResponseTime(process.hrtime()) }
    }, LoggerService.MODULES.PI_ADMIN);

    return res.status(200).json({
      token: "200",
      response: "PI Receive record updated successfully",
      piData: updatedPI,
    });
  } catch (err) {
    await LoggerService.logError({
      level: "error",
      category: "PI_UPDATE",
      action: "UPDATE_PI_RECEIVE_FAILED",
      user: LoggerService.extractUserInfo(req),
      error: { message: err.message, stack: err.stack }
    }, LoggerService.MODULES.PI_ADMIN);

    console.error("Error updating PI Receive record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to update PI Receive record",
      error: err.message,
    });
  }
};

const delete_pi_receive = async function (req, res, next) {
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
      piType: "Receive",
    });

    if (!existingPI) {
      return res.status(404).json({
        token: "404",
        response: "PI Receive record not found",
      });
    }

    const result = await db.collection(collectionName).deleteOne({
      piId: piId,
      piType: "Receive",
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        token: "404",
        response: "PI Receive record not found",
      });
    }

    await LoggerService.logEvent({
      level: "info",
      category: "PI_DELETE",
      action: "DELETE_PI_RECEIVE_SUCCESS",
      user: LoggerService.extractUserInfo(req),
      data: { piId: existingPI.piId, attributeName: existingPI.attributeName },
      performance: { responseTime: LoggerService.calculateResponseTime(process.hrtime()) }
    }, LoggerService.MODULES.PI_ADMIN);

    return res.status(200).json({
      token: "200",
      response: "PI Receive record deleted successfully",
      deletedPI: existingPI,
    });
  } catch (err) {
    await LoggerService.logError({
      level: "error",
      category: "PI_DELETE",
      action: "DELETE_PI_RECEIVE_FAILED",
      user: LoggerService.extractUserInfo(req),
      error: { message: err.message, stack: err.stack }
    }, LoggerService.MODULES.PI_ADMIN);

    console.error("Error deleting PI Receive record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to delete PI Receive record",
      error: err.message,
    });
  }
};

export default {
  post_pi_receive,
  get_pi_receive,
  get_pi_receive_byId,
  update_pi_receive,
  delete_pi_receive,
};