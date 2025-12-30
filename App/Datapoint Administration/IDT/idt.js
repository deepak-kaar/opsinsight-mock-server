import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const post_Idt = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.IDT_COLLECTION;
    const odt_collectionName = process.env.ODT_COLLECTION;

    const newObjectId = new ObjectId();
    const templateId = newObjectId.toHexString();
    const idtVersionId = new ObjectId().toHexString();

    const templateName = req.body.templateName;
    const appId = req.body.appId;

    if (
      !templateName ||
      templateName.trim() === "" ||
      !appId ||
      appId.trim() === ""
    ) {
      return res.status(400).json({
        token: "400",
        response: "templateName and appId is required and cannot be empty",
      });
    }

    const existingName = await db
      .collection(collectionName)
      .findOne({ templateName });

    if (existingName) {
      return res.status(400).json({
        token: "400",
        response: "Name with the provided templateName already exists",
      });
    }

    const templateObjjson = {
      handle: req.body.templateObj.handle,
      margin: req.body.templateObj.margin,
      float: req.body.templateObj.float,
      minRow: req.body.templateObj.minRow,
      subGridDynamic: req.body.templateObj.subGridDynamic,
      subGridOpts: req.body.templateObj.subGridOpts,
      animate: req.body.templateObj.animate,
      draggable: req.body.templateObj.draggable,
      cellHeight: req.body.templateObj.cellHeight,
      column: req.body.templateObj.column,
    };

    const idtSchema = {
      _id: newObjectId,
      templateId,
      templateName: req.body.templateName,
      templateType: req.body.templateType,
      templateWidth: req.body.templateWidth,
      templateHeight: req.body.templateHeight,
      templateObj: templateObjjson,
      saveType: req.body.saveType,
      activeIdtVersion: req.body.activeIdtVersion,
      activeOdtVersion: req.body.activeOdtVersion,
      visble: req.body.visble,
      sharable: req.body.sharable,
      confidentialType: req.body.confidentialType,
      allowCopyContent: req.body.allowCopyContent,
      allowEditContent: req.body.allowEditContent,
      isActive: req.body.isActive,
      appId: appId,
      orgId: req.body.orgId,
      roles: req.body.roles,
      modifiedBy: req.body.modifiedBy,
      createdOn: new Date(),
      idtVersionId: idtVersionId,
    };

    const result = await db.collection(collectionName).insertOne(idtSchema);

    const attributePromises = req.body.templateObj.children.map(
      async (attribute) => {
        const newAttributeObjectId = new ObjectId();

        const attributeDocument = {
          _id: newAttributeObjectId,
          OdtId: newAttributeObjectId.toHexString(),
          templateId,
          idtVersionId,
          idtId: templateId,
          ...attribute,
        };

        return db.collection(odt_collectionName).insertOne(attributeDocument);
      }
    );

    await Promise.all(attributePromises);

    return res.json({
      token: "200",
      response: "Successfully created in database",
      idtJson: idtSchema,
    });
  } catch (err) {
    console.error("Error creating idt json:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to create json",
      error: err.message,
    });
  }
};

const update_Idt = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.IDT_COLLECTION;
    const newObjectId = new ObjectId();

    const { templateId } = req.body;
    const newDocument = {
      ...req.body,
      templateId,
      idtVersionId: newObjectId.toHexString(),
      createdOn: new Date(),
    };

    if (!templateId) {
      return res.status(400).json({
        token: "400",
        response: "templateId is required",
      });
    }

    await db.collection(collectionName).insertOne(newDocument);

    return res.json({
      token: "200",
      response: "Successfully created new version in database",
      newDocument,
    });
  } catch (err) {
    console.error("Error creating new version of idt json:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to create new version",
      error: err.message,
    });
  }
};

const update_idt_roles = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.IDT_COLLECTION;

    const { templateId, roles } = req.body;

    if (!templateId || templateId.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "templateId is required and cannot be empty",
      });
    }

    const query = { templateId, activeIdtVersion: "Parent" };

    const existingJson = await db.collection(CollectionName).findOne(query);

    if (!existingJson) {
      return res.status(404).json({
        token: "404",
        response: "Record not found with the provided templateId and activeIdtVersion 'Parent'",
      });
    }

    const updatedJson = {
      roles: roles || existingJson.roles
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




const get_Idt_versions = async function (req, res, next) {
  try {
    const { templateId } = req.body; // or req.body / req.params depending on how it's passed
    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }

    const db = await connectToMongoDB();
    const collectionName = process.env.IDT_COLLECTION;

    const projection = {
      idtId: 1,
      templateId: 1,
      templateName: 1,
      templateType: 1,
      templateWidth: 1,
      templateHeight: 1,
      activeIdtVersion: 1,
      activeOdtVersion: 1,
      visble: 1,
      sharable: 1,
      confidentialType: 1,
      allowCopyContent: 1,
      allowEditContent: 1,
      isActive: 1,
      modifiedBy: 1,
      createdOn: 1, // make sure this field exists and is a Date
      _id: 0,
    };

    const result = await db
      .collection(collectionName)
      .find({ templateId }, { projection })
      .sort({ createdOn: -1 }) // descending: latest first
      .toArray();

    if (!result || result.length === 0) {
      return res
        .status(404)
        .json({ error: "No documents found for given templateId" });
    }

    const [latest, ...versions] = result;

    return res.json({
      token: "200",
      reportDetails: latest,
      pageVersions: versions,
    });
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};

const get_Idt_ID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.IDT_COLLECTION;

    const templateId = req.params.id;

    if (!ObjectId.isValid(templateId)) {
      return res.status(400).json({ error: "Invalid templateId" });
    }

    const idtJson = await db
      .collection(CollectionName)
      .find({ idtId: templateId })
      .toArray();

    if (idtJson.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched idtJson",
        idtJson,
      });
    } else {
      return res
        .status(404)
        .json({ error: "No idtJson found for this templateId" });
    }
  } catch (err) {
    console.error("Error fetching idtJson:", err);
    return res.status(500).json({
      error: "Error fetching idtJson",
      details: err.message,
    });
  }
};

