// // controllers/mongodb.controller.js (Enhanced with logging)
// import { connectToMongoDB} from "../../../config/connection.js";
// import { ObjectId } from "mongodb";
// import dotenv from "dotenv";
// import { constructPayload } from "../util/constructPayload.js";
// import {
//   attr_collection,
//   config_collection,
//   email_collection,
//   report_collection,
//   scheduler_collection,
//   pitypesend_collection,
//   pitypereceive_collection,
//   datasource_collection,
//   database_collection,
//   webservice_collection
// } from "../util/required.js";
// import LoggerService from './logger.service.js'
// dotenv.config();

// const get_collections = async function (req, res) {
//   const startTime = process.hrtime();
//   const correlationId = req.correlationId;

//   try {
//     const db = await connectToMongoDB();
//     const cols = await db.listCollections().toArray();
//     const collectionNames = cols.map(c => c.name);

//     // Log successful operation
//     // await LoggerService.logEvent({
//     //   level: "info",
//     //   category: "DATABASE",
//     //   action: "LIST_COLLECTIONS",
//     //   correlationId,
//     //   user: LoggerService.extractUserInfo(req),
//     //   result: {
//     //     collectionCount: collectionNames.length,
//     //     collections: collectionNames,
//     //   },
//     //   performance: {
//     //     responseTime: LoggerService.calculateResponseTime(startTime),
//     //   },
//     //   message: `Successfully fetched ${collectionNames.length} collections`,
//     // });

//     return res.status(200).json({
//       token: "200",
//       response: "Successfully fetched collections",
//       data: collectionNames
//     });
//   } catch (err) {
//     // Log error
//     // await LoggerService.logError({
//     //   level: "error",
//     //   category: "DATABASE",
//     //   action: "LIST_COLLECTIONS_FAILED",
//     //   correlationId,
//     //   user: LoggerService.extractUserInfo(req),
//     //   error: {
//     //     message: err.message,
//     //     stack: err.stack,
//     //   },
//     //   performance: {
//     //     responseTime: LoggerService.calculateResponseTime(startTime),
//     //   },
//     // });

//     console.error("Error fetching collections:", err);
//     return res.status(500).json({
//       token: "500",
//       response: "Failed to fetch collections",
//       error: err.message
//     });
//   }
// };

// const get_documents = async (req, res) => {
//   const startTime = process.hrtime();
//   const correlationId = req.correlationId;
//   const collection = req.params.collection;

//   try {
//     const {
//       filter = {},
//       projection = {},
//       sort = {},
//       skip = 0,
//       limit = 25
//     } = req.body || {};

//     // Validate inputs
//     if (typeof filter !== 'object' || typeof projection !== 'object' || typeof sort !== 'object') {
//       // await LoggerService.logEvent({
//       //   level: "warn",
//       //   category: "VALIDATION",
//       //   action: "INVALID_QUERY_PARAMS",
//       //   correlationId,
//       //   collection,
//       //   user: LoggerService.extractUserInfo(req),
//       //   message: "Invalid query parameters provided",
//       // });

//       return res.status(400).json({ error: 'Filter, projection, and sort must be valid JSON objects.' });
//     }

//     if (typeof skip !== 'number' || typeof limit !== 'number' || skip < 0 || limit <= 0) {
//       return res.status(400).json({ error: 'Skip and limit must be non-negative numbers.' });
//     }

//     const db = await connectToMongoDB();
//     const col = db.collection(collection);

//     const cursor = col
//       .find(filter, { projection })
//       .sort(sort)
//       .skip(Number(skip))
//       .limit(Math.min(Number(limit), 200));

//     // const queryStartTime = process.hrtime();
//     // const [items, total] = await Promise.all([
//     //   cursor.toArray(),
//     //   col.countDocuments(filter)
//     // ]);
//     // const queryTime = LoggerService.calculateResponseTime(queryStartTime);

