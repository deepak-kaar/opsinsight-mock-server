import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId, Long } from "mongodb";
import dotenv from 'dotenv';

dotenv.config();

const odt_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const odtCollectionName = process.env.ODT_COLLECTION;

    const { odtId, inputObjType, value } = req.body;

    if (!odtId || !inputObjType || !value) {
      return res.status(400).json({
        token: "400",
        response:
          "Invalid or missing required fields: odtId, inputObjType, value",
      });
    }

    // Find the document by `odtId`
    const existingOdt = await db
      .collection(odtCollectionName)
      .findOne({ odtId });

    if (!existingOdt) {
      return res.status(404).json({
        token: "404",
        response: `No record found for odtId: ${odtId}`,
      });
    }

    if (existingOdt.inputOdt.hasOwnProperty(inputObjType)) {
      existingOdt.inputOdt[inputObjType] = value;
    } else {
      return res.status(400).json({
        token: "400",
        response: `Invalid key '${key}' in inputObjType. No matching key found in input object.`,
      });
    }

    // Update the document in the collection
    const updateResult = await db
      .collection(odtCollectionName)
      .updateOne({ odtId }, { $set: { inputOdt: existingOdt.inputOdt } });

    return res.json({
      token: "200",
      response: "Successfully updated ODT mapping",
      updatedDocument: existingOdt,
    });
  } catch (err) {
    console.error("Error processing ODT mapping:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to process ODT mapping",
      error: err.message,
    });
  }
};

const get_odt = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const CollectionName = process.env.ODT_COLLECTION;

    const odtId = req.params.id;

    if (!ObjectId.isValid(odtId)) {
      return res.status(400).json({ error: "Invalid odtId" });
    }

    const projection = { inputOdt: 1, emitterId: 1, _id: 0 };
    const odtJson = await db
      .collection(CollectionName)
      .findOne({ odtId }, { projection });

    return res.status(200).json(odtJson);
  } catch (err) {
    console.error("Error fetching odtJson:", err);
    return res.status(500).json({
      error: "Error fetching odtJson",
      details: err.message,
    });
  }
};

const delete_odt = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.ODT_COLLECTION;

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({ token: "200", id, response: "Odt deleted successfully" });
    } else {
      return res.status(404).json({ token: "404", response: "Odt not found" });
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

const value_odt_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const eventCollectionName = process.env.EVENT_COLLECTION;
    const odtCollectionName = process.env.ODT_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const idtCollectionName = process.env.IDT_COLLECTION;

    // Retrieve all events from the event collection
    const allEvents = await db.collection(eventCollectionName).find().toArray();

    if (!allEvents || allEvents.length === 0) {
      return res.status(404).json({
        token: "404",
        response: "No events found in the event collection",
      });
    }

    // Filter events with "ongoing_event" status
    const ongoingEvents = allEvents.filter(event => event.event_status === "ongoing_event");

    if (ongoingEvents.length === 0) {
      return res.status(204).json({
        token: "204",
        response: "No ongoing events found",
      });
    }

    // Process each ongoing event
    const processedEvents = await Promise.all(
      ongoingEvents.map(async (event) => {
        const eventCardTemplateIDTID = event.eventCardTemplateIDTID;

        // Fetch IDT template details
        const idtTemplate = await db
          .collection(idtCollectionName)
          .findOne({ idtId: eventCardTemplateIDTID });

        if (!idtTemplate) {
          return {
            eventId: event.eventId,
            error: "No IDT template found for the provided IDT ID",
          };
        }

        const odtIdTemplate = await db
          .collection(odtCollectionName)
          .find({ idtId: eventCardTemplateIDTID })
          .toArray();

        const updatedOdtTemplates = await Promise.all(
          odtIdTemplate.map(async (template) => {
            const updatedInput = { ...template.input };
            const inputOdt = template.inputOdt;

            // Fetch values for inputOdt keys from attribute collection
            for (const key in inputOdt) {
              if (inputOdt.hasOwnProperty(key)) {
                const attributeId = inputOdt[key]?.id;

                if (attributeId) {
                  const attributeValue = inputOdt[key]?.type;
                  const attributeName = inputOdt[key]?.name;
                  const attributeContent = inputOdt[key]?.content;
                  if (attributeValue == "Attribute") {
                    const attributeDoc = await db
                      .collection(attributeCollectionName)
                      .findOne({ attributeId: attributeId });

                    if (attributeDoc && attributeDoc.value) {
                      updatedInput[key] = attributeDoc.value;
                    }
                  } else if (attributeValue == "Event") {
                    const attributeDoc = await db
                      .collection(eventCollectionName)
                      .findOne({ eventId: attributeId });

                    if (attributeDoc && attributeDoc[inputOdt[key]?.name]) {
                      updatedInput[key] = attributeDoc[inputOdt[key]?.name];
                    }
                  }
                  else if (attributeValue == "List") {

                    const projection = { entityOrInstanceId: 1, entityOrInstanceName: 1, _id: 0 };
                    const entityOrInstanceDoc = await db
                      .collection(entityCollectionName)
                      .find({ type: attributeName }, { projection }).toArray();

                    const formattedResult = entityOrInstanceDoc.map(value => ({
                      id: value.entityOrInstanceId,
                      name: value.entityOrInstanceName
                    }));

                    if (entityOrInstanceDoc) {
                      updatedInput[key] = formattedResult;
                    }
                  }
                  else if (attributeValue == "Static") {
                    updatedInput[key] = attributeContent;
                  }
                }
              }
            }

            return {
              id: template.id,
              w: template.w,
              h: template.h,
              selector: template.selector,
              input: updatedInput,
              inputOdt: inputOdt,
              x: template.x,
              y: template.y,
            };
          })
        );

        return {
          eventId: event.eventId,
          template: {
            _id: idtTemplate._id,
            templateId: idtTemplate.templateId,
            templateName: idtTemplate.templateName,
            templateType: idtTemplate.templateType,
            templateWidth: idtTemplate.templateWidth,
            templateHeight: idtTemplate.templateHeight,
            templateObj: {
              ...idtTemplate.templateObj,
              children: updatedOdtTemplates,
            },
          },
        };
      })
    );

    return res.status(200).json({
      token: "200",
      response: "Data grouped and transformed successfully",
      data: processedEvents,
    });
  } catch (err) {
    console.error("Error processing ODT templates:", err);
    return res.status(500).json({
      error: "Error processing ODT templates",
      details: err.message,
    });
  }
};