const get_Idt_ID_lookUp = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const odtCollectionName = process.env.ODT_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;

    const templateId = req.params.id;

    if (!ObjectId.isValid(templateId)) {
      return res.status(400).json({ error: "Invalid templateId" });
    }

    const idtJson = await db
      .collection(odtCollectionName)
      .findOne({ templateId: templateId });

    const data = idtJson.value;
    const json1 = await db
      .collection(attributeCollectionName)
      .findOne({ value: data });

    if (json1) {
      return res.json({ token: "200", result: json1 });
    } else {
      return res.status(404).json({ error: "attribute not found" });
    }
  } catch (err) {
    console.error("Error fetching idtJson:", err);
    return res.status(500).json({
      error: "Error fetching idtJson",
      details: err.message,
    });
  }
};

// get_Idt_Odt_Mapping: async function (req, res, next) {
//     try {
//         const db = await connectToMongoDB();
//         const idtCollectionName = process.env.IDT_COLLECTION;
//         const odtCollectionName = process.env.ODT_COLLECTION;

//         const templateId = req.params.id;

//         if (!ObjectId.isValid(templateId)) {
//             return res.status(400).json({ error: 'Invalid templateId' });
//         }

//         // Fetch Data From IDT Collection
//         const idtJson = await db.collection(idtCollectionName).findOne({ idtId: templateId });
//         // Validate input IDT JSONs
//         if (!idtJson) {
//             return res.status(400).json({ error: 'IDT Template data is Empty' });
//         }
//         // Fetch Data From ODT Collection
//         const odtJson = await db.collection(odtCollectionName).find({ idtId: templateId }).toArray();

//         // Validate input ODT JSONs
//         if (!odtJson) {
//             return res.status(400).json({ error: 'ODT Template data is Empty' });
//         }
//         // Clone IDTjson to prevent mutations
//         const responseJSON = { ...idtJson };

//         // Add children to templateObj
//         if (!responseJSON.templateObj.children) {
//             responseJSON.templateObj.children = [];
//         }
//         // Add elements from odtJson to the children array
//         odtJson.forEach((odtItem) => {
//             responseJSON.templateObj.children.push({
//                 id: odtItem.id,
//                 OdtId: odtItem.odtId,
//                 w: odtItem.w,
//                 h: odtItem.h || 1, // Default height to 1 if not specified
//                 selector: odtItem.selector,
//                 input: odtItem.input,
//                 inputOdt: odtItem.inputOdt,
//                 x: odtItem.x,
//                 y: odtItem.y,
//             });
//         });
//         if (responseJSON) {
//             return res.json({ token: '200', responseJSON });
//         } else {
//             return res.status(404).json({ error: 'Data not found' });
//         }
//     } catch (err) {
//         console.error('Error fetching idtJson:', err);
//         return res.status(500).json({
//             error: 'Error fetching idtJson',
//             details: err.message
//         });
//     }
// },