//     // Log successful query
// //     await LoggerService.logEvent({
// //       level: "info",
// //       category: "DATABASE",
// //       action: "QUERY_DOCUMENTS",
// //       correlationId,
// //       collection,
// //       user: LoggerService.extractUserInfo(req),
// //       query: {
// //     filter: LoggerService.sanitizePayload(filter),
// //     projection: LoggerService.sanitizePayload(projection),
// //     sort: LoggerService.sanitizePayload(sort),
// //     skip,
// //     limit,
// // },

// //       result: {
// //         recordsReturned: items.length,
// //         totalRecords: total,
// //       },
// //       performance: {
// //         queryTime: parseFloat(queryTime),
// //         responseTime: LoggerService.calculateResponseTime(startTime),
// //       },
// //       message: `Query returned ${items.length} of ${total} documents from ${collection}`,
// //     });

//     res.json({
//       success: true,
//       total,
//       items,
//       appliedFilter: filter,
//       appliedSort: sort,
//       appliedProjection: projection
//     });
//   } catch (e) {
//     // await LoggerService.logError({
//     //   level: "error",
//     //   category: "DATABASE",
//     //   action: "QUERY_FAILED",
//     //   correlationId,
//     //   collection,
//     //   user: LoggerService.extractUserInfo(req),
//     //   error: {
//     //     message: e.message,
//     //     stack: e.stack,
//     //   },
//     // });

//     console.error('Error in get_documents:', e);
//     res.status(500).json({ success: false, error: e.message });
//   }
// };

// const create_document = async (req, res) => {
//   const startTime = process.hrtime();
//   const correlationId = req.correlationId;
//   const collection = req.params.collection;

//   try {
//     const db = await connectToMongoDB();
//     const col = db.collection(collection);

//     let schema = {};
//     if (collection === "DataSource") {
//       schema = datasource_collection;
//     }

//     const isClone = req.body?.isClone === true;
//     const originalId = req.body._id;

//     // Clone handling
//     if (req.body._id && isClone) {
//       delete req.body._id;
//       req.body._id = new ObjectId();
//       req.body.clonedOn = new Date();
//       req.body.clonedFrom = originalId;
//     }

//     const { payload, errors } = constructPayload(schema, req.body, collection);

//     // if (errors.length > 0) {
//     //   await LoggerService.logEvent({
//     //     level: "warn",
//     //     category: "VALIDATION",
//     //     action: "CREATE_VALIDATION_FAILED",
//     //     correlationId,
//     //     collection,
//     //     user: LoggerService.extractUserInfo(req),
//     //     errors,
//     //     message: "Document validation failed",
//     //   });

//     //   return res.status(400).json({
//     //     token: "400",
//     //     response: "Validation failed",
//     //     errors,
//     //   });
//     // }

//     payload.createdOn = payload.createdOn || new Date();
//     payload._id = req.body._id || new ObjectId();

//     // const insertStartTime = process.hrtime();
//     // const result = await col.insertOne(payload);
//     // const insertTime = LoggerService.calculateResponseTime(insertStartTime);

//     // Log audit trail
//     // await LoggerService.logAudit({
//     //   category: "DATA_MODIFICATION",
//     //   action: isClone ? "DOCUMENT_CLONED" : "DOCUMENT_CREATED",
//     //   correlationId,
//     //   collection,
//     //   user: LoggerService.extractUserInfo(req),
//     //   operation: "CREATE",
//     //   documentId: payload._id.toString(),
//     //   dataBefore: null,
//     //   dataAfter: LoggerService.sanitizePayload(payload),
//     //   errors: LoggerService.sanitizePayload(errors),
//     //   isClone,
//     //   clonedFrom: isClone ? originalId : null,
//     //   performance: {
//     //     insertTime: parseFloat(insertTime),
//     //   },
//     //   message: isClone 
//     //     ? `Document cloned from ${originalId} in ${collection}` 
//     //     : `New document created in ${collection}`,
//     // });