const value_odt_mapping_Id = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const eventCollectionName = process.env.EVENT_COLLECTION;
    const odtCollectionName = process.env.ODT_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const idtCollectionName = process.env.IDT_COLLECTION;

    // Extract inputs from the request
    const { eventCardTemplateIDTID, event_status } = req.body;

    if (!eventCardTemplateIDTID || !event_status) {
      return res.status(400).json({
        token: "400",
        response: "Missing required parameters: eventCardTemplateIDTID or event_status",
      });
    }

    // Fetch events matching the provided ID and status
    const matchingEvents = await db
      .collection(eventCollectionName)
      .find({ eventCardTemplateIDTID, event_status })
      .toArray();

    if (!matchingEvents || matchingEvents.length === 0) {
      return res.status(404).json({
        token: "404",
        response: "No events found matching the given ID and status",
      });
    }

    // Process each matched event
    const processedEvents = await Promise.all(
      matchingEvents.map(async (event) => {
        // Fetch IDT template
        const idtTemplate = await db
          .collection(idtCollectionName)
          .findOne({ idtId: eventCardTemplateIDTID });

        if (!idtTemplate) {
          return {
            eventId: event.eventId,
            error: "No IDT template found for the provided IDT ID",
          };
        }

        // Fetch ODT templates linked to the IDT ID
        const odtIdTemplate = await db
          .collection(odtCollectionName)
          .find({ idtId: eventCardTemplateIDTID })
          .toArray();

        const updatedOdtTemplates = await Promise.all(
          odtIdTemplate.map(async (template) => {
            const updatedInput = { ...template.input };
            const inputOdt = template.inputOdt;

            // Update template inputs
            for (const key in inputOdt) {
              if (inputOdt.hasOwnProperty(key)) {
                const attributeId = inputOdt[key]?.id;

                if (attributeId) {
                  const attributeValue = inputOdt[key]?.type;
                  const attributeName = inputOdt[key]?.name;

                  if (attributeValue === "Attribute") {
                    const attributeDoc = await db
                      .collection(attributeCollectionName)
                      .findOne({ attributeId });

                    if (attributeDoc && attributeDoc.value) {
                      updatedInput[key] = attributeDoc.value;
                    }
                  } else if (attributeValue === "Event") {
                    const attributeDoc = await db
                      .collection(eventCollectionName)
                      .findOne({ eventId: attributeId });

                    if (attributeDoc && attributeDoc[inputOdt[key]?.name]) {
                      updatedInput[key] = attributeDoc[inputOdt[key]?.name];
                    }
                  }
                }
              }
            }

            return {
              id: template.id,
              w: template.w,
              h: template.h,
              selector: template.selector,
              input: updatedInput,
              inputOdt: inputOdt,
              x: template.x,
              y: template.y,
            };
          })
        );

        return {
          eventId: event.eventId,
          template: {
            _id: idtTemplate._id,
            templateId: idtTemplate.templateId,
            templateName: idtTemplate.templateName,
            templateType: idtTemplate.templateType,
            templateWidth: idtTemplate.templateWidth,
            templateHeight: idtTemplate.templateHeight,
            templateObj: {
              ...idtTemplate.templateObj,
              children: updatedOdtTemplates,
            },
          },
        };
      })
    );

    return res.status(200).json({
      token: "200",
      response: "Data grouped and transformed successfully",
      data: processedEvents,
    });
  } catch (err) {
    console.error("Error processing ODT templates:", err);
    return res.status(500).json({
      error: "Error processing ODT templates",
      details: err.message,
    });
  }
};

