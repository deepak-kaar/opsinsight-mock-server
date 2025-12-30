import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId, MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const post_event = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const eventCollectionName = process.env.EVENT_COLLECTION;
    const triggerCollectionName = process.env.EVENT_TRIGGER_COLLECTION;
    const templateCollectionName = process.env.TEMPLATE_COLLECTION;
    const idtCollectionName = process.env.IDT_COLLECTION;
    const odtCollectionName = process.env.ODT_COLLECTION;

    const newEventObjectId = new ObjectId();
    const eventId = newEventObjectId.toHexString();

    const { eventName, triggers } = req.body;

    if (!eventName || eventName.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "eventName is required and cannot be empty",
      });
    }

    const existingEvent = await db
      .collection(eventCollectionName)
      .findOne({ eventName });
    if (existingEvent) {
      return res.status(400).json({
        token: "400",
        response: "Event with the provided eventName already exists",
      });
    }

    // const eventCardTemplateIDTID = req.body.eventCardTemplateIDTID;
    // const eventDetailpageIDTID = req.body.eventDetailpageIDTID;

    // const check_eventCardTemplateIDTID = await db
    //   .collection(templateCollectionName)
    //   .findOne({ templateId: eventCardTemplateIDTID });

    // const check_eventDetailpageIDTID = await db
    //   .collection(templateCollectionName)
    //   .findOne({ templateId: eventDetailpageIDTID });

    // const eventCardTemplateName = check_eventCardTemplateIDTID.templateName;
    // const eventDetailpageName = check_eventDetailpageIDTID.templateName;


    // if (!check_eventCardTemplateIDTID) {
    //   return res.status(400).json({
    //     token: "400",
    //     response: "eventCardTemplateIDTID not exists",
    //   });
    // }

    // if (!check_eventDetailpageIDTID) {
    //   return res.status(400).json({
    //     token: "400",
    //     response: "eventDetailpageIDTID not exists",
    //   });
    // }

    // const projection = { _id: 0 };
    // const eventCardTemplate = await db
    //   .collection(templateCollectionName)
    //   .find({ templateId: eventCardTemplateIDTID }, { projection })
    //   .toArray();

    // const eventDetailpage = await db
    //   .collection(templateCollectionName)
    //   .find({ templateId: eventDetailpageIDTID }, { projection })
    //   .toArray();

    // const eventCardTemplate_IDT = (() => {
    //   if (eventCardTemplate.length > 0) {
    //     const { children, ...restTemplateObj } =
    //       eventCardTemplate[0].templateObj;
    //     return {
    //       ...eventCardTemplate[0],
    //       templateObj: restTemplateObj,
    //     };
    //   }
    //   return {};
    // })();

    // const eventDetailpage_IDT = (() => {
    //   if (eventDetailpage.length > 0) {
    //     const { children, ...restTemplateObj } =
    //       eventDetailpage[0].templateObj;
    //     return {
    //       ...eventDetailpage[0],
    //       templateObj: restTemplateObj,
    //     };
    //   }
    //   return {};
    // })();

    // const eventCardTemplate_ODT =
    //   eventCardTemplate[0]?.templateObj?.children || [];

    // const eventDetailpage_ODT =
    //   eventDetailpage[0]?.templateObj?.children || [];

    // const eventCardTemplate_IDTID = new ObjectId();
    // const eventDetailpage_IDTID = new ObjectId();

    // const eventCardTemplate_idtSchema = {
    //   _id: eventCardTemplate_IDTID,
    //   idtId: eventCardTemplate_IDTID.toHexString(),
    //   ...eventCardTemplate_IDT,
    // };

    // const eventDetailpage_idtSchema = {
    //   _id: eventDetailpage_IDTID,
    //   idtId: eventDetailpage_IDTID.toHexString(),
    //   ...eventDetailpage_IDT,
    // };

    // const eventCardTemplate_idtSchema_result = await db
    //   .collection(idtCollectionName)
    //   .insertOne(eventCardTemplate_idtSchema);
    // const eventDetailpage_idtSchema_result = await db
    //   .collection(idtCollectionName)
    //   .insertOne(eventDetailpage_idtSchema);

    // const eventCardTemplate_ODT_promise = eventCardTemplate_ODT.map(
    //   async (attribute) => {
    //     const eventCardTemplate_ODTID = new ObjectId();

    //     const eventCardTemplate_odtSchema = {
    //       _id: eventCardTemplate_ODTID,
    //       odtId: eventCardTemplate_ODTID.toHexString(),
    //       idtId: eventCardTemplate_IDTID.toHexString(),
    //       templateId: eventCardTemplateIDTID,
    //       ...attribute,
    //     };
    //     return db
    //       .collection(odtCollectionName)
    //       .insertOne(eventCardTemplate_odtSchema);
    //   }
    // );

    // const eventDetailpage_ODT_promise = eventDetailpage_ODT.map(
    //   async (attribute) => {
    //     const eventDetailpage_ODTID = new ObjectId();

    //     const eventDetailpage_odtSchema = {
    //       _id: eventDetailpage_ODTID,
    //       odtId: eventDetailpage_ODTID.toHexString(),
    //       idtId: eventDetailpage_IDTID.toHexString(),
    //       templateId: eventDetailpageIDTID,
    //       ...attribute,
    //     };
    //     return db
    //       .collection(odtCollectionName)
    //       .insertOne(eventDetailpage_odtSchema);
    //   }
    // );

    // await Promise.all(eventCardTemplate_ODT_promise);
    // await Promise.all(eventDetailpage_ODT_promise);


    const eventSchema = {
      _id: newEventObjectId,
      eventId,
      eventName: req.body.eventName,
      eventDescription: req.body.eventDescription,
      entityOrInstanceID: req.body.entityOrInstanceID,
      flagID: req.body.flagID,
      eventCardTemplateIDTID: req.body.cardTemplateId || '',
      eventCardTemplateName: req.body.CardTemplateName,
      eventDetailpageIDTID: req.body.DetailpageId,
      eventDetailpageName: req.body.DetailpageName,
      event_status: req.body.event_status,
      createdOn: new Date(),
      eventLevel: req.body.eventLevel,
      eventLevelName: req.body.eventLevelName,
      eventOrgLevel: req.body.eventOrgLevel
    };

    const eventResult = await db
      .collection(eventCollectionName)
      .insertOne(eventSchema);

    if (!triggers || !Array.isArray(triggers) || triggers.length === 0) {
      return res.status(400).json({
        token: "400",
        response: "triggers array is required and cannot be empty",
      });
    }

    const triggerDocuments = triggers.map((trigger) => {
      const newTriggerObjectId = new ObjectId();
      return {
        _id: newTriggerObjectId,
        eventId,
        triggerId: newTriggerObjectId.toHexString(),
        ...trigger,
      };
    });

    await db.collection(triggerCollectionName).insertMany(triggerDocuments);

    return res.json({
      token: "200",
      response: "Successfully created event and triggers in database",
      event: eventSchema,
      triggers: triggerDocuments,
    });
  } catch (err) {
    console.error("Error creating event and triggers:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to create event and triggers",
      error: err.message,
    });
  }
};