//     // Log successful creation
//     // await LoggerService.logEvent({
//     //   level: "info",
//     //   category: "DATABASE",
//     //   action: isClone ? "CLONE_SUCCESS" : "CREATE_SUCCESS",
//     //   correlationId,
//     //   collection,
//     //   user: LoggerService.extractUserInfo(req),
//     //   documentId: payload._id.toString(),
//     //   performance: {
//     //     insertTime: parseFloat(insertTime),
//     //     responseTime: LoggerService.calculateResponseTime(startTime),
//     //   },
//     //   message: `Document ${isClone ? 'cloned' : 'created'} successfully in ${collection}`,
//     // });

//     return res.status(201).json({
//       token: "201",
//       response: "Document created successfully",
//       data: payload,
//     });

//   } catch (err) {
//     // await LoggerService.logError({
//     //   level: "error",
//     //   category: "DATABASE",
//     //   action: "CREATE_FAILED",
//     //   correlationId,
//     //   collection,
//     //   user: LoggerService.extractUserInfo(req),
//     //   error: {
//     //     message: err.message,
//     //     stack: err.stack,
//     //     code: err.code,
//     //   },
//     // });

//     console.error("Error creating document:", err);
//     res.status(500).json({
//       token: "500",
//       response: "Failed to create document",
//       error: err.message,
//     });
//   }
// };

// const update_document = async (req, res) => {
//   const startTime = process.hrtime();
//   const correlationId = req.correlationId;
//   const collection = req.params.collection;
//   const { id } = req.params;

//   try {
//     const db = await connectToMongoDB();
//     const col = db.collection(collection);

//     // if (!ObjectId.isValid(id)) {
//     //   await LoggerService.logEvent({
//     //     level: "warn",
//     //     category: "VALIDATION",
//     //     action: "INVALID_DOCUMENT_ID",
//     //     correlationId,
//     //     collection,
//     //     documentId: id,
//     //     user: LoggerService.extractUserInfo(req),
//     //   });

//     //   return res.status(400).json({
//     //     token: "400",
//     //     response: "Invalid document ID"
//     //   });
//     // }

//     const objectId = new ObjectId(id);

//     // Fetch original document for audit
//     const originalDoc = await col.findOne({ _id: objectId });

//     if (!originalDoc) {
//       // await LoggerService.logEvent({
//       //   level: "warn",
//       //   category: "DATABASE",
//       //   action: "DOCUMENT_NOT_FOUND",
//       //   correlationId,
//       //   collection,
//       //   documentId: id,
//       //   user: LoggerService.extractUserInfo(req),
//       // });

//       return res.status(404).json({
//         token: "404",
//         response: "Document not found"
//       });
//     }

//     const editedValue = { ...req.body };
    
//     const updateStartTime = process.hrtime();
//     const result = await col.updateOne(
//       { _id: objectId },
//       {
//         $set: {
//           isEdit: true,
//           edited_value: editedValue,
//           editedAt: new Date()
//         }
//       }
//     );
//     // const updateTime = LoggerService.calculateResponseTime(updateStartTime);

//     // Log audit trail
//     await LoggerService.logAudit({
//       category: "DATA_MODIFICATION",
//       action: "DOCUMENT_UPDATED",
//       correlationId,
//       collection,
//       user: LoggerService.extractUserInfo(req),
//       operation: "UPDATE",
//       documentId: id,
//       dataBefore: LoggerService.sanitizePayload(originalDoc),
//       dataAfter: LoggerService.sanitizePayload(editedValue),
//       dataBefore: LoggerService.sanitizePayload(originalDoc),
// changesDetected: LoggerService.sanitizePayload(detectChanges(originalDoc, editedValue)),

//       changesDetected: detectChanges(originalDoc, editedValue),
//       performance: {
//         updateTime: parseFloat(updateTime),
//       },
//       message: `Document ${id} flagged as edited in ${collection}`,
//     });

//     // Log successful update
//     // await LoggerService.logEvent({
//     //   level: "info",
//     //   category: "DATABASE",
//     //   action: "UPDATE_SUCCESS",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   performance: {
//     //     updateTime: parseFloat(updateTime),
//     //     responseTime: LoggerService.calculateResponseTime(startTime),
//     //   },
//     // });