const page_odt_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const eventCollectionName = process.env.EVENT_COLLECTION;
    const odtCollectionName = process.env.ODT_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const idtCollectionName = process.env.IDT_COLLECTION;
    const entityCollectionName = process.env.ENTITY_COLLECTION;

    const eventId = req.body.eventId;

    if (!eventId || eventId.trim() === "") {
      return res.status(204).json({
        token: "204",
        response: "eventId is required and cannot be empty",
      });
    }

    const existingEvent = await db
      .collection(eventCollectionName)
      .findOne({ eventId });

    if (!existingEvent) {
      return res.status(400).json({
        token: "400",
        response: "Event with the provided eventId does not exist",
      });
    }
    const eventStatus = existingEvent.event_status;

    if (eventStatus != "ongoing_event") {
      return res.status(204).json({
        token: "400",
        response: "Event with the provided eventId does not have ongoing status",
      });
    }

    const
      eventDetailpageIDTID = existingEvent.
        eventDetailpageIDTID;

    // Fetch IDT template details
    const idtTemplate = await db
      .collection(idtCollectionName)
      .findOne({
        idtId:
          eventDetailpageIDTID
      });

    if (!idtTemplate) {
      return res.status(400).json({
        token: "400",
        response: "No IDT template found for the provided IDT ID",
      });
    }

    const odtIdTemplate = await db
      .collection(odtCollectionName)
      .find({
        idtId:
          eventDetailpageIDTID
      })
      .toArray();

    const updatedOdtTemplates = await Promise.all(
      odtIdTemplate.map(async (template) => {
        const updatedInput = { ...template.input };
        const inputOdt = template.inputOdt;

        // Fetch values for inputOdt keys from attribute collection
        for (const key in inputOdt) {
          if (inputOdt.hasOwnProperty(key)) {
            const attributeId = inputOdt[key]?.id;

            if (attributeId) {
              const attributeValue = inputOdt[key]?.type;
              const attributeName = inputOdt[key]?.name;
              const attributeContent = inputOdt[key]?.content;

              if (attributeValue == "Attribute") {
                const attributeDoc = await db
                  .collection(attributeCollectionName)
                  .findOne({ attributeId: attributeId });

                if (attributeDoc && attributeDoc.value) {
                  updatedInput[key] = attributeDoc.value;
                }
              }
              else if (attributeValue == "Event") {
                const attributeDoc = await db
                  .collection(eventCollectionName)
                  .findOne({ eventId: attributeId });

                if (attributeDoc && attributeDoc[inputOdt[key]?.name]) {
                  updatedInput[key] = attributeDoc[inputOdt[key]?.name];
                }
              }
              else if (attributeValue == "List") {

                const projection = { entityOrInstanceId: 1, entityOrInstanceName: 1, _id: 0 };
                const entityOrInstanceDoc = await db
                  .collection(entityCollectionName)
                  .find({ type: attributeName }, { projection }).toArray();

                const formattedResult = entityOrInstanceDoc.map(value => ({
                  id: value.entityOrInstanceId,
                  name: value.entityOrInstanceName
                }));

                if (entityOrInstanceDoc) {
                  updatedInput[key] = formattedResult;
                }
              }
              else if (attributeValue == "Static") {
                updatedInput[key] = attributeContent;
              }

            }
          }
        }

        return {
          id: template.id,
          odtId: template.odtId,
          w: template.w,
          h: template.h,
          selector: template.selector,
          input: updatedInput,
          inputOdt: inputOdt,
          x: template.x,
          y: template.y,
          emitterId: template.emitterId,
        };
      })
    );

    // Final response structure
    const finalResponse = {
      _id: idtTemplate._id,
      templateId: idtTemplate.templateId,
      templateName: idtTemplate.templateName,
      templateType: idtTemplate.templateType,
      templateWidth: idtTemplate.templateWidth,
      templateHeight: idtTemplate.templateHeight,
      templateObj: {
        ...idtTemplate.templateObj,
        children: updatedOdtTemplates,
      },
    };

    return res.status(200).json({
      token: "200",
      response: "Data grouped and transformed successfully",
      data: finalResponse,
    });
  } catch (err) {
    console.error("Error processing ODT templates:", err);
    return res.status(500).json({
      error: "Error processing ODT templates",
      details: err.message,
    });
  }
};

