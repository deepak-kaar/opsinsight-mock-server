import { connectToMongoDB } from "../../../config/connection.js";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
import { createContext, Script } from "vm";
import { create, all } from "mathjs";

const math = create(all);

dotenv.config();

// Global heartbeat manager for correlation instances
const correlationInstanceHeartbeats = new Map(); // instanceId -> intervalId

// Create correlation template - New Approach
const post_correlation = async function (req, res, next) {
  try {
    const {
      correlationName,
      correlationDesc,
      inputJsonSchema,
      outputJsonSchema,
      internalJsonSchema,
      jsLogic,
    } = req.body;
    
    const db = await connectToMongoDB();
    const collectionName = process.env.FUNCTION_MODEL_COLLECTION;

    const newObjectId = new ObjectId();

    // Check if correlation name already exists
    const existingName = await db
      .collection(collectionName)
      .findOne({ correlationName: correlationName });

    if (existingName) {
      return res.status(400).json({
        token: "400",
        response: "Name with the provided correlation template already exists",
      });
    }

    // Handle both single and multiple internal schemas
    let pipelineSteps = [];
    let pipelineStatement = "";

    if (Array.isArray(internalJsonSchema)) {
      // Multiple internal schemas - extract info from first one for backward compatibility
      if (internalJsonSchema.length > 0) {
        pipelineSteps = internalJsonSchema[0]?.pipelineSteps || [];
        pipelineStatement = internalJsonSchema[0]?.pipelineStatement || "";
      }
    } else if (internalJsonSchema) {
      // Single internal schema
      pipelineSteps = internalJsonSchema?.pipelineSteps || [];
      pipelineStatement = internalJsonSchema?.pipelineStatement || "";
    }

    // Validate that we have either pipeline steps or js logic
    const hasPipelineSteps = Array.isArray(internalJsonSchema) 
      ? internalJsonSchema.some(schema => schema.pipelineSteps?.length > 0)
      : pipelineSteps.length > 0;

    if (!hasPipelineSteps && !jsLogic) {
      return res.status(400).json({
        token: "400",
        response: "Either pipeline steps or JS logic is required",
      });
    }

    const correlationSchema = {
      _id: newObjectId,
      type: "Correlation Engine",
      correlationId: newObjectId.toHexString(),
      correlationName: correlationName,
      correlationDesc: correlationDesc,
      inputJsonSchema: inputJsonSchema,
      outputJsonSchema: outputJsonSchema,
      internalJsonSchema: internalJsonSchema, // Store as-is (could be array or object)
      pipelineSteps: pipelineSteps, // For backward compatibility
      pipelineStatement: pipelineStatement, // For backward compatibility
      jsLogic: jsLogic,
      createdOn: new Date(),
    };

    const result = await db
      .collection(collectionName)
      .insertOne(correlationSchema);

    if (result) {
      return res.json({ 
        token: "200", 
        correlation: {
          insertedId: result.insertedId,
          correlationId: newObjectId.toHexString(),
          correlationName: correlationName,
          internalSchemasCount: Array.isArray(internalJsonSchema) ? internalJsonSchema.length : 1
        }
      });
    } else {
      return res.status(404).json({ error: "correlation not found" });
    }
  } catch (err) {
    console.error("Error creating correlation:", err);
    return res.status(500).json({
      error: "Error creating correlation",
      details: err.message,
    });
  }
};