//     res.status(200).json({
//       token: "200",
//       response: "Document flagged as edited",
//       data: result
//     });

//   } catch (err) {
//     // await LoggerService.logError({
//     //   level: "error",
//     //   category: "DATABASE",
//     //   action: "UPDATE_FAILED",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   error: {
//     //     message: err.message,
//     //     stack: err.stack,
//     //   },
//     // });

//     console.error("Error updating document:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// const delete_document = async (req, res) => {
//   const startTime = process.hrtime();
//   const correlationId = req.correlationId;
//   const collection = req.params.collection;
//   const { id } = req.params;

//   try {
//     const db = await connectToMongoDB();
//     const col = db.collection(collection);

//     if (!ObjectId.isValid(id)) {
//       return res.status(400).json({
//         token: "400",
//         response: "Invalid document ID"
//       });
//     }

//     const objId = new ObjectId(id);

//     // Fetch document before deletion for audit
//     const originalDoc = await col.findOne({ _id: objId });

//     if (!originalDoc) {
//       return res.status(404).json({
//         token: "404",
//         response: "Document not found"
//       });
//     }

//     // const deleteStartTime = process.hrtime();
//     // const result = await col.updateOne(
//     //   { _id: objId },
//     //   {
//     //     $set: {
//     //       isDeleted: true,
//     //       deletedAt: new Date(),
//     //     },
//     //   }
//     // );
//     // const deleteTime = LoggerService.calculateResponseTime(deleteStartTime);

//     // Log audit trail
// //     await LoggerService.logAudit({
// //       category: "DATA_MODIFICATION",
// //       action: "DOCUMENT_SOFT_DELETED",
// //       correlationId,
// //       collection,
// //       user: LoggerService.extractUserInfo(req),
// //       operation: "SOFT_DELETE",
// //       documentId: id,
// //       dataBefore: LoggerService.sanitizePayload(originalDoc),
// //       dataAfter: LoggerService.sanitizePayload({
// //     ...originalDoc, isDeleted: true, deletedAt: new Date()
// // }),

// //       dataAfter: { ...originalDoc, isDeleted: true, deletedAt: new Date() },
// //       performance: {
// //         deleteTime: parseFloat(deleteTime),
// //       },
// //       message: `Document ${id} soft deleted from ${collection}`,
// //     });

//     // Log security event (deletion is a privileged operation)
//     // await LoggerService.logSecurity({
//     //   level: "info",
//     //   category: "DATA_DELETION",
//     //   action: "SOFT_DELETE",
//     //   severity: "medium",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   message: `User performed soft delete on document ${id}`,
//     // });

//     // await LoggerService.logEvent({
//     //   level: "info",
//     //   category: "DATABASE",
//     //   action: "DELETE_SUCCESS",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   performance: {
//     //     deleteTime: parseFloat(deleteTime),
//     //     responseTime: LoggerService.calculateResponseTime(startTime),
//     //   },
//     // });

//     return res.status(200).json({
//       token: "200",
//       response: "Document soft deleted successfully",
//       data: result,
//     });

//   } catch (err) {
//     // await LoggerService.logError({
//     //   level: "error",
//     //   category: "DATABASE",
//     //   action: "DELETE_FAILED",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   error: {
//     //     message: err.message,
//     //     stack: err.stack,
//     //   },
//     // });

//     console.error("Error deleting document:", err);
//     return res.status(500).json({
//       token: "500",
//       response: "Failed to soft delete document",
//       error: err.message,
//     });
//   }
// };

// const run_aggregate = async (req, res) => {
//   const startTime = process.hrtime();
//   const correlationId = req.correlationId;
//   const collection = req.params.collection;

//   try {
//     const db = await connectToMongoDB();
//     const col = db.collection(collection);
//     const { pipeline = [], allowDiskUse = true } = req.body || {};