// entity_form_mapping
const entity_form_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const eventCollectionName = process.env.EVENT_COLLECTION;
    const odtCollectionName = process.env.ODT_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const idtCollectionName = process.env.IDT_COLLECTION;
    const entityCollectionName = process.env.ENTITY_COLLECTION;

    const entityId = req.body.entityId;

    if (!entityId || entityId.trim() === "") {
      return res.status(204).json({
        token: "204",
        response: "entityId is required and cannot be empty",
      });
    }

    const entity = await db
      .collection(entityCollectionName)
      .findOne({ entityId: entityId });

    if (!entity) {
      return res.status(400).json({
        token: "400",
        response: "Entity with the provided entityId does not exist",
      });
    }
    const entityFormId = entity.entityFormId;

    if (!entityFormId) {
      return res.status(204).json({
        token: "400",
        response: "The entity does not have a date entry screen",
      });
    }


    // Fetch IDT template details
    const idtTemplate = await db
      .collection(idtCollectionName)
      .findOne({
        idtId:
          entityFormId
      });

    if (!idtTemplate) {
      return res.status(400).json({
        token: "400",
        response: "No IDT template found for the provided IDT ID",
      });
    }

    const odtIdTemplate = await db
      .collection(odtCollectionName)
      .find({
        idtId:
          entityFormId
      })
      .toArray();

    const updatedOdtTemplates = await Promise.all(
      odtIdTemplate.map(async (template) => {
        const updatedInput = { ...template.input };
        const inputOdt = template.inputOdt;

        // Fetch values for inputOdt keys from attribute collection
        for (const key in inputOdt) {
          if (inputOdt.hasOwnProperty(key)) {
            const attributeId = inputOdt[key]?.id;

            if (attributeId) {
              const attributeValue = inputOdt[key]?.type;
              const attributeName = inputOdt[key]?.name;
              const attributeContent = inputOdt[key]?.content;

              if (attributeValue == "Attribute") {
                // const attributeDoc = await db
                //   .collection(attributeCollectionName)
                //   .findOne({ attributeId: attributeId });

                // if (attributeDoc && attributeDoc.value) {
                //   updatedInput[key] = attributeDoc.value;
                // }


                const existingAttribute = await db.collection(attributeCollectionName).findOne({ attributeId: attributeId });
                if (!existingAttribute) {
                  throw new Error('No document found');
                }

                const attributeName = existingAttribute.attributeName;

                // Find the matching document with the same attributeName
                const matchingDocument = await db.collection(attributeCollectionName).findOne({
                  entityOrInstanceId: entityId,
                  attributeName: attributeName
                });

                if (!matchingDocument) {
                  throw new Error(`No matching document found with attributeName: ${attributeName}`);
                }

                updatedInput[key] = matchingDocument.value;

              }
              else if (attributeValue == "List") {
                const projection = { entityOrInstanceId: 1, entityOrInstanceName: 1, _id: 0 };
                const entityOrInstanceDoc = await db
                  .collection(entityCollectionName)
                  .find({ type: attributeName }, { projection }).toArray();

                const formattedResult = entityOrInstanceDoc.map(value => ({
                  id: value.entityOrInstanceId,
                  name: value.entityOrInstanceName
                }));

                if (entityOrInstanceDoc) {
                  updatedInput[key] = formattedResult;
                }
              }
              else if (attributeValue == "Static") {
                updatedInput[key] = attributeContent;
              }

            }
          }
        }

        return {
          id: template.id,
          odtId: template.odtId,
          w: template.w,
          h: template.h,
          selector: template.selector,
          input: updatedInput,
          inputOdt: inputOdt,
          x: template.x,
          y: template.y,
          emitterId: template.emitterId,
        };
      })
    );

    // Final response structure
    const finalResponse = {
      _id: idtTemplate._id,
      templateId: idtTemplate.templateId,
      templateName: idtTemplate.templateName,
      templateType: idtTemplate.templateType,
      templateWidth: idtTemplate.templateWidth,
      templateHeight: idtTemplate.templateHeight,
      templateObj: {
        ...idtTemplate.templateObj,
        children: updatedOdtTemplates,
      },
    };

    return res.status(200).json({
      token: "200",
      response: "Data grouped and transformed successfully",
      data: finalResponse,
    });
  } catch (err) {
    console.error("Error processing ODT templates:", err);
    return res.status(500).json({
      error: "Error processing ODT templates",
      details: err.message,
    });
  }
};