const get_Idt_Odt_Mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const idtCollectionName = process.env.IDT_COLLECTION;
    const odtCollectionName = process.env.ODT_COLLECTION;

    const templateId = req.params.id;

    if (!ObjectId.isValid(templateId)) {
      return res.status(400).json({ error: "Invalid templateId" });
    }

    const idtJson = await db
      .collection(idtCollectionName)
      .findOne({ idtId: templateId });
    if (!idtJson) {
      return res.status(400).json({ error: "IDT Template data is Empty" });
    }

    const odtJson = await db
      .collection(odtCollectionName)
      .find({ idtId: templateId })
      .toArray();
    if (!odtJson) {
      return res.status(400).json({ error: "ODT Template data is Empty" });
    }

    // Clone IDTjson to prevent mutations
    const responseJSON = { ...idtJson };

    // Add children to templateObj
    if (!responseJSON.templateObj.children) {
      responseJSON.templateObj.children = [];
    }

    // finding whether it is static or attribute
    const findStyleType = (obj) => {
      if (typeof obj !== "object" || obj === null) return null;

      for (const key in obj) {
        if (
          key === "type" &&
          (obj[key] === "Static" || obj[key] === "Attribute")
        ) {
          return obj[key];
        }

        if (typeof obj[key] === "object") {
          const result = findStyleType(obj[key]);
          if (result) return result;
        }
      }
      return null;
    };

    // Add elements from odtJson to the children array
    odtJson.forEach((odtItem) => {
      const styleType = findStyleType(odtItem.inputOdt);

      const isStaticStyle = styleType === "Static";
      const isMatchingSelector = [
        "app-primeng-sbar",
        "app-primeng-shbar",
        "app-primeng-line",
      ].includes(odtItem.selector);

      if (isStaticStyle || isMatchingSelector) {
        let updatedInput = { ...odtItem.input };
        let updateOdtInput = { ...odtItem.inputOdt };

        // If input.label exists, replace it with content
        if (updatedInput.label) {
          updatedInput.label = updateOdtInput.label.content;
        } else if (updateOdtInput.content) {
          updatedInput.content = updateOdtInput.content.content;
        }

        responseJSON.templateObj.children.push({
          id: odtItem.id,
          OdtId: odtItem.odtId,
          w: odtItem.w,
          h: odtItem.h || 1,
          selector: odtItem.selector,
          input: updatedInput,
          inputOdt: odtItem.inputOdt,
          x: odtItem.x,
          y: odtItem.y,
        });
      } else if (styleType === "Attribute") {
        let newValue = odtItem.inputOdt?.value;
        if (!odtItem.input?.value || odtItem.input.value === "") {
          newValue = odtItem.inputOdt?.value?.name || "";
        }

        responseJSON.templateObj.children.push({
          id: odtItem.id,
          OdtId: odtItem.odtId,
          w: odtItem.w,
          h: odtItem.h || 1,
          selector: odtItem.selector,
          input: { ...odtItem.input, value: newValue },
          inputOdt: odtItem.inputOdt,
          x: odtItem.x,
          y: odtItem.y,
        });
      } else {
        responseJSON.templateObj.children.push({
          id: odtItem.id,
          OdtId: odtItem.odtId,
          w: odtItem.w,
          h: odtItem.h || 1,
          selector: odtItem.selector,
          input: odtItem.input,
          inputOdt: odtItem.inputOdt,
          x: odtItem.x,
          y: odtItem.y,
        });
      }
    });

    if (responseJSON) {
      return res.json({ token: "200", responseJSON });
    } else {
      return res.status(404).json({ error: "Data not found" });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: "Error fetching idtJson",
      details: err.message,
    });
  }
};

const get_idt_list = async function (req, res, next) {
  try {
    let filters = {};
    const db = await connectToMongoDB();
    const idtCollectionName = process.env.IDT_COLLECTION;
    const appId = req.body.appId;
    const templateType = req.body.templateType;
    const orgId = req.body.orgId;
    // if (appId) {
    //   filters = {
    //     appId: appId,
    //     templateType: templateType,
    //   };
    // } else {
    //   filters = {
    //     templateType: templateType,
    //   };
    // }

    filters = {
      ...(appId && { appId }),
      ...(orgId && { orgId }),
      ...(templateType && { templateType })
    };
    const idtList = await db
      .collection(idtCollectionName)
      .find(filters)
      .toArray();
    return res.json({ token: "200", idtList: idtList });
  } catch (err) {
    console.error("Error fetching Idt List:", err);
    return res.status(500).json({
      error: "Error fetching Idt List",
      details: err.message,
    });
  }
};

const delete_idt = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.IDT_COLLECTION;

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({ token: "200", id, response: "idt deleted successfully" });
    } else {
      return res.status(404).json({ token: "404", response: "idt not found" });
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

/**
 * @description Get template with odt data  by templateId
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next function
 * @returns {Object} - The response object
 */
const get_template = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.TEMPLATE_COLLECTION;
    const templateId = req.params.id;
    if (!ObjectId.isValid(templateId)) {
      return res.status(400).json({ error: "Invalid templateId" });
    }
    const template = await db.collection(collectionName).findOne({ templateId: templateId });
    if (!template) return res.status(404).json({ error: "Template not found" });
    return res.json({ token: "200", template: template });
  } catch (err) {
    console.error("Error fetching template:", err);
    return res.status(500).json({ error: "Error fetching template", details: err.message });
  }
};


const getTemplates = async function (req, res, next) {
  try {
    const appId = req.body.appId;
    const templateType = req.body.templateType;
    const orgId = req.body.orgId;
    let filters = {};
    filters = {
      ...(appId && { appId }),
      ...(orgId && { orgId }),
      ...(templateType && { templateType })
    };
    const db = await connectToMongoDB();
    const collectionName = process.env.TEMPLATE_COLLECTION;
    const templates = await db.collection(collectionName).find(filters).toArray();
    return res.json({ token: "200", templates: templates });
  } catch (err) {
    console.error("Error fetching templates:", err);
    return res.status(500).json({ error: "Error fetching templates", details: err.message });
  }
};

