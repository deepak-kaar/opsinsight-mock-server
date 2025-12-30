import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const post_roles = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.ROLES_COLLECTION;

    const newObjectId = new ObjectId();

    const roleSchema = {
      _id: newObjectId,
      roleId: newObjectId.toHexString(),
      roleName: req.body.roleName,
      roleDescription: req.body.roleDescription,
      appId: req.body.appId || null,
      orgId: req.body.orgId || null,
      defaultAccessLevel: req.body.defaultAccessLevel,
      roleLevel: req.body.roleLevel,
      roleLevelId: req.body.roleLevelId,
      roleStatus: req.body.roleStatus,
      idtId: req.body.idtId,
      adGroup: req.body.adGroup,
      createdOn: new Date()
    };

    const result = await db.collection(collectionName).insertOne(roleSchema);
    return res.json({ token: '200', response: 'Successfully created in database', roles: roleSchema });
  } catch (err) {
    console.error('Error creating instance:', err);
    return res.status(500).json({ token: '500', response: 'Failed to create entity', error: err.message });
  }
};

const get_roles = async function (req, res, next) {
  const { roleLevel, roleLevelId } = req.body;

  try {
    if (!roleLevel) {
      return res.status(422).json({ error: 'Roles level is required' });
    }

    const db = await connectToMongoDB();
    const collectionName = process.env.ROLES_COLLECTION;

    const query = { roleLevel: roleLevel, roleLevelId: roleLevelId };

    const roles = await db.collection(collectionName).find(query).toArray();

    return roles.length ? res.json({ token: '200', roles }) : res.status(404).json({ token: "404", error: 'Roles not found' });

  } catch (err) {
    console.error('Error fetching data from MongoDB:', err);
    return res.status(500).json({ error: 'Error fetching data from MongoDB', details: err.message });
  }
};

const get_roles_by_app = async function (req, res, next) {
  const { appId, orgId } = req.body;

  try {
    let filters = {}
    filters = {
      ...(appId && { appId: appId }),
      ...(orgId && { orgId: orgId }),
      ...(!appId && !orgId && { roleLevel: 'OpsInsight' })
    };
    const db = await connectToMongoDB();
    const collectionName = process.env.ROLES_COLLECTION;

    const roles = await db.collection(collectionName).find(filters).toArray();
    return res.json({ token: '200', roles });

  } catch (err) {
    console.error('Error fetching data from MongoDB:', err);
    return res.status(500).json({ error: 'Error fetching data from MongoDB', details: err.message });
  }
};

const get_roles_ID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ROLES_COLLECTION;

    const rolesId = req.params.id;

    if (!ObjectId.isValid(rolesId)) {
      return res.status(204).json({ error: 'Invalid rolesId' });
    }

    const rolesJson = await db.collection(CollectionName).find({ roleId: rolesId }).toArray();

    if (rolesJson.length > 0) {
      return res.status(200).json({
        token: '200',
        response: 'Successfully fetched role Json',
        rolesJson
      });
    } else {
      return res.status(204).json({ error: 'No role found for this template Id' });
    }
  } catch (err) {
    console.error('Error fetching rolesJson:', err);
    return res.status(500).json({
      error: 'Error fetching rolesJson',
      details: err.message
    });
  }
};

const update_roles = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ROLES_COLLECTION;

    const { roleId } = req.body;

    if (!roleId || roleId.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "roleId is required and cannot be empty",
      });
    }

    const existingJson = await db
      .collection(CollectionName)
      .findOne({ roleId });
    if (!existingJson) {
      return res.status(404).json({
        token: "404",
        response: "records not found with the provided roleId",
      });
    }

    const updatedJson = {
      roleName: req.body.roleName || existingJson.roleName,
      roleDescription: req.body.roleDescription || existingJson.roleDescription,
      orgId: req.body.orgId || existingJson.orgId,
      defaultAccessLevel: req.body.defaultAccessLevel || existingJson.defaultAccessLevel,
      roleLevel: req.body.roleLevel || existingJson.roleLevel,
      idtId: req.body.idtId || existingJson.idtId,
      roleLevelName: req.body.roleLevelName || existingJson.roleLevelName,
      roleLevelId: req.body.roleLevelId || existingJson.roleLevelId,
      roleStatus: req.body.roleStatus ?? existingJson.roleStatus,
      adGroup: req.body.adGroup || existingJson.adGroup
    };

    await db
      .collection(CollectionName)
      .updateOne({ roleId }, { $set: updatedJson });

    return res.json({
      token: "200",
      response: "Successfully updated",
      updatedJson,
    });
  } catch (err) {
    console.error("Error while updating:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to update",
      error: err.message,
    });
  }
};

// const update_roles_idt = async function (req, res, next) {
//   try {
//     const db = await connectToMongoDB();
//     const CollectionName = process.env.ROLES_COLLECTION;

//     const { roleId } = req.body;

//     if (!roleId || roleId.trim() === "") {
//       return res.status(400).json({
//         token: "400",
//         response: "roleId is required and cannot be empty",
//       });
//     }

//     const existingJson = await db
//       .collection(CollectionName)
//       .findOne({ roleId });
//     if (!existingJson) {
//       return res.status(404).json({
//         token: "404",
//         response: "records not found with the provided roleId",
//       });
//     }

//     const updatedJson = {
//       idtId: req.body.idtId || existingJson.idtId,
//     };

//     await db
//       .collection(CollectionName)
//       .updateOne({ roleId }, { $set: updatedJson });

//     return res.json({
//       token: "200",
//       response: "Successfully updated",
//       updatedJson,
//     });
//   } catch (err) {
//     console.error("Error while updating:", err);
//     return res.status(500).json({
//       token: "500",
//       response: "Failed to update",
//       error: err.message,
//     });
//   }
// };

const delete_role = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.ROLES_COLLECTION;

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({ token: "200", id, response: "role deleted successfully" });
    } else {
      return res.status(404).json({ token: "404", response: "role not found" });
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

export default { post_roles, get_roles, get_roles_ID, update_roles, delete_role,get_roles_by_app };