// report_form_mapping
const report_form_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const eventCollectionName = process.env.EVENT_COLLECTION;
    const odtCollectionName = process.env.ODT_COLLECTION;
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const idtCollectionName = process.env.IDT_COLLECTION;
    const entityCollectionName = process.env.ENTITY_COLLECTION;
    const entityId = ''

    // const entityId = req.body.entityId;

    // if (!entityId  || entityId .trim() === "") {
    //   return res.status(204).json({
    //     token: "204",
    //     response: "entityId is required and cannot be empty",
    //   });
    // }

    // const entity = await db
    //   .collection(entityCollectionName)
    //   .findOne({ entityOrInstanceId:entityId });

    // if (!entity) {
    //   return res.status(400).json({
    //     token: "400",
    //     response: "Entity with the provided entityId does not exist",
    //   });
    // }


    const appFormId = req.body.appId;
    const date = req.body.date

    if (!appFormId) {
      return res.status(204).json({
        token: "400",
        response: "The app does not have a report screen",
      });
    }
    if (!date) {
      return res.status(204).json({
        token: "400",
        response: "Date is required",
      });
    }


    // Fetch IDT template details
    const idtTemplate = await db
      .collection(idtCollectionName)
      .findOne({
        idtId:
          appFormId
      });

    if (!idtTemplate) {
      return res.status(400).json({
        token: "400",
        response: "No IDT template found for the provided IDT ID",
      });
    }

    const odtIdTemplate = await db
      .collection(odtCollectionName)
      .find({
        idtId:
          appFormId
      })
      .toArray();

    const updatedOdtTemplates = await Promise.all(
      odtIdTemplate.map(async (template) => {
        const updatedInput = { ...template.input };
        const inputOdt = template.inputOdt;

        if (template.selector === 'app-primeng-dynamic-table') {
          // Apply specific logic for these selectors
          for (const key in inputOdt) {
            if (inputOdt.hasOwnProperty(key)) {
              const attributeId = inputOdt[key]?.id;

              if (attributeId) {
                const attributeValue = inputOdt[key]?.type;
                const attributeName = inputOdt[key]?.name;
                const attributeContent = inputOdt[key]?.content;
                if (attributeValue === "Entity") {
                  let resultArray
                  const entitySchema = await db.collection(attributeCollectionName).find({ entityOrInstanceId: attributeId }).toArray();
                  const filteredEntitySchema = entitySchema.map(item => {
                    return {
                      order: item.order,
                      attributeName: item.attributeName
                    };
                  });
                  const entityData = await db.collection('Entity Data').find({ entityOrInstanceId: attributeId }).toArray();
                  if (entityData.length === 0) {
                    const projection = { entityOrInstanceId: 1, _id: 0 };
                    const instances = await db.collection('Entity').find({ entityLookupId: attributeId }, { projection }).toArray();
                    const entityOrInstanceIds = instances.map(item => item.entityOrInstanceId);
                    console.log(entityOrInstanceIds)
                    const attributes_list = await db.collection(attributeCollectionName).find({
                      entityOrInstanceId: { $in: entityOrInstanceIds }
                    }).toArray();

                    const groupedByInstance = attributes_list.reduce((acc, item) => {
                      const { entityOrInstanceId, attributeName, value } = item;
                      if (!acc[entityOrInstanceId]) {
                        acc[entityOrInstanceId] = {};
                      }
                      acc[entityOrInstanceId][attributeName] = value;
                      return acc;
                    }, {});

                    const products = Object.values(groupedByInstance).map(instance => {
                      const product = {};
                      filteredEntitySchema.forEach(({ attributeName }) => {
                        product[attributeName] = instance[attributeName] || "";
                      });
                      return product;
                    });

                    resultArray = products;
                  }
                  else {
                    resultArray = entityData.map(item => {
                      const newObj = {};
                      filteredEntitySchema.forEach(attr => {
                        const key = attr.attributeName;
                        newObj[key] = item.data[key] || '';
                      });
                      return newObj;
                    });
                  }

                  const dataSets = { attributes: filteredEntitySchema, products: resultArray }
                  updatedInput[key] = dataSets
                }

              }
            }
          }
        }
        else if (template.selector === 'app-primeng-sbar') {
          for (const key in inputOdt) {
            if (inputOdt.hasOwnProperty(key)) {
              const attributeId = inputOdt[key]?.id;

              if (attributeId) {
                const attributeValue = inputOdt[key]?.type;
                const attributeName = inputOdt[key]?.name;
                const attributeContent = inputOdt[key]?.content;

                if (attributeValue === "Entity") {
                  const entitySchema = await db.collection(attributeCollectionName).find({ entityOrInstanceId: attributeId }).toArray();
                  const filteredEntitySchema = entitySchema.map(item => {
                    return {
                      attributeName: item.attributeName,
                      order: item.order
                    };
                  });
                  const entityData = await db.collection('Entity Data').find({ entityOrInstanceId: attributeId }).toArray();
                  const resultArray = entityData.map(item => {
                    const newObj = {};
                    filteredEntitySchema.forEach(attr => {
                      const key = attr.attributeName;
                      newObj[key] = item.data[key] || '';
                    });
                    return newObj;
                  });

                  const dataSets = { attributes: filteredEntitySchema, products: resultArray }
                  updatedInput[key] = dataSets
                }

              }
            }
          }
        }
        else {
          // Default logic for other selectors
          for (const key in inputOdt) {
            if (inputOdt.hasOwnProperty(key)) {
              const attributeId = inputOdt[key]?.id;
              const frequency = inputOdt[key]?.frequency;

              if (attributeId) {
                const attributeValue = inputOdt[key]?.type;
                const attributeName = inputOdt[key]?.name;
                const attributeContent = inputOdt[key]?.content;

                if (attributeValue === "Attribute") {
                  const existingAttribute = await db.collection(attributeCollectionName).findOne({ attributeId: attributeId });
                  if (!existingAttribute) {
                    throw new Error('No document found');
                  }
                  const matchingDocument = await db.collection(attributeCollectionName).findOne({
                    entityOrInstanceId: existingAttribute.entityOrInstanceId,
                    attributeName: existingAttribute.attributeName
                  });
                  if (!matchingDocument) {
                    throw new Error(`No matching document found with attributeName: ${existingAttribute.attributeName}`);
                  }
                  if (frequency === null || frequency === undefined) {
                    if (matchingDocument.value === '' || !matchingDocument.value) {
                      updatedInput[key] = await checkDefaults(attributeId, matchingDocument.value, matchingDocument?.defaults, date)
                    }
                    else {
                      updatedInput[key] = matchingDocument.value;
                    }
                  }
                  else {
                    const freqVal = await getFrequencyData(attributeId, frequency, date);
                    if (freqVal) {
                      updatedInput[key] = freqVal
                    }
                    else {
                      updatedInput[key] = await checkDefaults(attributeId, matchingDocument.value, matchingDocument?.defaults, date)
                    }
                  }

                  updatedInput.required = matchingDocument.isNull === true && matchingDocument.dataSource !== 'Sensor';
                  updatedInput.readOnly = matchingDocument.dataSource === 'Sensor' ? true : false;
                }
                else if (attributeValue === "List") {
                  const projection = { entityOrInstanceId: 1, entityOrInstanceName: 1, _id: 0 };
                  const entityOrInstanceDoc = await db
                    .collection(entityCollectionName)
                    .find({ type: attributeName }, { projection })
                    .toArray();

                  const formattedResult = entityOrInstanceDoc.map(value => ({
                    id: value.entityOrInstanceId,
                    name: value.entityOrInstanceName
                  }));

                  if (entityOrInstanceDoc.length > 0) {
                    updatedInput[key] = formattedResult;
                  }
                }
                else if (attributeValue === "Static") {
                  updatedInput[key] = attributeContent;
                }
              }
            }
          }
        }

        return {
          id: template.id,
          odtId: template.odtId,
          w: template.w,
          h: template.h,
          selector: template.selector,
          input: updatedInput,
          inputOdt: inputOdt,
          x: template.x,
          y: template.y,
          emitterId: template.emitterId,
        };
      })
    );


    // const updatedOdtTemplates = await Promise.all(
    //   odtIdTemplate.map(async (template) => {
    //     const updatedInput = { ...template.input };
    //     const inputOdt = template.inputOdt;

    //     // Fetch values for inputOdt keys from attribute collection
    //     for (const key in inputOdt) {
    //       if (inputOdt.hasOwnProperty(key)) {
    //         const attributeId = inputOdt[key]?.id;

    //         if (attributeId) {
    //           const attributeValue = inputOdt[key]?.type;
    //           const attributeName = inputOdt[key]?.name;
    //           const attributeContent = inputOdt[key]?.content;

    //           if (attributeValue == "Attribute") {
    //             // const attributeDoc = await db
    //             //   .collection(attributeCollectionName)
    //             //   .findOne({ attributeId: attributeId });

    //             // if (attributeDoc && attributeDoc.value) {
    //             //   updatedInput[key] = attributeDoc.value;
    //             // }
    //             const existingAttribute = await db.collection(attributeCollectionName).findOne({ attributeId: attributeId });
    //               if (!existingAttribute) {
    //                   throw new Error('No document found');
    //               }

    //               const attributeName = existingAttribute.attributeName;

    //               // Find the matching document with the same attributeName
    //               const matchingDocument = await db.collection(attributeCollectionName).findOne({ 
    //                   entityOrInstanceId: entityId,
    //                   attributeName: attributeName 
    //               });

    //               if (!matchingDocument) {
    //                   throw new Error(`No matching document found with attributeName: ${attributeName}`);
    //               }

    //               updatedInput[key] = matchingDocument.value;

    //           }
    //           else if (attributeValue == "List") {
    //             const projection = { entityOrInstanceId: 1, entityOrInstanceName: 1, _id: 0 };
    //             const entityOrInstanceDoc = await db
    //               .collection(entityCollectionName)
    //               .find({ type: attributeName }, { projection }).toArray();

    //             const formattedResult = entityOrInstanceDoc.map(value => ({
    //               id: value.entityOrInstanceId,
    //               name: value.entityOrInstanceName
    //             }));

    //             if (entityOrInstanceDoc) {
    //               updatedInput[key] = formattedResult;
    //             }
    //           }
    //           else if (attributeValue == "Static") {
    //             updatedInput[key] = attributeContent;
    //           }

    //         }
    //       }
    //     }

    //     return {
    //       id: template.id,
    //       odtId: template.odtId,
    //       w: template.w,
    //       h: template.h,
    //       selector: template.selector,
    //       input: updatedInput,
    //       inputOdt: inputOdt,
    //       x: template.x,
    //       y: template.y,
    //       emitterId: template.emitterId,
    //     };
    //   })
    // );

    // Final response structure

    const finalResponse = {
      _id: idtTemplate._id,
      templateId: idtTemplate.templateId,
      templateName: idtTemplate.templateName,
      templateType: idtTemplate.templateType,
      templateWidth: idtTemplate.templateWidth,
      templateHeight: idtTemplate.templateHeight,
      templateObj: {
        ...idtTemplate.templateObj,
        children: updatedOdtTemplates,
      },
    };

    return res.status(200).json({
      token: "200",
      response: "Data grouped and transformed successfully",
      data: finalResponse,
    });
  } catch (err) {
    console.error("Error processing ODT templates:", err);
    return res.status(500).json({
      error: "Error processing ODT templates",
      details: err.message,
    });
  }
};


