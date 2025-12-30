import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const postWebService = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;

    const { webserviceId, wsName, wsURL, wsHeaders, wsBody, wsAuth, authType, description, active, method, apiType } = req.body;

    const newObjectId = new ObjectId();

    if (!webserviceId || !wsName) {
      return res.status(400).json({
        token: "400",
        response: "Webservice details is required and cannot be empty",
      });
    }

    const existingWebservice = await db.collection(collectionName).findOne({ webserviceId: webserviceId });
    if (existingWebservice) {
      return res.status(400).json({
        token: "400",
        response: "Webservice with same ID already exists",
      });
    }

    const webserviceSchema = {
      _id: newObjectId,
      webserviceId,
      wsName,
      wsURL,
      wsHeaders,
      wsBody,
      wsAuth,
      authType,
      description,
      active,
      method,
      apiType,
      createdOn: new Date(),
      modifiedOn: new Date()
    };

    const result = await db.collection(collectionName).insertOne(webserviceSchema);
    return res.json({
      token: "200",
      response: "Successfully created in database",
      result
    });
  } catch (err) {
    return res
      .status(500)
      .json({
        token: "500",
        response: "Failed to create Webservice Send",
        error: err.message,
      });
  }
};

const getWebService = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;
    
    let projection = { externalData: 0, externalDataCount: 0, externalField: 0, internalField: 0, mappedField: 0, isTimeStamp: 0, mongoCollection: 0, sourceTree:0,targetTree:0,mappings:0};

    const result = await db.collection(collectionName).find({}, { projection }).toArray();

    if (result && result.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched Webservice records",
        result
      });
    } else {
      return res.status(204).json({
        token: "204",
        response: "No Webservice records found"
      });
    }
  } catch (err) {
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch Webservice records",
      error: err.message
    });
  }
};

const getWebServiceById = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;

    const webserviceId = req.params.id;

    if (!webserviceId) {
      return res.status(400).json({
        token: "400",
        response: "Webservice ID is required"
      });
    }

    let projection = {};

    const result = await db.collection(collectionName).findOne({
      webserviceId: webserviceId
    }, { projection });

    if (result) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched Webservice record",
        dataSourceData: result
      });
    } else {
      return res.status(404).json({
        token: "404",
        response: "Webservice record not found"
      });
    }
  } catch (err) {
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch Webservice record",
      error: err.message
    });
  }
};

const getWebServiceMap = async function (req, res) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;

    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        token: "400",
        response: "Webservice ID is required"
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        token: "400",
        response: "Invalid Webservice _id format"
      });
    }

    const objectId = new ObjectId(id);

    let projection = { externalData: 1, externalDataCount: 1, externalField: 1, internalField: 1, mappedField: 1, isTimeStamp: 1, mongoCollection: 1, sourceTree:1,targetTree:1,mappings:1, _id: 0};
    
    const result = await db.collection(collectionName).findOne({
      _id: objectId
    }, { projection });

    return res.status(200).json({
      token: "200",
      response: "Successfully fetched Webservice Mapping record",
      mapData: result
    });
  } catch (err) {
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch Webservice mapping record",
      error: err.message
    });
  }
}

const putWebService = async function (req, res) {
  try {
    const db = await connectToMongoDB();
    const col = db.collection(process.env.WEBSERVICE_COLLECTION);

    const id = req.params.id;
    const updateData = req.body;

    if (!id) {
      return res.status(400).json({
        token: "400",
        response: "Webservice ID is required"
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        token: "400",
        response: "Invalid Webservice _id format"
      });
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({
        token: "400",
        response: "At least one field should be provided for update"
      });
    }

    updateData.modifiedOn = new Date();


    const objectId = new ObjectId(id);

    const existing = await col.findOne({ _id: objectId });

    if (!existing) {
      return res.status(404).json({
        token: "404",
        response: "Webservice record not found"
      });
    }

    console.log(JSON.stringify(updateData), objectId)

    await col.updateOne(
      { _id: objectId },
      { $set: updateData }
    );

    return res.status(200).json({
      token: "200",
      response: "Webservice record updated successfully",
      updatedWebService: { ...existing, ...updateData }
    });

  } catch (err) {
    return res.status(500).json({
      token: "500",
      response: "Failed to update Webservice record",
      error: err.message
    });
  }
};


const deleteWebService = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.WEBSERVICE_COLLECTION;

    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        token: "400",
        response: "Webservice ID is required"
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        token: "400",
        response: "Invalid Webservice _id format"
      });
    }

    const objectId = new ObjectId(id);

    const existingWebservice = await db.collection(collectionName).findOne({
      _id: objectId
    });

    if (!existingWebservice) {
      return res.status(404).json({
        token: "404",
        response: "Webservice record not found"
      });
    }

    const result = await db.collection(collectionName).deleteOne({
      _id: objectId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        token: "404",
        response: "Webservice record not found"
      });
    }

    return res.status(200).json({
      token: "200",
      response: "Webservice record deleted successfully",
      deleteWebService: existingWebservice
    });
  } catch (err) {
    return res.status(500).json({
      token: "500",
      response: "Failed to delete Webservice record",
      error: err.message
    });
  }
};

export default { postWebService, getWebService, getWebServiceById, getWebServiceMap, putWebService, deleteWebService };