const get_event = async function (req, res, next) {
  try {

    let filters = {};
    const appId = req.body.appId;
    const orgId = req.body.orgId;

    filters = {
      ...(appId && { "eventLevelName": appId }),
      ...(orgId && { "eventOrgLevel": orgId }),
      ...(!appId && !orgId && { eventLevel: 'Opsinsight' })
    };
    const db = await connectToMongoDB();
    const collectionName = process.env.EVENT_COLLECTION;

    const result = await db.collection(collectionName).find(filters).toArray();
    return res.json({ token: "200", Events: result });
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};

const get_event_ID = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const triggerCollectionName = process.env.EVENT_TRIGGER_COLLECTION;
    const eventCollectionName = process.env.EVENT_COLLECTION;

    const eventId = req.params.id;

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const events = await db.collection(eventCollectionName).find({ eventId: eventId }).toArray();

    const attributes = await db.collection(triggerCollectionName).find({ eventId: eventId }).toArray();
    events[0].triggers = attributes;

    if (attributes.length > 0) {
      return res.status(200).json({
        token: "200",
        response: "Successfully fetched event attributes",
        events
      });
    } else {
      return res
        .status(404)
        .json({ error: "No attributes found for this eventId" });
    }
  } catch (err) {
    console.error("Error fetching event attributes:", err);
    return res.status(500).json({
      error: "Error fetching event attributes",
      details: err.message,
    });
  }
};
const update_event = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const eventCollectionName = process.env.EVENT_COLLECTION;
    const triggerCollectionName = process.env.EVENT_TRIGGER_COLLECTION;

    const { eventId, eventName, triggers } = req.body;

    if (!eventId || eventId.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "eventId is required and cannot be empty",
      });
    }

    const existingEvent = await db
      .collection(eventCollectionName)
      .findOne({ eventId });
    if (!existingEvent) {
      return res.status(404).json({
        token: "404",
        response: "Event not found with the provided eventId",
      });
    }

    const updatedEvent = {
      eventName: req.body.eventName || existingEvent.eventName,
      eventDescription:
        req.body.eventDescription || existingEvent.eventDescription,
      entityOrInstanceID:
        req.body.entityOrInstanceID || existingEvent.entityOrInstanceID,
      attributeID: req.body.attributeID || existingEvent.attributeID,
      flagID: req.body.flagID || existingEvent.flagID,
      eventCardTemplateIDTID:
        req.body.eventCardTemplateIDTID ||
        existingEvent.eventCardTemplateIDTID,
      eventDetailpageIDTID:
        req.body.eventDetailpageIDTID || existingEvent.eventDetailpageIDTID,
      event_status: req.body.event_status || existingEvent.event_status,
    };

    await db
      .collection(eventCollectionName)
      .updateOne({ eventId }, { $set: updatedEvent });

    if (triggers && Array.isArray(triggers) && triggers.length > 0) {
      await db.collection(triggerCollectionName).deleteMany({ eventId });

      const newTriggerDocuments = triggers.map((trigger) => {
        const newTriggerObjectId = new ObjectId();
        return {
          _id: newTriggerObjectId,
          eventId,
          triggerId: newTriggerObjectId.toHexString(),
          ...trigger,
        };
      });

      await db
        .collection(triggerCollectionName)
        .insertMany(newTriggerDocuments);
    }

    return res.json({
      token: "200",
      response: "Successfully updated event and triggers",
      updatedEvent,
      triggers: triggers || [],
    });
  } catch (err) {
    console.error("Error updating event and triggers:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to update event and triggers",
      error: err.message,
    });
  }
};

const delete_event = async function (req, res, next) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.EVENT_COLLECTION;

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ token: "400", response: "Invalid ID format" });
    }

    const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.json({ token: "200", id, response: "Event deleted successfully" });
    } else {
      return res.status(404).json({ token: "404", response: "Event not found" });
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

export default { post_event, get_event, get_event_ID, update_event, delete_event };
