import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const post_webservice = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;

    const { sysId, sysName, sysType, active, description, operatingFacility, lastConnectionDate, lastRunDuration, lastConnectionSts, userJson } = req.body;

    const newObjectId = new ObjectId();

    if (!sysId || !sysName) {
      return res.status(400).json({
        token: "400",
        response: "WebService details are required and cannot be empty",
      });
    }

    const existing = await db.collection(collectionName).findOne({ sysId: sysId });
    if (existing) {
      return res.status(400).json({
        token: "400",
        response: "WebService with same system ID already exists",
      });
    }

    const webServiceSchema = {
      _id: newObjectId,
      webServiceId: newObjectId.toHexString(),
      sysId,
      sysName,
      sysType,
      active,
      description,
      operatingFacility,
      lastConnectionDate,
      lastRunDuration,
      lastConnectionSts,
      createdOn: new Date(),
      userJson,
    };

    await db.collection(collectionName).insertOne(webServiceSchema);
    return res.json({
      token: "200",
      response: "Successfully created WebService",
      webServiceData: webServiceSchema,
    });
  } catch (err) {
    console.error("Error creating WebService:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to create WebService",
      error: err.message,
    });
  }
};

const get_webservice = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;

    const { fields } = req.query;
    let projection = {};

    if (fields) {
      const fieldArray = fields.split(',').map((f) => f.trim());
      fieldArray.forEach((f) => {
        projection[f] = 1;
      });
    }

    const result = await db.collection(collectionName).find({}, { projection }).toArray();

    if (result && result.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched WebService records",
        webServiceData: result,
      });
    } else {
      return res.status(204).json({
        token: "204",
        response: "No WebService records found",
      });
    }
  } catch (err) {
    console.error("Error fetching WebService records:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch WebService records",
      error: err.message,
    });
  }
};

const get_webservice_byId = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;

    const webServiceId = req.params.id;
    const { fields } = req.query;

    if (!webServiceId) {
      return res.status(400).json({
        token: "400",
        response: "WebService ID is required",
      });
    }

    let projection = {};
    if (fields) {
      const fieldArray = fields.split(',').map((f) => f.trim());
      fieldArray.forEach((f) => {
        projection[f] = 1;
      });
    }

    const result = await db.collection(collectionName).findOne({ webServiceId }, { projection });

    if (result) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched WebService record",
        webServiceData: result,
      });
    } else {
      return res.status(404).json({
        token: "404",
        response: "WebService record not found",
      });
    }
  } catch (err) {
    console.error("Error fetching WebService record by ID:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch WebService record",
      error: err.message,
    });
  }
};

const update_webservice = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;

    const webServiceId = req.params.id;
    const updateData = req.body;

    if (!webServiceId) {
      return res.status(400).json({
        token: "400",
        response: "WebService ID is required",
      });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        token: "400",
        response: "Update data is required",
      });
    }

    if (updateData.sysId) {
      const duplicateCheck = await db.collection(collectionName).findOne({
        sysId: updateData.sysId,
        webServiceId: { $ne: webServiceId },
      });

      if (duplicateCheck) {
        return res.status(400).json({
          token: "400",
          response: "WebService with same system ID already exists",
        });
      }
    }

    delete updateData._id;
    delete updateData.createdOn;
    updateData.webServiceId = webServiceId;
    updateData.updatedOn = new Date();

    const result = await db.collection(collectionName).updateOne(
      { webServiceId },
      {
        $set: updateData,
        $setOnInsert: {
          _id: new ObjectId(),
          createdOn: new Date(),
        },
      },
      { upsert: true }
    );

    const upserted = await db.collection(collectionName).findOne({ webServiceId });

    const responseMessage = result.upsertedCount > 0
      ? "WebService record created successfully"
      : "WebService record updated successfully";

    return res.status(200).json({
      token: "200",
      response: responseMessage,
      webServiceData: upserted,
    });
  } catch (err) {
    console.error("Error upserting WebService record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to upsert WebService record",
      error: err.message,
    });
  }
};

const delete_webservice = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;

    const webServiceId = req.params.id;

    if (!webServiceId) {
      return res.status(400).json({
        token: "400",
        response: "WebService ID is required",
      });
    }

    const existing = await db.collection(collectionName).findOne({ webServiceId });

    if (!existing) {
      return res.status(404).json({
        token: "404",
        response: "WebService record not found",
      });
    }

    const result = await db.collection(collectionName).deleteOne({ webServiceId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        token: "404",
        response: "WebService record not found",
      });
    }

    return res.status(200).json({
      token: "200",
      response: "WebService record deleted successfully",
      deletedWebService: existing,
    });
  } catch (err) {
    console.error("Error deleting WebService record:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to delete WebService record",
      error: err.message,
    });
  }
};

export default { post_webservice, get_webservice, get_webservice_byId, update_webservice, delete_webservice };

