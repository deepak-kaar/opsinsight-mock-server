import { connectToMongoDB } from '../../../config/connection.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const post_organization = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const organizationCollectionName = process.env.ORGANIZATION_COLLECTION;

    const { orgName, orgCode, appId, appName, orgDescription, orgContact, roleId, roleName, allowPast, allowFuture, archieveDate, lastArchieveDate, createdBy, orgOwner } = req.body;

    if (!orgName || !orgCode || !appId) {
      return res.status(400).json({
        token: '400',
        response: 'Org details is required and cannot be empty'
      });
    }


    const newObjectId = new ObjectId();

    const orgSchema = {
      _id: newObjectId,
      orgId: newObjectId.toHexString(),
      orgName: orgName,
      orgCode: orgCode,
      orgDescription: orgDescription,
      orgContact: orgContact,
      orgOwner: orgOwner,
      appId: appId,
      appName: appName,
      roleId: roleId,
      roleName: roleName,
      allowPast: allowPast,
      allowFuture: allowFuture,
      archieveDate: archieveDate,
      lastArchieveDate: lastArchieveDate,
      dataAccess: [],
      createdBy: createdBy,
      createdOn: new Date()
    };

    const result = await db.collection(organizationCollectionName).insertOne(orgSchema);
    return res.json({ token: '200', response: 'Successfully created in database', Organization: orgSchema });
  } catch (err) {
    console.error('Error creating instance:', err);
    return res.status(500).json({ token: '500', response: 'Failed to create Organization records', error: err.message });
  }
};

const get_organization = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const organizationCollectionName = process.env.ORGANIZATION_COLLECTION;

    // const projection = { DataType: 1, _id: 0 };
    const result = await db.collection(organizationCollectionName).find({}).toArray();
    if (result) {
      return res.json({ token: '200', Organization: result });
    } else {
      return res.status(404).json({ token: "404", error: 'Organization not found' });
    }
  } catch (err) {
    console.error('Error fetching data from MongoDB:', err);
    return res.status(500).json({ error: 'Error fetching data from MongoDB', details: err.message });
  }
};

const get_org_ID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ORGANIZATION_COLLECTION;

    const orgId = req.params.id;

    if (!ObjectId.isValid(orgId)) {
      return res.status(204).json({ error: 'Invalid orgId' });
    }

    const orgJson = await db.collection(CollectionName).find({ orgId: orgId }).toArray();

    if (orgJson.length > 0) {
      return res.status(200).json({
        token: '200',
        response: 'Successfully fetched Org Json',
        orgJson
      });
    } else {
      return res.status(204).json({ error: 'No Org found for this template Id' });
    }
  } catch (err) {
    console.error('Error fetching orgJson:', err);
    return res.status(500).json({
      error: 'Error fetching orgJson',
      details: err.message
    });
  }
};

const update_org = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ORGANIZATION_COLLECTION;

    const { orgId } = req.body;

    if (!orgId || orgId.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "orgId is required and cannot be empty",
      });
    }

    const existingJson = await db
      .collection(CollectionName)
      .findOne({ orgId });
    if (!existingJson) {
      return res.status(404).json({
        token: "404",
        response: "records not found with the provided orgId",
      });
    }

    const updatedJson = {
      orgName: req.body.orgName || existingJson.orgName,
      orgCode: req.body.orgCode || existingJson.orgCode,
      orgDescription: req.body.orgDescription || existingJson.orgDescription,
      orgContact: req.body.orgContact || existingJson.orgContact,
      appId: req.body.appId || existingJson.appId,
      appName: req.body.appName || existingJson.appName,
      roleId: req.body.roleId || existingJson.roleId,
      orgOwner: req.body.orgOwner || existingJson.orgOwner,
      roleName: req.body.roleName || existingJson.roleName,
      allowPast: req.body.allowPast || existingJson.allowPast,
      allowFuture: req.body.allowFuture || existingJson.allowFuture,
      archieveDate: req.body.archieveDate || existingJson.archieveDate,
      lastArchieveDate: req.body.lastArchieveDate || existingJson.lastArchieveDate,
    };

    await db
      .collection(CollectionName)
      .updateOne({ orgId }, { $set: updatedJson });

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

const get_count = async function (req, res, next) {
  const db = await connectToMongoDB();
  const Orgcollection = process.env.ORGANIZATION_COLLECTION;
  const Appcollection = process.env.APPS_COLLECTION;
  const Groupcollection = process.env.GROUPS_COLLECTION;
  const Rolecollection = process.env.ROLES_COLLECTION;
  const Shiftcollection = process.env.SHIFT_COLLECTION;
  const Usercollection = process.env.USERS_COLLECTION;


  const orgCount = await db.collection(Orgcollection).countDocuments();
  const appCount = await db.collection(Appcollection).countDocuments();
  const groupCount = await db.collection(Groupcollection).countDocuments();
  const roleCount = await db.collection(Rolecollection).countDocuments();
  const shiftCount = await db.collection(Shiftcollection).countDocuments();
  const userCount = await db.collection(Usercollection).countDocuments();


  return res.status(200).json([
    { label: "Organization", "count": orgCount },
    { label: "Apps", "count": appCount },
    { label: "Groups", "count": groupCount },
    { label: "Roles", "count": roleCount },
    { label: "Shifts", "count": shiftCount },
    { label: "Users", "count": userCount },

  ]);
};


const get_orgs_by_appId = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.ORGANIZATION_COLLECTION;

    const appId = req.params.id;

    if (!ObjectId.isValid(appId)) {
      return res.status(400).json({ error: 'Invalid appId' });
    }

    const orgs = await db
      .collection(collectionName)
      .find({ appId: appId }, { projection: { _id: 0 } })
      .toArray();

    if (orgs.length > 0) {
      return res.status(200).json({
        token: '200',
        response: 'Successfully fetched Org details',
        orgs
      });
    } else {
      return res.status(404).json({ token: "404", error: 'No organizations found for this appId' });
    }
  } catch (err) {
    console.error('Error fetching org details:', err);
    return res.status(500).json({
      error: 'Error fetching org details',
      details: err.message
    });
  }
};


const delete_org = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.ORGANIZATION_COLLECTION;

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({ token: "200", id, response: "Org deleted successfully" });
    } else {
      return res.status(404).json({ token: "404", response: "Org not found" });
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

const update_org_roles = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ORGANIZATION_COLLECTION;

    const { orgId, roleId, dataAccess } = req.body;

    if (!orgId || orgId.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "orgId is required and cannot be empty",
      });
    }

    const query = { orgId };

    const existingJson = await db.collection(CollectionName).findOne(query);

    if (!existingJson) {
      return res.status(404).json({
        token: "404",
        response: "Record not found with the provided orgId",
      });
    }

    const updatedJson = {
      roleId: roleId || existingJson.roleId,
      dataAccess: dataAccess || existingJson.dataAccess
    };

    await db.collection(CollectionName).updateOne(query, { $set: updatedJson });

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




export default { post_organization, get_organization, get_org_ID, get_count, update_org, get_orgs_by_appId, delete_org, update_org_roles };