//     const aggregateStartTime = process.hrtime();
//     const cursor = col.aggregate(pipeline, { allowDiskUse });
//     const items = await cursor.toArray();
//     const aggregateTime = LoggerService.calculateResponseTime(aggregateStartTime);

//     // await LoggerService.logEvent({
//     //   level: "info",
//     //   category: "DATABASE",
//     //   action: "AGGREGATION_EXECUTED",
//     //   correlationId,
//     //   collection,
//     //   user: LoggerService.extractUserInfo(req),
//     //   aggregation: {
//     //     pipeline: LoggerService.sanitizePayload(pipeline),
//     //     pipelineStages: pipeline.length,
//     //     allowDiskUse,
//     //     recordsReturned: items.length,
//     //   },
//     //   performance: {
//     //     aggregationTime: parseFloat(aggregateTime),
//     //     responseTime: LoggerService.calculateResponseTime(startTime),
//     //   },
//     // });

//     res.status(200).json({
//       token: "200",
//       response: "Aggregation executed successfully",
//       data: items
//     });
//   } catch (err) {
//     // await LoggerService.logError({
//     //   level: "error",
//     //   category: "DATABASE",
//     //   action: "AGGREGATION_FAILED",
//     //   correlationId,
//     //   collection,
//     //   user: LoggerService.extractUserInfo(req),
//     //   error: {
//     //     message: err.message,
//     //     stack: err.stack,
//     //   },
//     // });

//     console.error("Error running aggregation:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// const replace_document = async (req, res) => {
//   const startTime = process.hrtime();
//   const correlationId = req.correlationId;
//   const collection = req.params.collection;
//   const { id } = req.params;

//   try {
//     const db = await connectToMongoDB();
//     const col = db.collection(collection);

//     if (!ObjectId.isValid(id)) {
//       return res.status(400).json({ error: "Invalid ID" });
//     }

//     const objectId = new ObjectId(id);

//     // Fetch original for audit
//     // const originalDoc = await col.findOne({ _id: objectId });

//     // const cleanPayload = { ...req.body };
//     // delete cleanPayload._id;

//     // const replaceStartTime = process.hrtime();
//     // const result = await col.replaceOne(
//     //   { _id: objectId },
//     //   cleanPayload
//     // );
//     // const replaceTime = LoggerService.calculateResponseTime(replaceStartTime);

//     // Log audit trail
//     // await LoggerService.logAudit({
//     //   category: "DATA_MODIFICATION",
//     //   action: "DOCUMENT_REPLACED",
//     //   correlationId,
//     //   collection,
//     //   user: LoggerService.extractUserInfo(req),
//     //   operation: "REPLACE",
//     //   documentId: id,
//     //   dataBefore: LoggerService.sanitizePayload(originalDoc),
//     //   dataAfter: LoggerService.sanitizePayload(cleanPayload),
//     //   performance: {
//     //     replaceTime: parseFloat(replaceTime),
//     //   },
//     //   message: `Document ${id} replaced in ${collection}`,
//     // });

//     // await LoggerService.logEvent({
//     //   level: "info",
//     //   category: "DATABASE",
//     //   action: "REPLACE_SUCCESS",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   performance: {
//     //     replaceTime: parseFloat(replaceTime),
//     //     responseTime: LoggerService.calculateResponseTime(startTime),
//     //   },
//     // });

//     res.json({
//       success: true,
//       message: "Document updated successfully",
//       data: result
//     });

//   } catch (e) {
//     // await LoggerService.logError({
//     //   level: "error",
//     //   category: "DATABASE",
//     //   action: "REPLACE_FAILED",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   error: {
//     //     message: e.message,
//     //     stack: e.stack,
//     //   },
//     // });

//     console.error(e);
//     res.status(500).json({ error: e.message });
//   }
// };

// const hard_delete_document = async (req, res) => {
//   const startTime = process.hrtime();
//   const correlationId = req.correlationId;
//   const collection = req.params.collection;
//   const id = req.params.id;