const post_template = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const idtCollectionName = process.env.TEMPLATE_COLLECTION;
    const newObjectId = new ObjectId();
    const templateId = newObjectId.toHexString();
    const templateSchema = {
      _id: newObjectId,
      templateId: templateId,
      saveType: req.body.saveType,
      appId: req.body.appId,
      orgId: req.body.orgId,
      dataObject: req.body.dataObject,
      displayComponent: req.body.displayComponent,
      designObject: req.body.designObject,
      inputSchema: req.body.inputSchema,
      widgetInputs: req.body.widgetInputs,
      dataMapping: req.body.dataMapping,
      templateObj: req.body.templateObj,
      templateName: req.body.templateName,
      templateDescription: req.body.templateDescription,
      templateWidth: req.body.templateWidth,
      templateHeight: req.body.templateHeight,
      templateType: req.body.templateType,
      activeIdtVersion: "Parent",
      activeOdtVersion: "Parent",
      visble: false,
      sharable: false,
      confidentialType: false,
      allowCopyContent: false,
      allowEditContent: false,
      isActive: false,
    };
    const result = await db.collection(idtCollectionName).insertOne(templateSchema);
    return res.json({ token: "200", response: "Template created successfully", template: result });
  } catch (err) {
    console.error("Error posting template:", err);
    return res.status(500).json({ error: "Error posting template", details: err.message });
  }
}

const update_template = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.TEMPLATE_COLLECTION;
    const templateId = req.params.id;
    const updateData = req.body;
    const result = await db.collection(collectionName).updateOne({ templateId: templateId }, { $set: updateData });
    return res.json({ token: "200", response: "Template updated successfully", template: result });
  } catch (err) {
    console.error("Error updating template:", err);
    return res.status(500).json({ error: "Error updating template", details: err.message });
  }
}

const delete_template = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.TEMPLATE_COLLECTION;
    const templateId = req.params.id;
    const result = await db.collection(collectionName).deleteOne({ templateId: templateId });
    return res.json({ token: "200", response: "Template deleted successfully", template: result });
  } catch (err) {
    console.error("Error deleting template:", err);
    return res.status(500).json({ error: "Error deleting template", details: err.message });
  }
}

/**
 * @description Create template mapping
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next function
 * @returns {Object} - The response object
 */
const create_template_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.TEMPLATE_MAPPING_COLLECTION;
    const newObjectId = new ObjectId();
    const templateMappingSchema = {
      _id: newObjectId,
      templateId: req.body.templateId,
      templateName: req.body.templateName,
      appId: req.body.appId,
      orgId: req.body.orgId,
      mappingId: newObjectId.toHexString(),
      mappingType: req.body.mappingType,
      name: req.body.name,
      description: req.body.description,
      inputSchema: req.body.inputSchema,
      mappingDescription: req.body.mappingDescription,
      mappingCreatedOn: new Date(),
      mappingUpdatedOn: new Date(),
    };
    const result = await db.collection(collectionName).insertOne(templateMappingSchema);
    return res.json({ token: "200", response: "Template mapping created successfully", templateMapping: result });
  } catch (err) {
    console.error("Error creating template mapping:", err);
    return res.status(500).json({ error: "Error creating template mapping", details: err.message });
  }
};

/**
 * @description Helper function to get frequency data from attribute value collection
 * @param {string} attributeId - The attribute ID
 * @param {string} frequency - The frequency (Hour, Day, Week, Month, Quarter, Semi-Annual, Year)
 * @param {Date} date - The date to query
 * @returns {Promise<any>} - The attribute value or null
 */
async function getFrequencyData(attributeId, frequency, date) {
  const attributevalueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;
  const db = await connectToMongoDB();
  const inputDate = new Date(date);
  const year = inputDate.getFullYear();
  const month = inputDate.getMonth();
  const day = inputDate.getDate();
  const hour = inputDate.getHours();

  const getDateRange = (frequency, inputDate) => {
    // Use UTC methods to ensure dates match MongoDB UTC storage
    const utcYear = inputDate.getUTCFullYear();
    const utcMonth = inputDate.getUTCMonth();
    const utcDay = inputDate.getUTCDate();
    const utcHour = inputDate.getUTCHours();

    switch (frequency) {
      case "Hour":
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHour, 0, 0)),
            $lt: new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHour + 1, 0, 0)),
          },
        };
      case "Day":
      case "D":
        const startOfDay = new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(utcYear, utcMonth, utcDay + 1, 0, 0, 0));
        return {
          date: {
            $gte: startOfDay,
            $lt: endOfDay,
          },
        };
      case "Week":
        const startOfWeek = new Date(inputDate);
        startOfWeek.setUTCDate(utcDay - inputDate.getUTCDay());
        startOfWeek.setUTCHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 7);
        return { date: { $gte: startOfWeek, $lt: endOfWeek } };
      case "Month":
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, utcMonth, 1, 0, 0, 0)),
            $lt: new Date(Date.UTC(utcYear, utcMonth + 1, 1, 0, 0, 0)),
          },
        };
      case "Quarter":
        const quarterStartMonth = Math.floor(utcMonth / 3) * 3;
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, quarterStartMonth, 1, 0, 0, 0)),
            $lt: new Date(Date.UTC(utcYear, quarterStartMonth + 3, 1, 0, 0, 0)),
          },
        };
      case "Semi-Annual":
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, utcMonth < 6 ? 0 : 6, 1, 0, 0, 0)),
            $lt: new Date(Date.UTC(utcYear, utcMonth < 6 ? 6 : 12, 1, 0, 0, 0)),
          },
        };
      case "Year":
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, 0, 1, 0, 0, 0)),
            $lt: new Date(Date.UTC(utcYear + 1, 0, 1, 0, 0, 0)),
          },
        };
      default:
        return { date: inputDate };
    }
  };

  const query = { attributeId, frequency, ...getDateRange(frequency, inputDate) };
  const existingEntry = await db.collection(attributevalueCollection).findOne(query);

  if (existingEntry && existingEntry?.value !== undefined) {
    return existingEntry.value;
  } else {
    return null;
  }
}