const get_page_attributes = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const appFormId = req.params.id;

    if (!appFormId) {
      return res.status(204).json({
        token: "400",
        response: "The app does not have a report screen",
      });
    }


    const idtExists = await db.collection(process.env.IDT_COLLECTION).findOne(
      { idtId: appFormId },
      { projection: { _id: 1 } }
    );

    if (!idtExists) {
      return res.status(400).json({
        token: "400",
        response: "No IDT template found for the provided IDT ID",
      });
    }


    const odtTemplates = await db.collection(process.env.ODT_COLLECTION).find(
      { idtId: appFormId },
      { projection: { "inputOdt": 1 } }
    ).toArray();


    const attributes_array = [];
    const seenAttributeIds = new Set();

    for (const template of odtTemplates) {
      const inputOdt = template.inputOdt || {};

      for (const key in inputOdt) {
        const attribute = inputOdt[key];
        if (attribute?.type === "Attribute" && attribute?.id && !seenAttributeIds.has(attribute.id)) {
          seenAttributeIds.add(attribute.id);
          attributes_array.push({
            attributeId: attribute.id,
            name: attribute.name
          });
        }
      }
    }

    return res.status(200).json({
      token: "200",
      response: "Data grouped and transformed successfully",
      attributes: attributes_array,
    });
  } catch (err) {
    console.error("Error processing ODT templates:", err);
    return res.status(500).json({
      error: "Error processing ODT templates",
      details: err.message,
    });
  }
};