//   try {
//     const db = await connectToMongoDB();
//     const col = db.collection(collection);

//     if (!ObjectId.isValid(id)) {
//       return res.status(400).json({ error: "Invalid ID" });
//     }

//     // Fetch document before permanent deletion
//     const originalDoc = await col.findOne({ _id: new ObjectId(id) });

//     if (!originalDoc) {
//       return res.status(404).json({ error: "Document not found" });
//     }

//     // const deleteStartTime = process.hrtime();
//     // const result = await col.deleteOne({ _id: new ObjectId(id) });
//     // const deleteTime = LoggerService.calculateResponseTime(deleteStartTime);

//     // Log audit trail (CRITICAL - permanent deletion)
//     // await LoggerService.logAudit({
//     //   category: "DATA_MODIFICATION",
//     //   action: "DOCUMENT_PERMANENTLY_DELETED",
//     //   correlationId,
//     //   collection,
//     //   user: LoggerService.extractUserInfo(req),
//     //   operation: "HARD_DELETE",
//     //   documentId: id,
//     //   dataBefore: LoggerService.sanitizePayload(originalDoc),
//     //   dataAfter: null,
//     //   performance: {
//     //     deleteTime: parseFloat(deleteTime),
//     //   },
//     //   message: `Document ${id} PERMANENTLY deleted from ${collection}`,
//     // });

//     // Log security event (HIGH severity - permanent deletion)
//     // await LoggerService.logSecurity({
//     //   level: "warn",
//     //   category: "DATA_DELETION",
//     //   action: "HARD_DELETE",
//     //   severity: "high",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   deletedData: LoggerService.sanitizePayload(originalDoc),
//     //   message: `CRITICAL: User permanently deleted document ${id} from ${collection}`,
//     // });

//     // await LoggerService.logEvent({
//     //   level: "warn",
//     //   category: "DATABASE",
//     //   action: "HARD_DELETE_SUCCESS",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   performance: {
//     //     deleteTime: parseFloat(deleteTime),
//     //     responseTime: LoggerService.calculateResponseTime(startTime),
//     //   },
//     // });

//     res.json({ 
//       success: true, 
//       message: "Document permanently deleted", 
//       result 
//     });
//   } catch (e) {
//     // await LoggerService.logError({
//     //   level: "error",
//     //   category: "DATABASE",
//     //   action: "HARD_DELETE_FAILED",
//     //   correlationId,
//     //   collection,
//     //   documentId: id,
//     //   user: LoggerService.extractUserInfo(req),
//     //   error: {
//     //     message: e.message,
//     //     stack: e.stack,
//     //   },
//     // });

//     res.status(500).json({ error: e.message });
//   }
// };

// // Schema mapping
// const schemaMap = {
//   "Attributes": attr_collection,
//   "Config": config_collection,
//   "Email": email_collection,
//   "Report Image": report_collection,
//   "Scheduler Job": scheduler_collection,
//   "PI Type Send": pitypesend_collection,
//   "PI Type Receive": pitypereceive_collection,
//   "DataSource": datasource_collection,
//   "DataBase": database_collection,
//   "WebService": webservice_collection
// };

// const create_document_mapping = async (req, res) => {
//   const correlationId = req.correlationId;
//   const colName = req.params.collection;

//   try {
//     const db = await connectToMongoDB();
//     let schema = {};

//     if (colName == "PI") {
//       schema = schemaMap["PI Type Send"];
//     } else {
//       schema = schemaMap[colName];
//     }

//     if (!schema) {
//       // await LoggerService.logEvent({
//       //   level: "warn",
//       //   category: "SCHEMA",
//       //   action: "SCHEMA_NOT_FOUND",
//       //   correlationId,
//       //   collection: colName,
//       //   user: LoggerService.extractUserInfo(req),
//       // });

//       return res.status(400).json({
//         error: `Schema not found for collection: ${colName}`
//       });
//     }

