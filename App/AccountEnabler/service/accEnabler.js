import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";

async function getAllUserEnablers(req, res) {
  try {
    const db = await connectToMongoDB();

    const collectionName = process.env.ACCOUNT_ENABLER;

    const collection = db.collection(collectionName);

    const result = await collection.find().toArray();

    return res.status(200).json({
      token: "200",
      response: "Successfully fetched user enablers",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch user enablers",
      error: error.message,
    });
  }
}

async function getRoles(req, res) {
  try {
    const db = await connectToMongoDB();

    const appId = req.query.appId;
    const orgId = req.query.orgId;

    if (!appId || !orgId) {
      return res.status(400).json({
        token: '400',
        response: 'App and Org should not be empty'
      });
    }

    let filters = { appId, orgId };

    const rolesCollection = db.collection(process.env.ROLES_COLLECTION);
    const appsCollection = db.collection(process.env.APPS_COLLECTION);
    const orgsCollection = db.collection(process.env.ORGANIZATION_COLLECTION);

    // Fetch roles
    const roles = await rolesCollection
      .find(filters, {
        projection: { _id: 1, roleName: 1, roleId: 1, appId: 1, orgId: 1 }
      })
      .toArray();

    if (!roles.length) {
      return res.status(200).json({
        token: "200",
        response: "No roles found",
        data: []
      });
    }

    // Extract unique appIds and orgIds
    const appIds = [...new Set(roles.map(r => r.appId))];
    const orgIds = [...new Set(roles.map(r => r.orgId))];

    // Fetch appNames
    const apps = await appsCollection
      .find({ appId: { $in: appIds } })
      .project({ appId: 1, appName: 1 })
      .toArray();

    // Fetch orgNames
    const orgs = await orgsCollection
      .find({ orgId: { $in: orgIds } })
      .project({ orgId: 1, orgName: 1 })
      .toArray();

    // Convert to maps for fast lookup
    const appMap = Object.fromEntries(apps.map(a => [a.appId, a.appName]));
    const orgMap = Object.fromEntries(orgs.map(o => [o.orgId, o.orgName]));

    // Final transformation
    const formatted = roles.map(role => {
      const appName = appMap[role.appId] || "";
      const orgName = orgMap[role.orgId] || "";

      const label = `MA_OPSINSIGHT_${appName}_${orgName}_${role.roleName}`;

      return {
        id: role._id.toString(),
        roleName: role.roleName,
        roleId: role.roleId,
        appId: role.appId,
        orgId: role.orgId,
        appName,
        orgName,
        label
      };
    });

    return res.status(200).json({
      token: "200",
      response: "Successfully fetched roles",
      data: formatted
    });

  } catch (error) {
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch roles",
      error: error.message
    });
  }
}


async function getUserEnablersById(req, res) {
  try {
    const db = await connectToMongoDB();

    const collectionName = process.env.ACCOUNT_ENABLER;

    const id = req.params.id;


    if (!id) {
      return res.status(400).json({
        token: "400",
        response: "ID is required"
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        token: "400",
        response: "Invalid _id format"
      });
    }

    const objectId = new ObjectId(id);

    let projection = {};

    const result = await db.collection(collectionName).findOne({
      _id: objectId
    }, { projection });

    if (result) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched record",
        data: result
      });
    } else {
      return res.status(404).json({
        token: "404",
        response: "Record not found"
      });
    }
  } catch (error) {
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch user enablers",
      error: error.message,
    });
  }
}