/**
 * @description Helper function to find a field in nested dataObject structure
 * @param {Object} obj - The object to search
 * @param {string} fieldName - The field name to find
 * @param {string[]} path - Current path (for recursion)
 * @returns {Object|null} - Object with {current, key, path} or null if not found
 */
function findFieldInDataObject(obj, fieldName, path = []) {
  if (typeof obj !== "object" || obj === null) {
    return null;
  }

  // Check if current level has the field
  if (obj.hasOwnProperty(fieldName)) {
    return { current: obj, key: fieldName, path: [...path, fieldName] };
  }

  // Recursively search in nested objects
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const result = findFieldInDataObject(value, fieldName, [...path, key]);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

/**
 * @description Helper function to recursively map data based on inputSchema
 * @param {Object} dataObject - The data object to map
 * @param {Object} inputSchema - The input schema with mappings
 * @param {Object} db - The database connection
 * @param {Date} date - The date for frequency-based queries
 * @returns {Promise<Object>} - The mapped data object
 */
async function mapDataFromSchema(dataObject, inputSchema, db, date) {
  const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
  const mappedData = JSON.parse(JSON.stringify(dataObject)); // Deep clone

  // Process each field in inputSchema
  for (const [fieldKey, fieldSchema] of Object.entries(inputSchema)) {
    // Parse field key (e.g., "name.input-text" -> ["name", "input-text"])
    const [fieldName, fieldType] = fieldKey.split(".");

    // Find the field location once per field (use first property's dataPath if available)
    let fieldLocation = null;
    const firstProperty = Object.values(fieldSchema)[0];
    const firstMapping = firstProperty?.mapping;

    if (firstMapping?.dataPath && firstMapping.dataPath.trim() !== "") {
      // Use dataPath to navigate to the exact location
      const pathParts = firstMapping.dataPath.split(".");
      let current = mappedData;
      let validPath = true;
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (!current[pathParts[i]]) {
          validPath = false;
          break;
        }
        current = current[pathParts[i]];
      }
      if (validPath) {
        const finalKey = pathParts[pathParts.length - 1];
        fieldLocation = { current, key: finalKey };
      }
    } else {
      // Find the field in the dataObject structure by name
      fieldLocation = findFieldInDataObject(mappedData, fieldName);
    }

    if (!fieldLocation) {
      console.warn(`Field "${fieldName}" not found in dataObject`);
      continue;
    }

    const { current, key } = fieldLocation;

    // Process each property in the field schema (e.g., "value", "src", "labels", etc.)
    for (const [propertyKey, propertySchema] of Object.entries(fieldSchema)) {
      const mapping = propertySchema?.mapping;

      if (!mapping) continue;

      let attributeValue = null;

      // If rawValue exists, use it
      if (mapping.rawValue !== null && mapping.rawValue !== undefined) {
        attributeValue = mapping.rawValue;
      }
      // If attributeId exists, fetch from attributes
      else if (mapping.attributeId && mapping.type === "attribute") {
        // If frequency is not empty, fetch from attribute value collection
        if (mapping.frequency && mapping.frequency.trim() !== "") {
          attributeValue = await getFrequencyData(
            mapping.attributeId,
            mapping.frequency,
            date || new Date()
          );
        } else {
          // Fetch from attributes collection
          const attribute = await db
            .collection(attributeCollectionName)
            .findOne({ attributeId: mapping.attributeId });
          if (attribute && attribute.value !== undefined) {
            attributeValue = attribute.value;
          }
        }
      }

      // Update the mapped data
      if (attributeValue !== null) {
        // If the current field is an object and the property exists, update it
        if (current[key] && typeof current[key] === "object" && !Array.isArray(current[key])) {
          current[key][propertyKey] = attributeValue;
        }
        // If propertyKey is "value" and current[key] is a primitive, replace it directly
        else if (propertyKey === "value" && (typeof current[key] !== "object" || current[key] === null)) {
          current[key] = attributeValue;
        }
        // Otherwise, create/update the property
        else {
          if (!current[key] || typeof current[key] !== "object") {
            current[key] = {};
          }
          current[key][propertyKey] = attributeValue;
        }
      }
    }
  }

  return mappedData;
}

/**
 * @description Helper to recursively find widgets matching a field name
 * @param {Object} widget - A single widget to check
 * @param {string} fieldName - The logical field name (e.g. "image", "name")
 * @returns {Array} - Matching widgets (including nested ones)
 */
