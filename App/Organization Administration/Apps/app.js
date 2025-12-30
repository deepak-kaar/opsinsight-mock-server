import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
import multer from "multer";
dotenv.config();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).single("appLogo");

const post_app = async function (req, res, next) {
  upload(req, res, async function (err) {
    if (err) {
      return res.status(500).json({
        token: "500",
        response: "Failed to upload file",
        error: err.message,
      });
    }

    try {
      const db = await connectToMongoDB();
      const appsCollectionName = process.env.APPS_COLLECTION;
      const newObjectId = new ObjectId();

      const appSchema = {
        _id: newObjectId,
        appId: newObjectId.toHexString(),
        appName: req.body.appName,
        appDescription: req.body.appDescription,
        appClassification: req.body.appClassification,
        adminRole: req.body.adminRole,
        appOwner: req.body.appOwner,
        appContact: req.body.appContact,
        appLogo: req.file ? req.file.buffer : null, // Store as binary
        appLogoName: req.file ? req.file.originalname : null, // Store file name
        appLogoType: req.file ? req.file.mimetype : null, // Store file type
        appStatus: "active",
        createdOn: new Date(),
      };

      const result = await db.collection(appsCollectionName).insertOne(appSchema);
      return res.json({
        token: "200",
        response: "Successfully created in database",
        app: appSchema,
      });
    } catch (err) {
      console.error("Error creating instance:", err);
      return res.status(500).json({
        token: "500",
        response: "Failed to create apps records",
        error: err.message,
      });
    }
  });
};

const get_app = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const appsCollectionName = process.env.APPS_COLLECTION;

    const result = await db.collection(appsCollectionName).find().toArray();
    if (result.length > 0) {
      return res.json({ token: "200", apps: result });
    } else {
      return res.status(404).json({ token: "404", response: "Apps not found" });
    }
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      token: "500",
      response: "Error fetching data from MongoDB",
      error: err.message,
    });
  }
};

const get_app_ID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.APPS_COLLECTION;
    const appId = req.params.id;

    if (!ObjectId.isValid(appId)) {
      return res.status(400).json({ token: "400", response: "Invalid appId" });
    }

    const appJson = await db.collection(CollectionName).findOne({ appId, appSchema: "active" });

    if (appJson) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched app data",
        appJson,
      });
    } else {
      return res.status(404).json({ token: "404", response: "No app found for this Id" });
    }
  } catch (err) {
    console.error("Error fetching appJson:", err);
    return res.status(500).json({
      token: "500",
      response: "Error fetching appJson",
      error: err.message,
    });
  }
};

const update_app = async function (req, res, next) {
  upload(req, res, async function (err) {
    try {
      const db = await connectToMongoDB();
      const CollectionName = process.env.APPS_COLLECTION;
      const { appId } = req.body;

      if (!appId || !ObjectId.isValid(appId)) {
        return res.status(400).json({
          token: "400",
          response: "Valid appId is required",
        });
      }

      const existingApp = await db.collection(CollectionName).findOne({ appId });
      if (!existingApp) {
        return res.status(404).json({
          token: "404",
          response: "No record found with the provided appId",
        });
      }

      const updatedApp = {
        appName: req.body.appName || existingApp.appName,
        appDescription: req.body.appDescription || existingApp.appDescription,
        appClassification: req.body.appClassification || existingApp.appClassification,
        adminRole: req.body.adminRole || existingApp.adminRole,
        appOwner: req.body.appOwner || existingApp.appOwner,
        appContact: req.body.appContact || existingApp.appContact,
        appLogo: req.file ? req.file.buffer : existingApp.appLogo,
        appLogoName: req.file ? req.file.originalname : existingApp.appLogoName,
        appStatus: req.body.appStatus || existingApp.appStatus,
        appLogoType: req.file ? req.file.mimetype : existingApp.appLogoType,
      };

      await db.collection(CollectionName).updateOne({ appId }, { $set: updatedApp });
      return res.json({ token: "200", response: "Successfully updated", updatedApp });
    } catch (err) {
      console.error("Error while updating:", err);
      return res.status(500).json({
        token: "500",
        response: "Failed to update",
        error: err.message,
      });
    }
  });
};

// const delete_app = async function (req, res, next) {
//   try {
//     const db = await connectToMongoDB();
//     const appsCollectionName = process.env.APPS_COLLECTION;

//     const appId = req.params.id;

//     if (!ObjectId.isValid(appId)) {
//       return res.status(400).json({ token: "400", response: "Invalid ID format" });
//     }

//     const result = await db.collection(appsCollectionName).deleteOne({ _id: new ObjectId(appId) });

//     if (result.deletedCount === 1) {
//       return res.json({ token: "200", appId, response: "App deleted successfully" });
//     } else {
//       return res.status(404).json({ token: "404", response: "App not found" });
//     }
//   } catch (err) {
//     console.error("Error deleting app from MongoDB:", err);
//     return res.status(500).json({
//       token: "500",
//       response: "Error deleting app from MongoDB",
//       error: err.message,
//     });
//   }
// };