// Execute correlation by name or pipeline statement
const executeCorrelationByName = async (req, res, next) => {
  let correlationId = null;
  let correlationName = null;
  let instanceId = null;
  
  try {
    const { correlationName: reqCorrelationName, pipelineStatement, inputParameters } = req.body;
    
    const identifier = reqCorrelationName || pipelineStatement;
    if (!identifier) {
      return res.status(400).json({
        token: "400",
        response: "Either correlationName or pipelineStatement is required",
      });
    }

    // Get correlation template to extract correlationId and name
    const db = await connectToMongoDB();
    let template;
    
    if (ObjectId.isValid(identifier)) {
      template = await db
        .collection(process.env.FUNCTION_MODEL_COLLECTION)
        .findOne({ correlationId: identifier });
    } else {
      template = await db
        .collection(process.env.FUNCTION_MODEL_COLLECTION)
        .findOne({ 
          $or: [
            { pipelineStatement: identifier },
            { correlationName: identifier }
          ]
        });
    }

    if (template) {
      correlationId = template.correlationId;
      correlationName = template.correlationName || reqCorrelationName;
      
      // Create instance record with 'pending' status
      instanceId = await createCorrelationInstance(
        correlationId, 
        correlationName, 
        inputParameters || {}
      );
    }

    // Update instance status to initializing
    if (instanceId) {
      await updateCorrelationInstance(instanceId, 'initializing');
    }

    // Update instance status to executing
    if (instanceId) {
      await updateCorrelationInstance(instanceId, 'executing');
    }

    const result = await correlationTemplate(identifier, inputParameters || {});
    
    // Update instance status to finalizing
    if (instanceId) {
      await updateCorrelationInstance(instanceId, 'finalizing');
    }
    
    // Filter response to return only pipeline statement results
    const filteredResult = {};
    
    if (result && typeof result === 'object') {
      // Check for 'create entityId' pipeline statement result
      if (result['create entityId']) {
        filteredResult['create entityId'] = result['create entityId'];
      }
      
      // Check for 'create entity attributeSets' pipeline statement result  
      if (result['create entity attributeSets']) {
        filteredResult['create entity attributeSets'] = result['create entity attributeSets'];
      }
    }
    
    // Update instance with successful completion
    if (instanceId) {
      await updateCorrelationInstance(instanceId, 'completed', filteredResult);
    }
    
    return res.json({
      token: "200",
      response: "Correlation executed successfully",
      identifier: identifier,
      result: filteredResult,
      instanceId: instanceId,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Error executing correlation:", err);
    
    // Update instance with error if we have instanceId
    if (instanceId) {
      await updateCorrelationInstance(instanceId, 'error', null, err.message);
    }
    
    return res.status(500).json({
      token: "500",
      response: "Correlation execution failed",
      error: err.message,
      instanceId: instanceId,
      timestamp: new Date().toISOString()
    });
  }
};

// Enhanced correlation engine
const correlationEngine = async (req, res, next) => {
  try {
    const { identifier, inputJsonSchema, executionMode } = req.body;
    
    if (!identifier) {
      return res.status(400).json({
        token: "400",
        response: "Identifier (correlationId, pipelineStatement, or correlationName) is required",
      });
    }

    const ctx = await correlationTemplate(identifier, inputJsonSchema || {});
    
    return res.json({
      token: "200",
      response: "Correlation executed successfully",
      result: ctx,
      executionMode: executionMode || "pipeline",
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Error in correlation engine:", err);
    return res.status(500).json({
      token: "500",
      response: "Correlation execution failed",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Enhanced JS execution with template support
const correlationJs = async (req, res, next) => {
  const { jsCode, useTemplate, templateIdentifier, inputParameters } = req.body;

  if (typeof jsCode !== "string") {
    return res.status(400).json({ error: "Invalid code input" });
  }

  try {
    // Enhanced sandbox with correlationTemplate function
    const enhancedCorrelationTemplate = async (identifier, params = {}) => {
      return await correlationTemplate(identifier, params);
    };

    const sandboxGlobals = {
      console,
      Math,
      Date,
      setTimeout,
      correlationTemplate: enhancedCorrelationTemplate,
      math,
    };

    const sandbox = { 
      result: null, 
      ...sandboxGlobals 
    };
    const context = createContext(sandbox);

    // If using template, make input parameters available in context
    if (useTemplate && inputParameters) {
      Object.assign(sandbox, inputParameters);
    }

    const script = new Script(`
      result = (async () => {
        ${jsCode}
      })();
    `);

    script.runInContext(context);
    const output = await context.result;

    res.json({ 
      output,
      executionType: useTemplate ? "template-based" : "standalone",
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Error executing JS code:", err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Core correlation template execution
async function correlationTemplate(identifier, inputJsonSchema = {}) {
  try {
    const db = await connectToMongoDB();
    let template;

    // Check if identifier is a correlationId (ObjectId format) or pipeline statement
    if (ObjectId.isValid(identifier)) {
      template = await db
        .collection(process.env.FUNCTION_MODEL_COLLECTION)
        .findOne({ correlationId: identifier });
    } else {
      template = await db
        .collection(process.env.FUNCTION_MODEL_COLLECTION)
        .findOne({ 
          $or: [
            { pipelineStatement: identifier },
            { correlationName: identifier }
          ]
        });
    }

    if (!template) {
      throw new Error(`Correlation template not found for identifier: ${identifier}`);
    }

    // Map inputJsonSchema based on template's input schema for proper parameter mapping
    const mappedParams = mapInputParameters(inputJsonSchema, template.inputJsonSchema);
    

    let results = {};

    // Handle multiple internalJsonSchema (NEW LOGIC)
    if (Array.isArray(template.internalJsonSchema)) {
      
      for (let i = 0; i < template.internalJsonSchema.length; i++) {
        const internalSchema = template.internalJsonSchema[i];
        const pipelineSteps = internalSchema.pipelineSteps || [];
        const pipelineStatement = internalSchema.pipelineStatement || `pipeline_${i}`;
        
        
        if (pipelineSteps.length > 0) {
          const ctx = await correlationPipeline(pipelineSteps, mappedParams);
          results[`pipeline_${i + 1}`] = ctx;
          results[pipelineStatement] = ctx; // Also store with pipeline statement as key
          
          // For JS logic access, make the actual data available with a simplified key
          if (pipelineStatement) {
            const cleanKey = pipelineStatement.replace(/\s+/g, '').toLowerCase();
            results[cleanKey] = ctx;
          }
        } else {
          console.warn(`Internal schema ${i + 1} has no pipeline steps`);
        }
      }
      
      // If there's jsLogic, execute it with access to all pipeline results
      if (template.jsLogic) {
        try {
          const jsResult = await executeJsLogicWithResults(template.jsLogic, results, mappedParams);
          results.jsLogicResult = jsResult;
        } catch (jsError) {
          console.error('JS Logic execution failed:', jsError);
          throw new Error(`JS Logic execution failed: ${jsError.message}`);
        }
      }
      
    } else {
      // Handle single internalJsonSchema (EXISTING LOGIC for backward compatibility)
      let steps;
      
      if (template.internalJsonSchema?.pipelineSteps && template.internalJsonSchema.pipelineSteps.length > 0) {
        steps = template.internalJsonSchema.pipelineSteps;
      } else if (template.pipelineSteps && template.pipelineSteps.length > 0) {
        steps = template.pipelineSteps;
      } else if (template.jsLogic) {
        steps = template.jsLogic;
      } else {
        throw new Error("No execution logic found in template");
      }

      const ctx = await correlationPipeline(steps, mappedParams);
      results = ctx;
    }

    return results;
    
  } catch (err) {
    throw new Error(`Correlation execution failed: ${err.message}`);
  }
}

// New function to map input parameters based on template schema
function mapInputParameters(inputParams, templateSchema) {
  const mappedParams = { ...inputParams };
  
  // If template has inputJsonSchema with properties, create a parameter mapping
  if (templateSchema && templateSchema.properties) {
    const parameterNames = templateSchema.properties.map(prop => prop.name);
    
    // For backward compatibility, if we receive parameters that don't match template schema
    // but the template uses hardcoded parameter names, we need to handle this
    parameterNames.forEach(expectedParam => {
      if (!mappedParams.hasOwnProperty(expectedParam)) {
        // Check if any of the provided parameters should map to this expected parameter
        // This handles the case where template expects 'ip1' but we receive 'op1'
        const providedKeys = Object.keys(inputParams);
        if (providedKeys.length === 1 && parameterNames.length >= 1) {
          // Simple case: one parameter provided, map it to the first expected parameter
          mappedParams[expectedParam] = inputParams[providedKeys[0]];
        }
      }
    });
  }
  
  return mappedParams;
}

// Main correlation pipeline executor
async function correlationPipeline(steps, params = {}) {
  const db = await connectToMongoDB();
  const ctx = {};
  const ctxId = {};
  const ctxDisplayComp = [];
  const ctxDisplayCompMap = {};


  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    const actualStep = step.logic || step;
    const outputKey = actualStep.output || actualStep.id || step.id;

    try {
      switch (actualStep.function) {
        case "findOne": {
          const coll = db.collection(actualStep.collection);
          const filter = resolveTemplate(actualStep.filter, ctx, params);
          const projection = actualStep.projection || {};
          
          const doc = await coll.findOne(filter, { projection });

          // Add validation for critical entities
          if (!doc && actualStep.required !== false) {
            console.warn(`FindOne - No document found with filter:`, filter);
            console.warn(`FindOne - This may cause downstream failures`);
          }

          ctx[outputKey] = doc;
          ctxId[outputKey] = {
            collection: actualStep.collection,
            ids: doc?._id ?? null,
          };
          break;
        }

        case "find": {
          const coll = db.collection(actualStep.collection);
          const filter = resolveTemplate(actualStep.filter || {}, ctx, params);
          const projection = actualStep.projection || {};
          const sort = resolveTemplate(actualStep.sort || {}, ctx, params);
          const limit = actualStep.limit || 0;

          const cursor = coll.find(filter).project(projection).sort(sort);
          if (limit > 0) cursor.limit(limit);
          const docs = await cursor.toArray();

          ctx[outputKey] = docs;
          ctxId[outputKey] = {
            collection: actualStep.collection,
            ids: docs.map((doc) => doc?._id ?? null),
          };
          break;
        }

        case "aggregate": {
          const coll = db.collection(actualStep.collection);
          const pipeline = resolveTemplate(actualStep.pipeline || [], ctx, params);
          
          
          // Validate pipeline for $in operators
          const validatePipeline = (stages) => {
            for (let i = 0; i < stages.length; i++) {
              const stage = stages[i];
              if (stage.$match) {
                for (const [field, condition] of Object.entries(stage.$match)) {
                  if (condition && condition.$in) {
                    if (!Array.isArray(condition.$in)) {
                      console.error(`Pipeline stage ${i}: $in operator for field ${field} is not an array:`, condition.$in);
                      throw new Error(`$in operator for field ${field} requires an array, got: ${typeof condition.$in}`);
                    }
                    if (condition.$in.length === 0) {
                      console.warn(`Pipeline stage ${i}: $in operator for field ${field} has empty array`);
                    }
                  }
                }
              }
            }
          };

          validatePipeline(pipeline);
          
          const docs = await coll.aggregate(pipeline).toArray();

          ctx[outputKey] = docs;
          ctxId[outputKey] = {
            collection: actualStep.collection,
            ids: docs.map((doc) => doc?._id ?? null),
          };
          break;
        }

        case "lookup": {
          const from = db.collection(actualStep.from);
          const localVal = resolveTemplate(actualStep.localField, ctx, params);
          const pipelineFilter = resolveTemplate(
            actualStep.pipelineFilter || {},
            ctx,
            params
          );
          const project = actualStep.projection || {};


          const matchStage = Array.isArray(localVal)
            ? { [actualStep.foreignField]: { $in: localVal }, ...pipelineFilter }
            : { [actualStep.foreignField]: localVal, ...pipelineFilter };

          const pipeline = [{ $match: matchStage }, { $project: project }];
          const docs = await from.aggregate(pipeline).toArray();

          ctx[outputKey] = docs;
          ctxId[outputKey] = {
            collection: actualStep.from,
            ids: docs.map((doc) => doc?._id ?? null),
          };
          break;
        }

        case "count": {
          const coll = db.collection(actualStep.collection);
          const filter = resolveTemplate(actualStep.filter || {}, ctx, params);
          const count = await coll.countDocuments(filter);

          ctx[outputKey] = count;
          ctxId[outputKey] = {
            collection: actualStep.collection,
            ids: null,
          };
          break;
        }

        case "sum": {
          const coll = db.collection(actualStep.collection);
          const filter = resolveTemplate(actualStep.filter || {}, ctx, params);
          const field = actualStep.field;
          const pipeline = [
            { $match: filter },
            { $group: { _id: null, total: { $sum: `$${field}` } } },
          ];
          const res = await coll.aggregate(pipeline).toArray();
          const total = res[0]?.total ?? 0;

          ctx[outputKey] = total;
          ctxId[outputKey] = {
            collection: actualStep.collection,
            ids: null,
          };
          break;
        }

        case "joinAttributes": {
          const getValue = (ref) => {
            if (typeof ref === "string" && ref.startsWith("$")) {
              const key = ref.slice(1);
              return ctx[key] ?? params[key];
            }
            return resolveTemplate(ref, ctx, params);
          };

          const left = getValue(actualStep.left);
          const right = getValue(actualStep.right);
          const localField = actualStep.localField;
          const foreignField = actualStep.foreignField;
          const mergeFields = actualStep.mergeFields || [];
          const filter = actualStep.filter || {};
          const projection = actualStep.projection || null;

          if (!Array.isArray(left)) throw new Error(`Expected left to be array`);
          if (!Array.isArray(right)) throw new Error(`Expected right to be array`);

          let enriched = left.map((item) => {
            const match = right.find((r) => r[foreignField] === item[localField]);
            if (!match) return item;

            const additions = {};
            for (const field of mergeFields) {
              additions[field] = match[field];
            }
            return { ...item, ...additions };
          });

          if (Object.keys(filter).length > 0) {
            enriched = enriched.filter((item) => {
              return Object.entries(filter).every(([key, val]) => {
                if (Array.isArray(val)) {
                  return val.includes(item[key]);
                }
                return item[key] === val;
              });
            });
          }

          if (projection && Object.keys(projection).length > 0) {
            enriched = enriched.map((item) => {
              const projected = {};
              for (const [key, include] of Object.entries(projection)) {
                if (include && key in item) projected[key] = item[key];
              }
              return projected;
            });
          }

          ctx[outputKey] = enriched;
          ctxId[outputKey] = {
            collection: "joined",
            ids: enriched.map((item) => item?._id ?? null),
          };
          break;
        }

        default:
          throw new Error(`Unsupported function: ${actualStep.function}`);
      }

      
    } catch (error) {
      console.error(`Error in step ${stepIndex + 1}:`, error);
      throw new Error(`Step ${stepIndex + 1} (${actualStep.function}): ${error.message}`);
    }
  }

  
  return { ctx, ctxId, ctxDisplayCompMap, ctxDisplayComp };
}

// Enhanced template value resolver with better parameter handling
function resolveTemplate(value, ctx, params) {
  if (typeof value === "string") {
    // Handle $params.paramName syntax
    const paramsMatch = /^\$params\.(.+)$/.test(value);
    if (paramsMatch) {
      const paramName = value.replace(/^\$params\./, '');
      const resolvedValue = params[paramName];
      return resolvedValue;
    }

    // Handle $contextKey.field syntax
    const contextMatch = /^\$([a-zA-Z_][\w]*)\.(.+)$/.test(value);
    if (contextMatch) {
      const path = value.slice(1).split(".");
      let source = ctx[path[0]];
      
      for (let i = 1; i < path.length; i++) {
        if (source == null) {
          console.warn(`Path resolution failed at ${path.slice(0, i + 1).join('.')}: source is null/undefined`);
          return undefined;
        }

        if (Array.isArray(source)) {
          const field = path[i];
          if (source.length === 0) {
            console.warn(`Array is empty when accessing field ${field}`);
            return [];
          }
          const result = source.map((item) => item?.[field]).filter(val => val != null);
          return result.length > 0 ? result : [];
        }

        source = source[path[i]];
      }
      
      return source;
    }

    // Handle direct parameter reference (backward compatibility)
    // This handles the case where filter has "entityName": "ip1" and params has {ip1: "PUMP"}
    if (params.hasOwnProperty(value)) {
      return params[value];
    }

    // Return as literal string if no parameter match
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => resolveTemplate(v, ctx, params));
  }

  if (value && typeof value === "object") {
    if ("$dynamicKey" in value && "$value" in value) {
      const dynamicKey = resolveTemplate(value["$dynamicKey"], ctx, params);
      const dynamicValue = resolveTemplate(value["$value"], ctx, params);
      return { [dynamicKey]: dynamicValue };
    }

    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const resolvedValue = resolveTemplate(v, ctx, params);
      
      // Enhanced handling for MongoDB $in operator
      if (k === "$in") {
        if (resolvedValue === undefined || resolvedValue === null) {
          console.warn(`$in operator received null/undefined value, using empty array`);
          out[k] = [];
        } else if (!Array.isArray(resolvedValue)) {
          console.warn(`$in operator requires array, got:`, typeof resolvedValue, resolvedValue);
          out[k] = resolvedValue != null ? [resolvedValue] : [];
        } else {
          out[k] = resolvedValue;
        }
      } else {
        out[k] = resolvedValue;
      }
    }
    return out;
  }

  return value;
}

// Preview correlation stages
const previewCorrelationStages = async (req, res, next) => {
  try {
    const { inputJsonSchema, stages, executeAll = false, stageIndex = null } = req.body;

    if (!stages || !Array.isArray(stages)) {
      return res.status(400).json({
        token: "400",
        response: "Stages array is required",
        error: "stages must be provided as an array"
      });
    }

    if (!executeAll && stageIndex === null) {
      return res.status(400).json({
        token: "400",
        response: "Stage index is required when executeAll is false",
        error: "Provide stageIndex to execute specific stage or set executeAll to true"
      });
    }

    let result;
    let executionInfo;

    if (executeAll) {
      result = await correlationPipeline(stages, inputJsonSchema || {});
      executionInfo = {
        executedStages: stages.length,
        stagesExecuted: stages.map((stage, index) => ({
          index,
          id: stage.id || stage.output || `stage_${index}`,
          function: stage.function
        }))
      };
    } else {
      if (stageIndex < 0 || stageIndex >= stages.length) {
        return res.status(400).json({
          token: "400",
          response: "Invalid stage index",
          error: `Stage index must be between 0 and ${stages.length - 1}`
        });
      }

      result = await executeSingleStage(stages, stageIndex, inputJsonSchema || {});
      executionInfo = {
        executedStages: 1,
        stageExecuted: {
          index: stageIndex,
          id: stages[stageIndex].id || stages[stageIndex].output || `stage_${stageIndex}`,
          function: stages[stageIndex].function
        }
      };
    }

    return res.json({
      token: "200",
      response: "Correlation stages executed successfully",
      result: result,
      executionInfo: executionInfo,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("Error in preview correlation stages:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to execute correlation stages",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Execute single stage helper
const executeSingleStage = async (stages, targetIndex, params = {}) => {
  const db = await connectToMongoDB();
  const ctx = {};
  const ctxId = {};
  const ctxDisplayComp = [];
  const ctxDisplayCompMap = {};

  for (let i = 0; i <= targetIndex; i++) {
    const step = stages[i];
    const actualStep = step.logic || step;
    const outputKey = actualStep.output || actualStep.id || step.id || `stage_${i}`;

    switch (actualStep.function) {
      case "findOne": {
        const coll = db.collection(actualStep.collection);
        const filter = resolveTemplate(actualStep.filter, ctx, params);
        const projection = actualStep.projection || {};
        const doc = await coll.findOne(filter, { projection });

        ctx[outputKey] = doc;
        ctxId[outputKey] = {
          collection: actualStep.collection,
          ids: doc?._id ?? null,
        };
        break;
      }

      case "find": {
        const coll = db.collection(actualStep.collection);
        const filter = resolveTemplate(actualStep.filter || {}, ctx, params);
        const projection = actualStep.projection || {};
        const sort = resolveTemplate(actualStep.sort || {}, ctx, params);
        const limit = actualStep.limit || 0;

        const cursor = coll.find(filter).project(projection).sort(sort);
        if (limit > 0) cursor.limit(limit);
        const docs = await cursor.toArray();

        ctx[outputKey] = docs;
        ctxId[outputKey] = {
          collection: actualStep.collection,
          ids: docs.map((doc) => doc?._id ?? null),
        };
        break;
      }

      case "aggregate": {
        const coll = db.collection(actualStep.collection);
        const pipeline = resolveTemplate(actualStep.pipeline || [], ctx, params);
        const docs = await coll.aggregate(pipeline).toArray();

        ctx[outputKey] = docs;
        ctxId[outputKey] = {
          collection: actualStep.collection,
          ids: docs.map((doc) => doc?._id ?? null),
        };
        break;
      }

      case "lookup": {
        const from = db.collection(actualStep.from);
        const localVal = resolveTemplate(actualStep.localField, ctx, params);
        const pipelineFilter = resolveTemplate(
          actualStep.pipelineFilter || {},
          ctx,
          params
        );
        const project = actualStep.projection || {};

        const matchStage = Array.isArray(localVal)
          ? { [actualStep.foreignField]: { $in: localVal }, ...pipelineFilter }
          : { [actualStep.foreignField]: localVal, ...pipelineFilter };

        const pipeline = [{ $match: matchStage }, { $project: project }];
        const docs = await from.aggregate(pipeline).toArray();

        ctx[outputKey] = docs;
        ctxId[outputKey] = {
          collection: actualStep.from,
          ids: docs.map((doc) => doc?._id ?? null),
        };
        break;
      }

      default:
        throw new Error(`Unsupported function: ${actualStep.function}`);
    }
  }

  return { ctx, ctxId, ctxDisplayCompMap, ctxDisplayComp };
};

// Get stage information
const getStageInfo = async (req, res, next) => {
  try {
    const { stages } = req.body;

    if (!stages || !Array.isArray(stages)) {
      return res.status(400).json({
        token: "400",
        response: "Stages array is required",
        error: "stages must be provided as an array"
      });
    }

    const stageInfo = stages.map((stage, index) => {
      const actualStep = stage.logic || stage;
      return {
        index: index,
        id: actualStep.id || actualStep.output || stage.id || `stage_${index}`,
        function: actualStep.function,
        collection: actualStep.collection || actualStep.from || 'N/A',
        output: actualStep.output || actualStep.id || stage.id || `stage_${index}`,
        dependencies: extractDependencies(stage)
      };
    });

    return res.json({
      token: "200",
      response: "Stage information retrieved successfully",
      totalStages: stages.length,
      stages: stageInfo,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("Error getting stage info:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to get stage information",
      error: err.message
    });
  }
};

// Extract dependencies from a stage
const extractDependencies = (stage) => {
  const dependencies = [];
  const actualStep = stage.logic || stage;
  
  const findDependencies = (obj) => {
    if (typeof obj === 'string' && obj.startsWith('$')) {
      const parts = obj.slice(1).split('.');
      if (parts[0] !== 'params') {
        dependencies.push(parts[0]);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(findDependencies);
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(findDependencies);
    }
  };

  const fieldsToCheck = ['filter', 'pipeline', 'localField', 'startWith', 'left', 'right'];
  fieldsToCheck.forEach(field => {
    if (actualStep[field]) {
      findDependencies(actualStep[field]);
    }
  });

  return [...new Set(dependencies)];
};

// Validate correlation template
const validateCorrelationTemplate = async (req, res, next) => {
  try {
    const { internalJsonSchema, jsLogic, inputJsonSchema } = req.body;
    
    let validationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Handle both single and multiple internal schemas
    const schemasToValidate = Array.isArray(internalJsonSchema) ? internalJsonSchema : [internalJsonSchema];

    schemasToValidate.forEach((schema, schemaIndex) => {
      if (schema?.pipelineSteps) {
        const steps = schema.pipelineSteps;
        
        steps.forEach((step, stepIndex) => {
          const logic = step.logic || step;
          const stepLabel = `Schema ${schemaIndex + 1}, Step ${stepIndex + 1}`;
          
          if (!logic.function) {
            validationResult.errors.push(`${stepLabel}: Missing function`);
          }
          
          if (!logic.output && !logic.id) {
            validationResult.warnings.push(`${stepLabel}: No output key specified`);
          }
          
          switch (logic.function) {
            case 'findOne':
            case 'find':
            case 'aggregate':
              if (!logic.collection) {
                validationResult.errors.push(`${stepLabel}: Missing collection for ${logic.function}`);
              }
              break;
            case 'lookup':
              if (!logic.from || !logic.localField || !logic.foreignField) {
                validationResult.errors.push(`${stepLabel}: Missing required fields for lookup`);
              }
              break;
          }
        });
      }
    });

    if (jsLogic) {
      try {
        const sandboxGlobals = {
          console,
          Math,
          Date,
          setTimeout,
          correlationTemplate,
          math,
        };
        const sandbox = { result: null, ...sandboxGlobals };
        const context = createContext(sandbox);
        const script = new Script(`
          result = (async () => {
            ${jsLogic}
            return { test: "validation" };
          })();
        `);
        script.runInContext(context);
        await context.result;
      } catch (err) {
        validationResult.errors.push(`JS Logic validation error: ${err.message}`);
      }
    }

    validationResult.isValid = validationResult.errors.length === 0;

    return res.json({
      token: "200",
      response: "Template validation completed",
      validation: {
        ...validationResult,
        internalSchemasCount: schemasToValidate.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("Error validating template:", err);
    return res.status(500).json({
      token: "500",
      response: "Template validation failed",
      error: err.message
    });
  }
};


// Get correlation list
const get_correlation_list = async function (req, res, next) {
  try {
    let filters = {};
    const appId = req.body.appId;
    const orgId = req.body.orgId;

    filters = {
      ...(appId && { appId: appId }),
      ...(orgId && { orgId: orgId }),
      type: "Correlation Engine",
    };

    const db = await connectToMongoDB();
    const collectionName = process.env.FUNCTION_MODEL_COLLECTION;
    const correlationList = await db.collection(collectionName).find(filters).toArray();
    return res.status(200).json({ correlationList });

  } catch (err) {
    console.error("Error while fetching correlation list:", err);
    return res.status(500).json({ error: 'Error while fetching correlation list' });
  }
}

async function executeJsLogicWithResults(jsLogic, pipelineResults, params) {
  try {
    // Enhanced sandbox with correlationTemplate function and pipeline results
    const enhancedCorrelationTemplate = async (identifier, inputParams = {}) => {
      // First check if this identifier exists in current pipeline results
      if (pipelineResults[identifier]) {
        return pipelineResults[identifier];
      }
      
      // If not found locally, try to find it in the database
      return await correlationTemplate(identifier, inputParams);
    };

    const sandboxGlobals = {
      console,
      Math,
      Date,
      setTimeout,
      correlationTemplate: enhancedCorrelationTemplate,
      math,
      // Make pipeline results available in JS context
      ...pipelineResults,
      // Make input parameters available
      ...params
    };

    const sandbox = { 
      result: null, 
      ...sandboxGlobals 
    };
    const context = createContext(sandbox);


    const script = new Script(`
      result = (async () => {
        ${jsLogic}
      })();
    `);

    script.runInContext(context);
    const output = await context.result;
    
    return output;
    
  } catch (err) {
    console.error("Error executing JS logic:", err);
    throw new Error(`JS Logic execution failed: ${err.message}`);
  }
}

// Function to create initial correlation instance with template fields
async function createCorrelationInstance(correlationId, correlationName, inputParameters) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.FUNCTION_MODEL_INSTANCE; // Use unified collection
    const newInstanceId = new ObjectId();
    
    // Get the correlation template to include all fields in the instance
    const template = await db
      .collection(process.env.FUNCTION_MODEL_COLLECTION)
      .findOne({ correlationId: correlationId });

    const instanceRecord = {
      _id: newInstanceId,
      instanceId: newInstanceId.toHexString(),
      
      // Type for differentiation in unified collection
      type: "Correlation Engine",
      
      // Core execution data
      correlationId: correlationId,
      correlationName: correlationName || template?.correlationName || `Correlation Instance ${newInstanceId.toHexString().slice(-8)}`,
      inputParameters: inputParameters || {},
      
      // Template fields (from Function Model) - copy selected template fields (type already set above)
      correlationDesc: template?.correlationDesc || "Auto-generated correlation instance",
      inputJsonSchema: template?.inputJsonSchema || {},
      outputJsonSchema: template?.outputJsonSchema || {},
      internalJsonSchema: template?.internalJsonSchema || [],
      jsLogic: template?.jsLogic || "",
      
      // Execution status and results
      status: 'pending', // Start with pending status
      result: null,
      errorMessage: null,
      
      // Enhanced status history (Activity Engine style)
      statusHistory: [
        {
          status: 'pending',
          startTime: new Date(),
          message: 'Correlation instance created and queued for execution'
        }
      ],
      
      // Heartbeat system (similar to Activity Engine)
      instanceHeartBeat: new Date(),
      heartbeatActive: true,
      
      // Timestamps
      startedAt: new Date(),
      createdAt: new Date(),
      createdOn: new Date(),
      lastUpdatedAt: new Date()
    };

    const insertResult = await db
      .collection(collectionName)
      .insertOne(instanceRecord);

    const instanceId = insertResult.insertedId;
    
    // Start instance heartbeat
    startCorrelationInstanceHeartbeat(instanceId);

    console.log(`Correlation instance created: ${instanceId} with status: pending`);
    return instanceId;
    
  } catch (err) {
    console.error("Error creating correlation instance:", err);
    // Don't throw error to avoid breaking the main execution
    return null;
  }
}

// Function to update correlation instance status
async function updateCorrelationInstance(instanceId, status, result = null, errorMessage = null) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.FUNCTION_MODEL_INSTANCE; // Use unified collection
    
    const updateData = {
      status: status,
      lastUpdatedAt: new Date()
    };

    // Create status history entry (Activity Engine style)
    const statusHistoryEntry = {
      status: status,
      startTime: new Date(),
      message: ''
    };

    // Set end time for previous status history entry
    const currentInstance = await db
      .collection(collectionName)
      .findOne({ _id: new ObjectId(instanceId) });

    if (currentInstance && currentInstance.statusHistory && currentInstance.statusHistory.length > 0) {
      const lastIndex = currentInstance.statusHistory.length - 1;
      await db
        .collection(collectionName)
        .updateOne(
          { _id: new ObjectId(instanceId) },
          { $set: { [`statusHistory.${lastIndex}.endTime`]: new Date() } }
        );
    }

    if (status === 'completed') {
      updateData.result = result;
      updateData.completedAt = new Date();
      updateData.heartbeatActive = false;
      updateData.heartbeatStoppedAt = new Date();
      
      statusHistoryEntry.message = 'Correlation execution completed successfully';
      statusHistoryEntry.endTime = new Date();
      
      // Stop heartbeat
      stopCorrelationInstanceHeartbeat(instanceId);
      
    } else if (status === 'error') {
      updateData.errorMessage = errorMessage;
      updateData.failedAt = new Date();
      updateData.heartbeatActive = false;
      updateData.heartbeatStoppedAt = new Date();
      
      statusHistoryEntry.message = `Correlation execution failed: ${errorMessage}`;
      statusHistoryEntry.error = errorMessage;
      statusHistoryEntry.endTime = new Date();
      
      // Stop heartbeat
      stopCorrelationInstanceHeartbeat(instanceId);
      
    } else if (status === 'initializing') {
      statusHistoryEntry.message = 'Initializing correlation engine and loading templates';
    } else if (status === 'executing') {
      statusHistoryEntry.message = 'Executing correlation pipeline and processing data';
    } else if (status === 'finalizing') {
      statusHistoryEntry.message = 'Finalizing correlation results and preparing output';
    }

    const updateResult = await db
      .collection(collectionName)
      .updateOne(
        { _id: new ObjectId(instanceId) },
        {
          $set: updateData,
          $push: { 
            statusHistory: statusHistoryEntry
          }
        }
      );

    if (updateResult.matchedCount > 0) {
      console.log(`Correlation instance updated: ${instanceId} -> ${status}`);
    } else {
      console.warn(`Correlation instance not found for update: ${instanceId}`);
    }
    
  } catch (err) {
    console.error("Error updating correlation instance:", err);
    // Don't throw error to avoid breaking the main execution
  }
}

// Correlation instance heartbeat function (similar to Activity Engine)
const startCorrelationInstanceHeartbeat = (instanceId) => {
  if (correlationInstanceHeartbeats.has(instanceId)) {
    console.log(`[Correlation Instance Heartbeat] Already active for ${instanceId}`);
    return;
  }

  const intervalId = setInterval(async () => {
    try {
      const db = await connectToMongoDB();
      const result = await db
        .collection(process.env.FUNCTION_MODEL_INSTANCE)
        .updateOne(
          { _id: new ObjectId(instanceId), heartbeatActive: true },
          { $set: { instanceHeartBeat: new Date() } }
        );

      if (result.matchedCount === 0) {
        console.log(
          `[Correlation Instance Heartbeat] Instance ${instanceId} not found or inactive - stopping`
        );
        stopCorrelationInstanceHeartbeat(instanceId);
        return;
      }

      console.log(`[Correlation Instance Heartbeat] Updated for ${instanceId}`);
    } catch (err) {
      console.error(`[Correlation Instance Heartbeat] Failed for ${instanceId}:`, err);
    }
  }, 10000); // Update every 10 seconds

  correlationInstanceHeartbeats.set(instanceId, intervalId);
  console.log(`[Correlation Instance Heartbeat] Started for ${instanceId}`);
};

// Stop correlation instance heartbeat
const stopCorrelationInstanceHeartbeat = (instanceId) => {
  const intervalId = correlationInstanceHeartbeats.get(instanceId);
  if (intervalId) {
    clearInterval(intervalId);
    correlationInstanceHeartbeats.delete(instanceId);

    connectToMongoDB().then((db) => {
      db.collection(process.env.FUNCTION_MODEL_INSTANCE)
        .updateOne(
          { _id: new ObjectId(instanceId) },
          {
            $set: {
              heartbeatActive: false,
              heartbeatStoppedAt: new Date(),
            },
          }
        )
        .catch((err) =>
          console.error(
            `Failed to deactivate correlation instance heartbeat for ${instanceId}:`,
            err
          )
        );
    });

    console.log(`[Correlation Instance Heartbeat] Stopped for ${instanceId}`);
  }
};

// Enhanced function to get detailed correlation instance status
const getCorrelationInstanceStatus = async (instanceId) => {
  const db = await connectToMongoDB();
  const instanceCollection = db.collection(process.env.FUNCTION_MODEL_INSTANCE);

  const instance = await instanceCollection.findOne({ 
    _id: new ObjectId(instanceId),
    type: "Correlation Engine" 
  });

  if (!instance) {
    throw new Error(`Correlation instance not found: ${instanceId}`);
  }

  const now = new Date();
  const staleThreshold = 30000; // 30 seconds

  const isInstanceStale = instance.instanceHeartBeat
    ? now.getTime() - instance.instanceHeartBeat.getTime() > staleThreshold
    : true;

  return {
    instanceId: instance.instanceId,
    correlationId: instance.correlationId,
    correlationName: instance.correlationName,
    status: instance.status,
    inputParameters: instance.inputParameters,
    result: instance.result,
    errorMessage: instance.errorMessage,
    
    // Template fields
    type: instance.type,
    correlationDesc: instance.correlationDesc,
    inputJsonSchema: instance.inputJsonSchema,
    outputJsonSchema: instance.outputJsonSchema,
    internalJsonSchema: instance.internalJsonSchema,
    jsLogic: instance.jsLogic,
    
    // Health monitoring
    instanceHeartBeat: instance.instanceHeartBeat,
    heartbeatActive: instance.heartbeatActive,
    isInstanceStale: isInstanceStale,
    timeSinceLastHeartbeat: instance.instanceHeartBeat
      ? now.getTime() - instance.instanceHeartBeat.getTime()
      : null,
    statusHistory: instance.statusHistory || [],
    startedAt: instance.startedAt,
    completedAt: instance.completedAt,
    failedAt: instance.failedAt,
    createdAt: instance.createdAt,
    lastUpdatedAt: instance.lastUpdatedAt
  };
};

// Get all correlation instances summary
const getAllCorrelationInstancesSummary = async () => {
  const db = await connectToMongoDB();
  const instanceCollection = db.collection(process.env.FUNCTION_MODEL_INSTANCE);

  const instances = await instanceCollection.find({ type: "Correlation Engine" }).toArray();
  const now = new Date();
  const staleThreshold = 30000; // 30 seconds

  const summary = instances.map(instance => {
    const isInstanceStale = instance.instanceHeartBeat
      ? now.getTime() - instance.instanceHeartBeat.getTime() > staleThreshold
      : true;

    return {
      instanceId: instance.instanceId,
      correlationId: instance.correlationId,
      correlationName: instance.correlationName,
      status: instance.status,
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      failedAt: instance.failedAt,
      instanceHeartBeat: instance.instanceHeartBeat,
      heartbeatActive: instance.heartbeatActive,
      isInstanceStale: isInstanceStale,
      statusHistoryCount: instance.statusHistory?.length || 0,
      hasResult: !!instance.result,
      hasError: !!instance.errorMessage,
      inputParametersCount: Object.keys(instance.inputParameters || {}).length
    };
  });

  return summary;
};

// Check heartbeat health of all active correlation instances
const checkCorrelationHeartbeatHealth = async () => {
  const db = await connectToMongoDB();
  const instanceCollection = db.collection(process.env.FUNCTION_MODEL_INSTANCE);

  const now = new Date();
  const staleThreshold = 30000; // 30 seconds
  const staleTime = new Date(now.getTime() - staleThreshold);

  const staleInstances = await instanceCollection
    .find({
      type: "Correlation Engine",
      status: { $in: ["pending", "initializing", "executing", "finalizing"] },
      instanceHeartBeat: { $lt: staleTime },
    })
    .toArray();

  console.log(
    `[Correlation Health Check] Found ${staleInstances.length} stale instances`
  );

  // Mark stale instances as failed
  for (const instance of staleInstances) {
    await updateCorrelationInstance(
      instance._id, 
      'error', 
      null, 
      'Instance appeared to crash - heartbeat went stale'
    );
  }

  return {
    staleInstances: staleInstances.length,
    timestamp: new Date(),
  };
};

// Graceful shutdown - stop all correlation heartbeats
const gracefulCorrelationShutdown = () => {
  console.log("[Correlation Shutdown] Stopping all heartbeats...");

  for (const [instanceId, intervalId] of correlationInstanceHeartbeats) {
    clearInterval(intervalId);
    console.log(`[Correlation Shutdown] Stopped heartbeat for instance ${instanceId}`);
  }
  correlationInstanceHeartbeats.clear();

  console.log("[Correlation Shutdown] All heartbeats stopped");
};

// Get correlation instances
const getCorrelationInstances = async (req, res, next) => {
  try {
    const { correlationId, correlationName, status, limit = 50, skip = 0 } = req.body;
    
    const db = await connectToMongoDB();
    const collectionName = process.env.FUNCTION_MODEL_INSTANCE;
    
    // Build filter - only get Correlation Engine instances
    let filter = { type: "Correlation Engine" };
    if (correlationId) filter.correlationId = correlationId;
    if (correlationName) filter.correlationName = correlationName;
    if (status) filter.status = status;
    
    // Get instances with pagination
    const instances = await db
      .collection(collectionName)
      .find(filter)
      .sort({ executedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();
      
    // Get total count for pagination
    const totalCount = await db
      .collection(collectionName)
      .countDocuments(filter);
    
    return res.json({
      token: "200",
      response: "Correlation instances retrieved successfully",
      instances: instances,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: (parseInt(skip) + parseInt(limit)) < totalCount
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Error getting correlation instances:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to get correlation instances",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};


export default {
  post_correlation,
  executeCorrelationByName,
  correlationEngine,
  correlationJs,
  correlationTemplate,
  previewCorrelationStages,
  getStageInfo,
  executeSingleStage,
  validateCorrelationTemplate,
  get_correlation_list,
  getCorrelationInstances,
  // Enhanced correlation instance monitoring functions
  getCorrelationInstanceStatus,
  getAllCorrelationInstancesSummary,
  checkCorrelationHeartbeatHealth,
  gracefulCorrelationShutdown
};