function findMatchingWidgetsRecursive(widget, fieldName) {
  const matches = [];

  if (!widget || typeof widget !== "object") {
    return matches;
  }

  const id = widget.id || "";
  const label = widget.label || "";
  const fieldNameLower = fieldName.toLowerCase();
  const idLower = typeof id === "string" ? id.toLowerCase() : "";
  const labelLower = typeof label === "string" ? label.toLowerCase() : "";
  const isMatch = (
    (idLower === fieldNameLower) ||
    (labelLower === fieldNameLower) ||
    (idLower.endsWith(`-${fieldNameLower}`)) ||
    (labelLower.includes(`(${fieldNameLower})`))
  );

  if (isMatch) {
    matches.push(widget);
  }

  // Recursively search in children array
  if (Array.isArray(widget.children)) {
    for (const child of widget.children) {
      matches.push(...findMatchingWidgetsRecursive(child, fieldName));
    }
  }

  return matches;
}

/**
 * @description Helper to find widgets in designObject for a given field name
 *              Searches recursively through nested children arrays
 * @param {Object} designObject - The designObject from template
 * @param {string} fieldName - The logical field name (e.g. "image", "name")
 * @returns {Array} - Matching widgets (including nested ones)
 */
function findWidgetsForField(designObject, fieldName) {
  const widgets = designObject?.widgets || [];
  const matches = [];

  for (const widget of widgets) {
    matches.push(...findMatchingWidgetsRecursive(widget, fieldName));
  }

  return matches;
}

/**
 * @description Map values from inputSchema into designObject.widgets[*].input
 *              (does NOT touch dataObject)
 * @param {Object} designObject - The original designObject
 * @param {Object} inputSchema - The input schema with mappings
 * @param {Object} db - The database connection
 * @param {Date} date - The date for frequency-based queries
 * @returns {Promise<Object>} - New designObject with inputs updated
 */
async function mapDesignFromSchema(designObject, inputSchema, db, date) {
  const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
  const mappedDesign = JSON.parse(JSON.stringify(designObject || {}));

  if (!inputSchema || typeof inputSchema !== "object") {
    return mappedDesign;
  }

  for (const [fieldKey, fieldSchema] of Object.entries(inputSchema)) {
    // "image.image" -> fieldName = "image"
    const [fieldName] = fieldKey.split(".");
    if (!fieldName) continue;

    const widgets = findWidgetsForField(mappedDesign, fieldName);
    if (!widgets.length) {
      // No matching widget; skip this field
      continue;
    }

    for (const [propertyKey, propertySchema] of Object.entries(fieldSchema)) {
      const mapping = propertySchema?.mapping;
      if (!mapping) continue;

      let attributeValue = null;

      // Prefer rawValue if present
      if (mapping.rawValue !== null && mapping.rawValue !== undefined) {
        attributeValue = mapping.rawValue;
      } else if (mapping.attributeId && mapping.type === "attribute") {
        // Attribute-based mapping
        if (mapping.frequency && String(mapping.frequency).trim() !== "") {
          // Fetch from attribute value collection based on frequency
          attributeValue = await getFrequencyData(
            mapping.attributeId,
            mapping.frequency,
            date || new Date()
          );
        } else {
          // Fetch latest value from Attributes collection
          const attribute = await db
            .collection(attributeCollectionName)
            .findOne({ attributeId: mapping.attributeId });
          if (attribute && attribute.value !== undefined) {
            attributeValue = attribute.value;
          }
        }
      }

      if (attributeValue === null || attributeValue === undefined) {
        for (const widget of widgets) {
          if (!widget.input || typeof widget.input !== "object") {
            widget.input = {};
          }
          if (mapping.attributeId) {
            widget.attributeId = mapping.attributeId;
          }
          if (mapping.frequency !== null && mapping.frequency !== undefined) {
            widget.frequency = mapping.frequency;
          } else {
            widget.frequency = "";
          }
        }
        continue;
      }

      // Apply value to all matching widgets' input
      for (const widget of widgets) {
        if (!widget.input || typeof widget.input !== "object") {
          widget.input = {};
        }

        // For input-text, "value" should overwrite the primitive value
        // For charts/images, propertyKey (labels/values/src/title/...) maps directly
        widget.input[propertyKey] = attributeValue;

        // Add attributeId and frequency to widget level (not in input)
        if (mapping.attributeId) {
          widget.attributeId = mapping.attributeId;
        }
        if (mapping.frequency !== null && mapping.frequency !== undefined) {
          widget.frequency = mapping.frequency;
        } else {
          widget.frequency = "";
        }
      }
    }
  }

  return mappedDesign;
}

/**
 * @description Get template mapping by id with mapped data
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next function
 * @returns {Object} - The response object
 */
const get_template_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const templateMappingCollectionName = process.env.TEMPLATE_MAPPING_COLLECTION;
    const templateCollectionName = process.env.TEMPLATE_COLLECTION;
    const templateMappingId  = req.body.mappingId;

    // Get date from request body object, query parameter, or use current date (body takes precedence)
    const dateParam = (req.body && req.body.date) ? req.body.date : req.query.date;
    const date = dateParam ? new Date(dateParam) : new Date();

    // Fetch template mapping
    const templateMapping = await db
      .collection(templateMappingCollectionName)
      .findOne({ mappingId: templateMappingId });

    if (!templateMapping) {
      return res.status(404).json({
        token: "404",
        response: "Template mapping not found",
      });
    }

    // Fetch template data using templateId
    const template = await db
      .collection(templateCollectionName)
      .findOne({ templateId: templateMapping.templateId });

    if (!template) {
      return res.status(404).json({
        token: "404",
        response: "Template not found",
      });
    }

    // Map values into designObject.widgets[*].input based on inputSchema
    let mappedDesignObject = template.designObject;
    if (templateMapping.inputSchema && Object.keys(templateMapping.inputSchema).length > 0) {
      mappedDesignObject = await mapDesignFromSchema(
        template.designObject,
        templateMapping.inputSchema,
        db,
        date
      );
    }

    // Build response with template data and mapped designObject
    const response = {
      ...template,
      designObject: mappedDesignObject,
    };

    return res.json({
      token: "200",
      response: "Template mapping fetched successfully",
      ...response,
    });
  } catch (err) {
    console.error("Error fetching template mapping:", err);
    return res.status(500).json({
      error: "Error fetching template mapping",
      details: err.message,
    });
  }
}