//     // await LoggerService.logEvent({
//     //   level: "info",
//     //   category: "SCHEMA",
//     //   action: "SCHEMA_RETRIEVED",
//     //   correlationId,
//     //   collection: colName,
//     //   user: LoggerService.extractUserInfo(req),
//     //   schema: {
//     //     hasRequiredFields: schema.requiredFields?.length > 0,
//     //     requiredFieldCount: schema.requiredFields?.length || 0,
//     //   },
//     // });

//     console.log("✅ Mapped schema:", colName, schema);

//     return res.json({
//       message: "Schema mapped successfully",
//       schema
//     });

//   } catch (err) {
//     // await LoggerService.logError({
//     //   level: "error",
//     //   category: "SCHEMA",
//     //   action: "SCHEMA_MAPPING_FAILED",
//     //   correlationId,
//     //   collection: colName,
//     //   user: LoggerService.extractUserInfo(req),
//     //   error: {
//     //     message: err.message,
//     //     stack: err.stack,
//     //   },
//     // });

//     console.error("Error creating document:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Helper function to detect changes between documents
// function detectChanges(oldDoc, newDoc) {
//   const changes = [];
//   const allKeys = new Set([...Object.keys(oldDoc), ...Object.keys(newDoc)]);

//   for (const key of allKeys) {
//     if (JSON.stringify(oldDoc[key]) !== JSON.stringify(newDoc[key])) {
//       changes.push({
//         field: key,
//         oldValue: oldDoc[key],
//         newValue: newDoc[key],
//       });
//     }
//   }

//   return changes;
// }

// // ================= SUMMARY ==================
// async function getSummary(req, res) {
//   try {
//     const db = await connectToMongoDB();
//     const logs = db.collection("ApplicationLogs");

//     const total = await logs.countDocuments();
//     const errors = await db.collection("ErrorLogs").countDocuments();
//     const security = await db.collection("SecurityEvents").countDocuments();
//     const audit = await db.collection("AuditTrail").countDocuments();

//     // --- Top Users Aggregation ---
//     const topUsersAgg = await logs.aggregate([
//       { 
//         $group: { 
//           _id: "$user.username",
//           count: { $sum: 1 }
//         } 
//       },
//       { $sort: { count: -1 } },
//       { $limit: 5 }
//     ]).toArray();

//     const topUsers = {
//       labels: topUsersAgg.map(u => u._id || "Unknown"),
//       values: topUsersAgg.map(u => u.count)
//     };

//     // --- Logs Over Time (Daily) ---
//     const timelineAgg = await logs.aggregate([
//       {
//         $group: {
//           _id: { 
//             $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
//           },
//           count: { $sum: 1 }
//         }
//       },
//       { $sort: { "_id": 1 } }
//     ]).toArray();

//     const timeline = {
//       labels: timelineAgg.map(t => t._id),
//       values: timelineAgg.map(t => t.count)
//     };

//     res.json({
//       total,
//       errors,
//       security,
//       audit,
//       chartData: {
//         pie: [total, audit, errors, security],
//         topUsers,
//         timeline
//       }
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Failed to fetch summary");
//   }
// }



// // ================= GET LOGS BY CATEGORY ==================
// async function getCategory(req, res) {
//   console.log("category called")
//   try {
//     const { category } = req.params;

//     const valid = [
//       "ApplicationLogs",
//       "AuditTrail",
//       "SecurityEvents",
//       "ErrorLogs",
//       "PerformanceMetrics"
//     ];

//     if (!valid.includes(category)) {
//       return res.status(400).json({
//         message: "Invalid or missing category name"
//       });
//     }

//     const db = await connectToMongoDB();
//     const data = await db.collection(category)
//       .find({})
//       .sort({ timestamp: -1 })
//       .toArray();

//     res.json({ data });

//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Failed to fetch logs");
//   }
// }


// export default {
//   get_collections,
//   get_documents,
//   create_document,
//   update_document,
//   delete_document,
//   run_aggregate,
//   create_document_mapping,
//   replace_document,
//   hard_delete_document,
//   getCategory,
//   getSummary
// };