const update_odt_emitterId = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const odtCollectionName = process.env.ODT_COLLECTION;

    const { odtId, emitterId } = req.body;

    // Validate input
    if (!odtId) {
      return res.status(400).json({
        token: "400",
        response: "Invalid or missing required fields: odtId",
      });
    }

    // Find the document by `odtId`
    const existingOdt = await db
      .collection(odtCollectionName)
      .findOne({ odtId });

    if (!existingOdt) {
      return res.status(404).json({
        token: "404",
        response: `No record found for odtId: ${odtId}`,
      });
    }

    // Update the `emitterId` field
    const updateResult = await db
      .collection(odtCollectionName)
      .updateOne(
        { odtId },
        { $set: { emitterId } }
      );

    if (updateResult.modifiedCount === 0) {
      return res.status(500).json({
        token: "500",
        response: "Failed to update the emitterId. No changes made.",
      });
    }

    return res.json({
      token: "200",
      response: "Successfully updated emitterId",
      updatedDocument: { ...existingOdt, emitterId },
    });
  } catch (err) {
    console.error("Error updating emitterId:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to process the emitterId update",
      error: err.message,
    });
  }
};

const entity_mapping = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;

    const { entityOrInstanceId } = req.body;
    const type = req.body.type;

    if (!entityOrInstanceId) {
      return res.status(400).json({
        token: "400",
        response:
          "Invalid or missing required fields: entityOrInstanceId",
      });
    }

    // Find the document by `eventId`
    if (type === 'Table') {
      const entitySchema = await db.collection(attributeCollectionName).find({ entityOrInstanceId: entityOrInstanceId }).toArray();
      const filteredEntitySchema = entitySchema.map(item => {
        return {
          attributeName: item.attributeName
        };
      });
      const entityData = await db.collection('Entity Data').find({ entityOrInstanceId: entityOrInstanceId }).toArray();
      const resultArray = entityData.map(item => {
        const newObj = {};
        filteredEntitySchema.forEach(attr => {
          const key = attr.attributeName;
          newObj[key] = item.data[key] || '';
        });
        return newObj;
      });

      const dataSets = { attributes: filteredEntitySchema, products: resultArray }
      return res.status(200).json({ dataSets: dataSets });
    }
    else {
      const projection = { _id: 0, attributeName: 1, value: 1 };
      const existingOdt = await db
        .collection(attributeCollectionName)
        .find({ entityOrInstanceId: entityOrInstanceId }, { projection }).toArray();

      const attributeValue = {};

      const formattedResult = existingOdt.map(value => (
        attributeValue[value.attributeName] = value.value
      ));

      if (!existingOdt) {
        return res.status(404).json({
          token: "404",
          response: `No record found for entityId: ${entityOrInstanceId}`,
        });
      }
      return res.status(200).json(attributeValue);
    }

  } catch (err) {
    console.error("Error processing entity mapping:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to process entity mapping",
      error: err.message,
    });
  }
};