/**
 * @description Get all template mappings
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next function
 * @returns {Object} - The response object
 */
const get_template_mappings = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const templateMappingCollectionName = process.env.TEMPLATE_MAPPING_COLLECTION;
    const templateCollectionName = process.env.TEMPLATE_COLLECTION;

    const { templateId, appId, orgId, templateType } = req.body || {};

    // Build the aggregation pipeline
    const pipeline = [];

    // Stage 1: Match template mappings by appId, orgId, templateId (if provided)
    const matchStage = {};
    if (appId) {
      matchStage.appId = appId;
    }
    if (orgId) {
      matchStage.orgId = orgId;
    }
    if (templateId) {
      matchStage.templateId = templateId;
    }

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Stage 2: Lookup template collection to join template data
    pipeline.push({
      $lookup: {
        from: templateCollectionName,
        localField: "templateId",
        foreignField: "templateId",
        as: "template"
      }
    });

    // Stage 3: Unwind the template array (should be single element)
    pipeline.push({
      $unwind: {
        path: "$template",
        preserveNullAndEmptyArrays: false // Only keep mappings that have a matching template
      }
    });

    // Stage 4: Match by templateType and/or template's appId/orgId if provided
    const templateMatch = {};
    if (templateType) {
      templateMatch["template.templateType"] = templateType;
    }
    // Filter by template's appId/orgId (these might differ from mapping's appId/orgId)
    if (appId && !templateId) {
      // Only filter by template's appId if templateId is not provided
      // (if templateId is provided, we already filtered mappings by appId in stage 1)
      templateMatch["template.appId"] = appId;
    }
    if (orgId && !templateId) {
      // Only filter by template's orgId if templateId is not provided
      templateMatch["template.orgId"] = orgId;
    }

    if (Object.keys(templateMatch).length > 0) {
      pipeline.push({ $match: templateMatch });
    }

    // Stage 5: Add templateType field from joined template
    pipeline.push({
      $addFields: {
        templateType: "$template.templateType"
      }
    });

    // Stage 6: Remove the template object, keep all other fields including templateType
    pipeline.push({
      $unset: "template"
    });

    const result = await db.collection(templateMappingCollectionName).aggregate(pipeline).toArray();
    return res.json({ token: "200", response: "Template mappings fetched successfully", templateMappings: result });
  } catch (err) {
    console.error("Error fetching template mappings:", err);
    return res.status(500).json({ error: "Error fetching template mappings", details: err.message });
  }
}

/**
 * @description Update template mapping
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next function
 * @returns {Object} - The response object
 */
const update_template_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.TEMPLATE_MAPPING_COLLECTION;
    const templateMappingId = req.params.id;
    const updateData = req.body;
    const result = await db.collection(collectionName).updateOne({ mappingId: templateMappingId }, { $set: updateData });
    return res.json({ token: "200", response: "Template mapping updated successfully", templateMapping: result });
  } catch (err) {
    console.error("Error updating template mapping:", err);
    return res.status(500).json({ error: "Error updating template mapping", details: err.message });
  }
}

/**
 * @description Delete template mapping
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next function
 * @returns {Object} - The response object
 */
const delete_template_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.TEMPLATE_MAPPING_COLLECTION;
    const templateMappingId = req.params.id;
    const result = await db.collection(collectionName).deleteOne({ mappingId: templateMappingId });
    return res.json({ token: "200", response: "Template mapping deleted successfully", templateMapping: result });
  } catch (err) {
    console.error("Error deleting template mapping:", err);
    return res.status(500).json({ error: "Error deleting template mapping", details: err.message });
  }
}

/**
 * @description Helper function to save/update attribute value based on frequency
 * @param {string} attributeId - The attribute ID
 * @param {string} frequency - The frequency (Hour, Day, Week, Month, Quarter, Semi-Annual, Year) or empty string
 * @param {Date} date - The date to use
 * @param {any} value - The value to save
 * @param {Object} db - The database connection
 * @returns {Promise<void>}
 */