const delete_app = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const appsCollectionName = process.env.APPS_COLLECTION;
    const orgsCollectionName = process.env.ORGANIZATION_COLLECTION;

    const appId = req.params.id;

    if (!ObjectId.isValid(appId)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }


    // Step 1: Check if appId exists in org or nested dataAccess
    const isAppInUse = await db.collection(orgsCollectionName).findOne({
      $or: [
        { appId: appId },
        { "dataAccess.appId": appId },
        { "dataAccess.dataAccess.appId": appId } // handles 2-level deep nesting
      ]
    });

    if (isAppInUse) {
      return res.status(409).json({
        token: "409",
        response: "App is in use by one or more organizations. Cannot delete.",
      });
    }

    // Step 2: Update appStatus to false (soft delete)
    const updateResult = await db.collection(appsCollectionName).updateOne(
      { appId: appId },
      { $set: { appStatus: "inactive" } }
    );


    if (updateResult.modifiedCount === 1) {
      return res.json({ token: "200", appId, response: "App marked as inactive (soft deleted)" });
    } else {
      return res.status(404).json({ token: "404", response: "App not found or already inactive" });
    }
  } catch (err) {
    console.error("Error updating app in MongoDB:", err);
    return res.status(500).json({
      token: "500",
      response: "Error updating app in MongoDB",
      error: err.message,
    });
  }
};


// Added by Rangararao for frequency admin

/**
 * Creates a new frequency document in the MongoDB collection.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Sends a JSON response indicating success or failure.
 */
const create_freq = async (req, res) => {
  try {
    const { appId, frequencyName, frequencyType, frequencyDescription, superType, duration, startTime } = req.body;

    // Validate required fields
    if (!appId) {
      return res.status(422).json({
        token: "422",
        response: "Mandatory fields are missing",
      });
    }

    const db = await connectToMongoDB();
    const frequencyCollection = 'Frequency';

    const newObjectId = new ObjectId();

    const frequencySchema = {
      _id: newObjectId,
      frequencyId: newObjectId.toHexString(),
      frequencyName: frequencyName || '',
      frequencyType: frequencyType || '',
      frequencyDescription: frequencyDescription || '',
      superType: superType || '',
      duration: duration || '',
      startTime: startTime || '',
      appId,
      createdBy: 'goparx0b',
      modifiedBy: null,
      modifiedOn: new Date(),
      createdOn: new Date(),
    };

    await db.collection(frequencyCollection).insertOne(frequencySchema);

    return res.status(201).json({
      token: "201",
      appId,
      response: "Frequency created successfully",
    });
  } catch (err) {
    return res.status(500).json({
      token: "500",
      response: "Error creating frequency",
      error: err.message,
    });
  }
};

/**
 * Fetches the list of frequencies from the MongoDB collection based on application Id.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Sends a JSON response indicating success or failure.
 */
const get_freqs = async function (req, res) {
  try {
    const appId = req.body.appId;
    if (!appId) {
      return res.status(422).json({
        token: "422",
        response: "Application Id is mandatory",
      });
    }
    const db = await connectToMongoDB();
    const freqsCollectionName = 'Frequency';

    const result = await db.collection(freqsCollectionName).find({ appId: appId }).toArray();

    if (result.length > 0) {
      return res.json({ token: "200", freqs: result });
    } else {
      return res.status(404).json({ token: "404", response: "Frequency not found" });
    }


  } catch (err) {
    console.error("Error fetching frequencies:", err);
    return res.status(500).json({
      token: "500",
      response: "Error fetching data from MongoDB",
      error: err.message,
    });
  }
};


/**
 * gets frequency details document from the MongoDB collection based on frequency Id.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Sends a JSON response indicating success or failure.
 */
const get_freq_id = async (req, res) => {
  try {
    const db = await connectToMongoDB();
    const CollectionName = 'Frequency';
    const freqId = req.params.id;

    if (!ObjectId.isValid(freqId)) {
      return res.status(400).json({ token: "400", response: "Invalid Frequency Id" });
    }

    const frequency = await db.collection(CollectionName).findOne({ frequencyId: freqId });

    if (frequency) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched frequency data",
        frequency,
      });
    } else {
      return res.status(404).json({ token: "404", response: "No frequency found for this Id" });
    }
  } catch (err) {
    console.error("Error fetching appJson:", err);
    return res.status(500).json({
      token: "500",
      response: "Error fetching frequency",
      error: err.message,
    });
  }
}


/**
 * Updates frequency details document in the MongoDB collection based on frequency Id.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Sends a JSON response indicating success or failure.
 */
const update_freq = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = 'Frequency';
    const { freqId, appId, frequencyName, frequencyType, frequencyDescription } = req.body;

    if (!freqId || !ObjectId.isValid(freqId)) {
      return res.status(400).json({
        token: "400",
        response: "Valid Frequency Id is required",
      });
    }

    const existingFreq = await db.collection(CollectionName).findOne({ frequencyId: freqId });
    if (!existingFreq) {
      return res.status(404).json({
        token: "404",
        response: "No record found with the provided appId",
      });
    }

    const frequencySchema = {
      frequencyName: frequencyName || '',
      frequencyType: frequencyType || '',
      frequencyDescription: frequencyDescription || '',
      appId,
      modifiedBy: 'goparx0b',
      modifiedOn: new Date(),
    };

    await db.collection(CollectionName).updateOne({ frequencyId: freqId }, { $set: frequencySchema });
    return res.json({ token: "200", response: "Successfully updated", frequencySchema });
  } catch (err) {
    console.error("Error while updating:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to update",
      error: err.message,
    });
  }
};

/**
 * deletes frequency details document from the MongoDB collection based on frequency Id.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Sends a JSON response indicating success or failure.
 */
const delete_freq = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = 'Frequency';

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({ token: "200", id, response: "Frequency deleted successfully" });
    } else {
      return res.status(404).json({ token: "404", response: "Frequency not found" });
    }
  } catch (err) {
    console.error("Error deleting Frequency:", err);
    return res.status(500).json({
      token: "500",
      response: "Error deleting Frequency",
      error: err.message,
    });
  }
};


export default { post_app, get_app, get_app_ID, update_app, delete_app, create_freq, get_freqs, get_freq_id, update_freq, delete_freq };