async function createUserEnabler(req, res) {
  try {
    const newData = req.body;

    if (!newData || Object.keys(newData).length === 0) {
      return res.status(400).json({
        token: "400",
        response: "Request body is empty. Please send valid data.",
      });
    }


    if (!newData.duration) {
      return res.status(400).json({
        token: "400",
        response: "Duration is required."
      });
    }

    const db = await connectToMongoDB();
    const collection = db.collection(process.env.ACCOUNT_ENABLER);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + parseInt(newData.duration) * 60 * 1000);

    const record = {
      ...newData,
      isActive: true,
      createdAt: now,
      expiresAt
    };

    const result = await collection.insertOne(record);

    return res.status(201).json({
      token: "201",
      response: "User enabler created successfully",
      data: record,
    });

  } catch (error) {
    return res.status(500).json({
      token: "500",
      response: "Failed to create user enabler",
      error: error.message,
    });
  }
}


const putUserEnablerById = async function (req, res) {
  try {
    const db = await connectToMongoDB();
    const col = db.collection(process.env.ACCOUNT_ENABLER);

    const id = req.params.id;
    const updateData = req.body;

    if (!id) {
      return res.status(400).json({ token: "400", response: "ID is required" });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid _id format" });
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({ token: "400", response: "At least one field should be provided" });
    }

    const objectId = new ObjectId(id);
    const existing = await col.findOne({ _id: objectId });

    if (!existing) {
      return res.status(404).json({
        token: "404",
        response: "Record not found"
      });
    }

    // -------------------------------------------------------------------
    // 🚀 Automatic Reactivation Logic (based on isActive toggle in UI)
    // -------------------------------------------------------------------
    const wasInactive = existing.isActive === false;
    const nowActive = updateData.isActive === true;

    if (wasInactive && nowActive) {
      // Reactivation triggered
      const now = new Date();

      // Duration is sent as "2", "3", "5", "7" (minutes)
      const durationMinutes = parseInt(updateData.duration);

      if (isNaN(durationMinutes) || durationMinutes <= 0) {
        return res.status(400).json({
          token: "400",
          response: "Invalid duration format for reactivation"
        });
      }

      updateData.expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
      updateData.reactivatedAt = now;
    }
    // -------------------------------------------------------------------

    updateData.modifiedOn = new Date();

    await col.updateOne({ _id: objectId }, { $set: updateData });

    return res.status(200).json({
      token: "200",
      response: "Record updated successfully",
      updatedEnabler: { ...existing, ...updateData }
    });

  } catch (err) {
    return res.status(500).json({
      token: "500",
      response: "Failed to update record",
      error: err.message
    });
  }
};


const deleteUserEnabler = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.ACCOUNT_ENABLER;

    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        token: "400",
        response: "ID is required"
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        token: "400",
        response: "Invalid _id format"
      });
    }

    const objectId = new ObjectId(id);

    const existingData = await db.collection(collectionName).findOne({ _id: objectId });

    if (!existingData) {
      return res.status(404).json({
        token: "404",
        response: "Record not found"
      });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: objectId });

    return res.status(200).json({
      token: "200",
      response: "Record deleted successfully",
      deletedId: id
    });

  } catch (err) {
    return res.status(500).json({
      token: "500",
      response: "Failed to delete record",
      error: err.message
    });
  }
};


async function getUserRole(req, res) {
  try {
    const db = await connectToMongoDB();
    const { user } = req.query;

    if (!user) {
      return res.status(400).json({
        token: "400",
        response: "User parameter is required"
      });
    }

    const collection = db.collection("Acc_Enabler_Test_User");
    
    // If user not found, return first user as fallback for testing
    let userRecord = await collection.findOne({ user });
    if (!userRecord) {
      userRecord = await collection.findOne({});
    }

    if (!userRecord) {
      return res.status(404).json({
        token: "404",
        response: "No users found in collection"
      });
    }

    return res.status(200).json({
      token: "200",
      response: "User role fetched successfully",
      data: {
        user: userRecord.user,
        role: userRecord.user
      }
    });

  } catch (error) {
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch user role",
      error: error.message
    });
  }
}

export default { getAllUserEnablers, createUserEnabler, getUserEnablersById, putUserEnablerById, deleteUserEnabler, getRoles, getUserRole };