async function saveAttributeValue(attributeId, frequency, date, value, db) {
  const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
  const attributevalueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;

  const inputDate = new Date(date);
  const year = inputDate.getFullYear();
  const month = inputDate.getMonth();
  const day = inputDate.getDate();
  const hour = inputDate.getHours();

  // If frequency is empty or null, update/create in Attributes collection
  if (!frequency || frequency.trim() === "") {
    const result = await db
      .collection(attributeCollectionName)
      .findOneAndUpdate(
        {
          attributeId: attributeId,
          dataSource: { $ne: "Sensor" },
        },
        { $set: { value } },
        { upsert: true, returnDocument: "after" }
      );
    return;
  }

  // If frequency is provided, use Attribute Value collection
  const getDateRange = (frequency, inputDate) => {
    // Use UTC methods to ensure dates match MongoDB UTC storage
    const utcYear = inputDate.getUTCFullYear();
    const utcMonth = inputDate.getUTCMonth();
    const utcDay = inputDate.getUTCDate();
    const utcHour = inputDate.getUTCHours();

    switch (frequency) {
      case "Hour":
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHour, 0, 0)),
            $lt: new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHour + 1, 0, 0)),
          },
        };
      case "Day":
      case "D":
        const startOfDay = new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(utcYear, utcMonth, utcDay + 1, 0, 0, 0));
        return {
          date: {
            $gte: startOfDay,
            $lt: endOfDay,
          },
        };
      case "Week":
        const startOfWeek = new Date(inputDate);
        startOfWeek.setUTCDate(utcDay - inputDate.getUTCDay());
        startOfWeek.setUTCHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 7);
        return { date: { $gte: startOfWeek, $lt: endOfWeek } };
      case "Month":
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, utcMonth, 1, 0, 0, 0)),
            $lt: new Date(Date.UTC(utcYear, utcMonth + 1, 1, 0, 0, 0)),
          },
        };
      case "Quarter":
        const quarterStartMonth = Math.floor(utcMonth / 3) * 3;
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, quarterStartMonth, 1, 0, 0, 0)),
            $lt: new Date(Date.UTC(utcYear, quarterStartMonth + 3, 1, 0, 0, 0)),
          },
        };
      case "Semi-Annual":
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, utcMonth < 6 ? 0 : 6, 1, 0, 0, 0)),
            $lt: new Date(Date.UTC(utcYear, utcMonth < 6 ? 6 : 12, 1, 0, 0, 0)),
          },
        };
      case "Year":
        return {
          date: {
            $gte: new Date(Date.UTC(utcYear, 0, 1, 0, 0, 0)),
            $lt: new Date(Date.UTC(utcYear + 1, 0, 1, 0, 0, 0)),
          },
        };
      default:
        return { date: inputDate };
    }
  };

  const query = {
    attributeId,
    frequency,
    ...getDateRange(frequency, inputDate),
  };

  const existingEntry = await db
    .collection(attributevalueCollection)
    .findOne(query);

  if (existingEntry) {
    // Update existing entry
    await db
      .collection(attributevalueCollection)
      .updateOne({ _id: existingEntry._id }, { $set: { value, date: inputDate } });
  } else {
    // Create new entry
    await db.collection(attributevalueCollection).insertOne({
      attributeId,
      value,
      frequency,
      date: inputDate,
      createdOn: new Date(),
    });
  }
}

/**
 * @description Save/update attribute values for template mapping widgets
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next function
 * @returns {Object} - The response object
 */
const save_template_mapping_values = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const templateMappingCollectionName = process.env.TEMPLATE_MAPPING_COLLECTION;
    
    const { id: mappingId, attributeValues, date } = req.body;

    if (!mappingId) {
      return res.status(400).json({
        token: "400",
        response: "mappingId is required",
      });
    }

    if (!attributeValues || typeof attributeValues !== "object" || Object.keys(attributeValues).length === 0) {
      return res.status(400).json({
        token: "400",
        response: "attributeValues is required and cannot be empty",
      });
    }

    // Verify mapping exists
    const templateMapping = await db
      .collection(templateMappingCollectionName)
      .findOne({ mappingId: mappingId });

    if (!templateMapping) {
      return res.status(404).json({
        token: "404",
        response: "Template mapping not found",
      });
    }

    // Use provided date or current date
    const inputDate = date ? new Date(date) : new Date();

    // Process each widget's attribute value
    const updatePromises = Object.entries(attributeValues).map(async ([widgetId, widgetData]) => {
      const { value, attributeId, frequency, date: widgetDate } = widgetData;

      if (!attributeId) {
        throw new Error(`Missing attributeId for widget ${widgetId}`);
      }

      // Use widget-specific date if provided, otherwise use the main date
      const valueDate = widgetDate ? new Date(widgetDate) : inputDate;
      const valueFrequency = frequency || "";

      await saveAttributeValue(attributeId, valueFrequency, valueDate, value, db);
    });

    await Promise.all(updatePromises);

    return res.json({
      token: "200",
      response: "Template mapping values saved successfully",
    });
  } catch (err) {
    console.error("Error saving template mapping values:", err);
    return res.status(500).json({
      error: "Error saving template mapping values",
      details: err.message,
    });
  }
}

export default {
  post_Idt,
  get_Idt_ID,
  get_Idt_versions,
  get_Idt_ID_lookUp,
  get_Idt_Odt_Mapping,
  get_idt_list,
  update_Idt,
  update_idt_roles,
  delete_idt,
  get_template,
  post_template,
  getTemplates,
  create_template_mapping,
  get_template_mapping,
  get_template_mappings,
  update_template_mapping,
  delete_template_mapping,
  save_template_mapping_values,
  update_template,
  delete_template
};