const get_cards = async (req, res) => {
  const idt_collection = process.env.IDT_COLLECTION;
  const odt_collection = process.env.ODT_COLLECTION;
  const db = await connectToMongoDB();
  const result = await db.collection(idt_collection).aggregate([
    {
      $match: { templateType: 'Card Design' }
    },
    {
      $lookup: {
        from: odt_collection,
        localField: 'templateId',
        foreignField: 'idtId',
        as: 'children'
      }
    },
    {
      $project: {
        templateObj: 1,
        templateType: 1,
        cardType: 1,
        children: 1,
        templateWidth: 1,
        templateHeight: 1
      }
    }
  ]).toArray();
  return res.status(200).json(result)
}


export default { odt_mapping, get_odt, value_odt_mapping, value_odt_mapping_Id, page_odt_mapping, entity_form_mapping, report_form_mapping, get_page_attributes, update_odt_emitterId, entity_mapping, delete_odt, get_cards };

// added by rangarao to set the default value for attributes
async function checkDefaults(attributeId, value, defaults, date) {
  const db = await connectToMongoDB();
  const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
  const attributevalueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION
  if (defaults && Array.isArray(defaults)) {
    defaults.sort((a, b) => a.applyOrder - b.applyOrder);
    for (let defaul of defaults) {
      if (defaul?.algorithm === 'Current') {
        console.log(date);
        if (defaul.refTag && defaul.refTag?.attrId) {
          const projection = { value: 1, _id: 0 }
          const refTagValue = await db.collection(attributevalueCollection).findOne({ attributeId: defaul.refTag.attrId, date: date }, { projection });
          if (refTagValue?.value !== null && refTagValue?.value !== undefined && refTagValue?.value !== '') {
            value = refTagValue.value;
            break;
          }
        }
      }
      else if (defaul?.algorithm === 'Recent') {
        const predate = new Date(date);
        predate.setDate(predate.getDate() - 1);
        if (defaul.refTag && defaul.refTag?.attrId) {
          const projection = { value: 1, _id: 0 }
          const refTagValue = await db.collection(attributevalueCollection).findOne({ attributeId: defaul.refTag.attrId, date: predate }, { projection });
          if (refTagValue?.value !== null && refTagValue?.value !== undefined && refTagValue?.value !== '') {
            value = refTagValue.value;
            break;
          }
        }
      }
      else if (defaul?.algorithm === 'Constant') {
        value = defaul.defaultValue;
        //         if (attributeId === '67b419dbe1caa60e1526f8ab') {
        //   console.log(value);
        // }
        break;
      }
    }
    return value
  } else {
    return value
  }
}

async function getFrequencyData(attributeId, frequency, date) {
  const attributevalueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;
  const db = await connectToMongoDB();
  const inputDate = new Date(date);
  const year = inputDate.getFullYear();
  const month = inputDate.getMonth();
  const day = inputDate.getDate();
  const hour = inputDate.getHours();


  const getDateRange = (frequency, inputDate) => {
    switch (frequency) {
      case "Hour":
        return {
          date: {
            $gte: new Date(year, month, day, hour, 0, 0),
            $lt: new Date(year, month, day, hour + 1, 0, 0),
          },
        };
      case "Day":
        return {
          date: {
            $gte: new Date(year, month, day),
            $lte: new Date(year, month, day + 1),
          },
        };
      case "Week":
        const startOfWeek = new Date(inputDate);
        startOfWeek.setDate(day - inputDate.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);
        return { date: { $gte: startOfWeek, $lt: endOfWeek } };
      case "Month":
        return {
          date: {
            $gte: new Date(year, month, 1),
            $lt: new Date(year, month + 1, 1),
          },
        };
      case "Quarter":
        const quarterStartMonth = Math.floor(month / 3) * 3;
        return {
          date: {
            $gte: new Date(year, quarterStartMonth, 1),
            $lt: new Date(year, quarterStartMonth + 3, 1),
          },
        };
      case "Semi-Annual":
        return {
          date: {
            $gte: new Date(year, month < 6 ? 0 : 6, 1),
            $lt: new Date(year, month < 6 ? 6 : 12, 1),
          },
        };
      case "Year":
        return {
          date: {
            $gte: new Date(year, 0, 1),
            $lt: new Date(year + 1, 0, 1),
          },
        };
      default:
        return { date: inputDate };
    }
  };


  const query = { attributeId, frequency, ...getDateRange(frequency, inputDate) };

  const existingEntry = await db.collection(attributevalueCollection).findOne(query);

  if (attributeId === '67b5bf4e3c135bff9ab8e8f6') {
    console.log('Attribute - ', attributeId);
    console.log('Date - ', date);
    console.log('Frequency - ', frequency);
    console.log('Query - ', query);
    console.log('data - ', existingEntry);
  }


  if (existingEntry && existingEntry?.value) {
    return value = existingEntry?.value;
  } else {
    return null
  }
}




