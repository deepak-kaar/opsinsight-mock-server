import { connectToMongoDB } from "../../../config/connection.js";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
import { createContext, Script } from "vm";

dotenv.config();

const get_activityFM = async function (req, res, next) {
  try {
    let filters = {};
    const appId = req.body.appId;
    const orgId = req.body.orgId;

    filters = {
      ...(appId && { appId: appId }),
      ...(orgId && { orgId: orgId }),
    };
    const db = await connectToMongoDB();
    const collectionName = process.env.ACTIVITY_FM;

    const activityFMs = await db
      .collection(collectionName)
      .find(filters)
      .toArray();

    if (activityFMs.length > 0) {
      return res.json({
        token: "200",
        count: activityFMs.length,
        activityFMs: activityFMs,
      });
    } else {
      return res.status(404).json({
        token: "404",
        message: "No activity function models found",
      });
    }
  } catch (err) {
    console.error("Error fetching activity FMs from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching activity FMs from MongoDB",
      details: err.message,
    });
  }
};

const get_activityFMById = async function (req, res, next) {
  try {
    const activityFMId = req.params.id;
    if (!activityFMId) {
      return res.status(422).json({
        token: "422",
        message: "Activity FM ID is required",
      });
    }
    const db = await connectToMongoDB();
    const collectionName = process.env.ACTIVITY_FM;

    const activityFM = await db
      .collection(collectionName)
      .findOne({ functionId: activityFMId });

    if (activityFM) {
      return res.json({
        token: "200",
        activityFM: activityFM,
      });
    } else {
      return res.status(404).json({
        token: "404",
        message: "No activity function model found",
      });
    }
  } catch (err) {
    console.error("Error fetching activity FMs from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching activity FMs from MongoDB",
      details: err.message,
    });
  }
};

const post_activityFM = async function (req, res, next) {
  try {
    const {
      functionName,
      functionDesc,
      functionType,
      internalJson,
      inputJsonSchema,
      outputJsonSchema,
      jsCode,
      appId,
      orgId
    } = req.body;
    const db = await connectToMongoDB();
    const collectionName = process.env.ACTIVITY_FM;

    const newObjectId = new ObjectId();

    const existingName = await db
      .collection(collectionName)
      .findOne({ functionName: functionName });

    if (existingName) {
      return res.status(400).json({
        token: "400",
        response: "Name with the provided function name already exists",
      });
    }

    const activityFmSchema = {
      _id: newObjectId,
      functionId: newObjectId.toHexString(),
      functionName: functionName,
      functionDesc: functionDesc,
      functionType: functionType,
      internalJson: internalJson,
      inputJsonSchema: inputJsonSchema,
      outputJsonSchema: outputJsonSchema,
      appId: appId,
      orgId: orgId,
      jsCode: jsCode,
      createdOn: new Date(),
    };

    const result = await db
      .collection(collectionName)
      .insertOne(activityFmSchema);

    if (result) {
      return res.json({ token: "200", activityFm: result });
    } else {
      return res.status(404).json({ error: "activityFM not found" });
    }
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};

const execute_activityFM = async function (req, res, next) {
  try {
    const { functionName, inputParameters } = req.body;
    const db = await connectToMongoDB();
    const collectionName = process.env.ACTIVITY_FM;

    // Parse and validate inputParameters
    let parsedParams;
    if (typeof inputParameters === "string") {
      try {
        parsedParams = JSON.parse(inputParameters);
      } catch (e) {
        return res
          .status(400)
          .json({ error: "Invalid inputParameters JSON string" });
      }
    } else if (
      typeof inputParameters === "object" &&
      inputParameters !== null
    ) {
      parsedParams = inputParameters;
    } else {
      return res.status(400).json({
        error: "inputParameters must be an object or valid JSON string",
      });
    }

    // Fetch function model from DB
    const funcDoc = await db
      .collection(collectionName)
      .findOne({ functionName });

    if (!funcDoc) {
      return res
        .status(404)
        .json({ error: `Function '${functionName}' not found` });
    }

    const {
      inputJsonSchema = {},
      outputJsonSchema = {},
      internalJson = {},
      jsCode,
    } = funcDoc;

    const requiredInputs = inputJsonSchema.inputParameters || [];
    const outputParameters = outputJsonSchema.outputParameters || [];

    // Validate required input parameters
    for (const param of requiredInputs) {
      if (!(param in parsedParams)) {
        return res
          .status(400)
          .json({ error: `Missing required parameter: '${param}'` });
      }
    }

    // Merge internalJson and inputParameters into a single context
    const contextObj = {
      ...internalJson,
      ...parsedParams,
    };

    const context = createContext(contextObj);

    // Async IIFE-wrapped script
    const wrappedCode = `
      (async () => {
        ${jsCode}
      })()
    `;

    const script = new Script(wrappedCode);

    try {
      await script.runInContext(context);
    } catch (e) {
      return res.status(500).json({
        error: "JavaScript execution error",
        details: e.message,
      });
    }

    // Collect output
    const output = {};
    for (const param of outputParameters) {
      output[param] = contextObj[param];
    }

    return res.json({ token: "200", output });
  } catch (err) {
    console.error("Execution error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
};

const post_activitySteps = async function (req, res, next) {
  try {
    const {
      stepName,
      stepDesc,
      functionName,
      functionDesc,
      functionType,
      inputJsonSchema,
      outputJsonSchema,
      retryRule,
      runMode,
    } = req.body;
    const db = await connectToMongoDB();
    const collectionName = process.env.ACTIVITY_STEPS;

    const newObjectId = new ObjectId();

    const activityFmSchema = {
      _id: newObjectId,
      stepId: newObjectId.toHexString(),
      stepName: stepName,
      stepDesc: stepDesc,
      functionId: newObjectId.toHexString(),
      functionName: functionName,
      functionDesc: functionDesc,
      functionType: functionType,
      inputJsonSchema: inputJsonSchema,
      outputJsonSchema: outputJsonSchema,
      retryRule: retryRule,
      runMode: runMode,
      createdOn: new Date(),
    };

    const result = await db
      .collection(collectionName)
      .insertOne(activityFmSchema);

    if (result) {
      return res.json({ token: "200", activityFm: result });
    } else {
      return res.status(404).json({ error: "activityFM not found" });
    }
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};

const get_activitySteps = async function (req, res, next) {
  try {
    let filters = {};
    const appId = req.body.appId;
    const orgId = req.body.orgId;

    filters = {
      ...(appId && { appId: appId }),
      ...(orgId && { orgId: orgId }),
    };

    const db = await connectToMongoDB();
    const collectionName = process.env.ACTIVITY_STEPS;

    const activitySteps = await db
      .collection(collectionName)
      .find(filters)
      .toArray();

    if (activitySteps.length > 0) {
      return res.json({
        token: "200",
        count: activitySteps.length,
        activitySteps: activitySteps,
      });
    } else {
      return res.status(404).json({
        token: "404",
        message: "No activity steps found",
      });
    }
  } catch (err) {
    console.error("Error fetching activity steps from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching activity steps from MongoDB",
      details: err.message,
    });
  }
};

// Helper function to apply input JSON mapping
const applyInputMapping = (stepMeta, instanceInternalJson, workflowStep) => {
  if (!workflowStep.inputJsonMapping || !instanceInternalJson) {
    return stepMeta;
  }

  console.log(
    `[Mapping] Applying input mapping for step: ${stepMeta.stepName}`
  );
  console.log(`[Mapping] Original inputParameters:`, stepMeta.inputParameters);
  console.log(`[Mapping] InputJsonMapping:`, workflowStep.inputJsonMapping);
  console.log(`[Mapping] InstanceInternalJson:`, instanceInternalJson);

  // Create a deep copy of inputParameters to avoid modifying the original
  const updatedInputParameters = JSON.parse(
    JSON.stringify(stepMeta.inputParameters || {})
  );

  // Apply mappings from inputJsonMapping
  for (const [paramKey, internalKey] of Object.entries(
    workflowStep.inputJsonMapping
  )) {
    if (instanceInternalJson.hasOwnProperty(internalKey)) {
      console.log(
        `[Mapping] Replacing ${paramKey}: ${updatedInputParameters[paramKey]} -> ${instanceInternalJson[internalKey]}`
      );
      updatedInputParameters[paramKey] = instanceInternalJson[internalKey];
    } else {
      console.log(
        `[Mapping] Warning: Internal key '${internalKey}' not found in instanceInternalJson`
      );
    }
  }

  console.log(`[Mapping] Updated inputParameters:`, updatedInputParameters);

  // Return updated stepMeta with modified inputParameters
  return {
    ...stepMeta,
    inputParameters: updatedInputParameters,
  };
};

const executeFunctionCore = async ({
  functionName,
  inputParameters,
  instanceInternalJson = {},
  workflowStep = {},
}) => {
  const db = await connectToMongoDB();
  const collectionName = process.env.ACTIVITY_FM;

  console.log(
    `[ExecuteFunctionCore] Starting execution for function: ${functionName}`
  );
  console.log(
    `[ExecuteFunctionCore] Original inputParameters:`,
    inputParameters
  );
  console.log(
    `[ExecuteFunctionCore] InstanceInternalJson:`,
    instanceInternalJson
  );
  console.log(`[ExecuteFunctionCore] WorkflowStep:`, workflowStep);

  const parsedParams =
    typeof inputParameters === "string"
      ? JSON.parse(inputParameters)
      : inputParameters;

  const funcDoc = await db.collection(collectionName).findOne({ functionName });
  if (!funcDoc) throw new Error(`Function '${functionName}' not found`);

  const {
    inputJsonSchema: { inputParameters: requiredInputs = [] } = {},
    outputJsonSchema: { outputParameters = [] } = {},
    internalJson = {},
    jsCode = "",
  } = funcDoc;

  // Apply input mapping if present in workflow step
  let finalInputParams = { ...parsedParams };
  if (workflowStep.inputJsonMapping && instanceInternalJson) {
    console.log(`[ExecuteFunctionCore] Applying input JSON mapping`);

    for (const [paramKey, internalKey] of Object.entries(
      workflowStep.inputJsonMapping
    )) {
      if (instanceInternalJson.hasOwnProperty(internalKey)) {
        console.log(
          `[ExecuteFunctionCore] Mapping ${paramKey}: ${finalInputParams[paramKey]} -> ${instanceInternalJson[internalKey]}`
        );
        finalInputParams[paramKey] = instanceInternalJson[internalKey];
      } else {
        console.log(
          `[ExecuteFunctionCore] Warning: Internal key '${internalKey}' not found in instanceInternalJson`
        );
      }
    }
  }

  console.log(
    `[ExecuteFunctionCore] Final input parameters after mapping:`,
    finalInputParams
  );

  // Validate required inputs using the final mapped parameters
  for (const param of requiredInputs) {
    if (!(param in finalInputParams)) {
      throw new Error(`Missing required parameter: '${param}'`);
    }
  }

  // Merge function's internalJson, instance's internalJson, and final input parameters
  const contextObj = {
    ...internalJson, // Function-level internal JSON
    ...instanceInternalJson, // Instance-level internal JSON
    ...finalInputParams, // Final mapped input parameters
  };

  console.log(`[ExecuteFunctionCore] Final context object:`, contextObj);

  const context = createContext(contextObj);

  // Wrap jsCode in async IIFE to allow await usage
  const wrappedCode = `
    (async () => {
      ${jsCode}
    })()
  `;

  try {
    const script = new Script(wrappedCode);
    await script.runInContext(context);
  } catch (e) {
    throw new Error(`JavaScript execution error: ${e.message}`);
  }

  // Collect outputs
  const output = {};
  for (const param of outputParameters) {
    output[param] = contextObj[param];
  }

  console.log(
    `[ExecuteFunctionCore] Function execution completed with output:`,
    output
  );
  return output;
};

const post_activityTemplate = async function (req, res, next) {
  try {
    const { templateName, templateDesc, workflowSteps, appId, orgId, internalJsonSchema } = req.body;
    const db = await connectToMongoDB();

    const collectionName = process.env.ACTIVITY_TEMPLATE;
    const stepsCollectionName = process.env.ACTIVITY_STEPS;

    const newObjectId = new ObjectId();

    const existingName = await db
      .collection(collectionName)
      .findOne({ templateName });
    if (existingName) {
      return res
        .status(400)
        .json({ token: "400", response: "Template name already exists" });
    }

    // Process workflow steps to extract and save individual steps
    const processedWorkflowSteps = [];

    for (const workflowStep of workflowSteps) {
      const processedStepIds = {};

      // Extract each step from stepId object and save to Activity Steps collection
      for (const [stepKey, stepData] of Object.entries(workflowStep.stepId)) {
        const stepObjectId = new ObjectId();

        const activityStep = {
          _id: stepObjectId,
          stepId: stepObjectId.toHexString(),
          stepName: stepData.stepName,
          stepDesc: stepData.stepDesc,
          functionId: stepData.functionId,
          functionName: stepData.functionName,
          functionDesc: stepData.functionDesc,
          functionType: stepData.functionType,
          inputJsonSchema: stepData.inputJsonSchema,
          outputJsonSchema: stepData.outputJsonSchema,
          retryRule: stepData.retryRule,
          runMode: stepData.runMode,
          stepType: stepData.stepType,
          stepLogic: stepData.stepLogic,
          jumpType: stepData.jumpType,
          jumpStep: stepData.jumpStep,
          jumpStepType: stepData.jumpStepType,
          workflowInternalStep: stepData.workflowInternalStep,
          appId: appId,
          orgId: orgId,
          createdOn: new Date(),
        };

        // Save the step to Activity Steps collection
        const stepResult = await db
          .collection(stepsCollectionName)
          .insertOne(activityStep);

        if (stepResult.acknowledged) {
          // Store only the stepId in the template
          processedStepIds[stepKey] = stepObjectId.toHexString();
        } else {
          throw new Error(`Failed to create step: ${stepKey}`);
        }
      }

      // Add the processed workflow step with only stepIds
      processedWorkflowSteps.push({
        order: workflowStep.order,
        stepId: processedStepIds
      });
    }

    const activityTemplate = {
      _id: newObjectId,
      // type: "Activity Engine",
      templateId: newObjectId.toHexString(),
      templateName,
      templateDesc,
      workflowSteps: processedWorkflowSteps,
      createdOn: new Date(),
      internalJsonSchema: internalJsonSchema,
      appId: appId,
      orgId: orgId
    };

    const resultData = await db
      .collection(collectionName)
      .insertOne(activityTemplate);

    if (resultData) {
      return res.json({ token: "200", activityTemplate: resultData });
    } else {
      return res.status(404).json({ error: "activity template not created" });
    }
  } catch (err) {
    console.error("Error in post_activityTemplate:", err);
    res.status(500).json({ error: "Internal error", details: err.message });
  }
};

const get_activityTemplate = async function (req, res, next) {
  try {
    let filters = {};
    const appId = req.body.appId;
    const orgId = req.body.orgId;

    filters = {
      ...(appId && { appId: appId }),
      ...(orgId && { orgId: orgId }),
    };

    const db = await connectToMongoDB();
    const collectionName = process.env.ACTIVITY_TEMPLATE;
    const stepsCollectionName = process.env.ACTIVITY_STEPS;

    const activityTemplates = await db
      .collection(collectionName)
      .find(filters)
      .toArray();

    if (activityTemplates.length > 0) {
      // Enrich templates with complete step data from Activity Steps collection
      const enrichedTemplates = await Promise.all(
        activityTemplates.map(async (template) => {
          const enrichedWorkflowSteps = await Promise.all(
            template.workflowSteps.map(async (workflowStep) => {
              const enrichedStepIds = {};

              // Fetch complete step data for each stepId
              for (const [stepKey, stepId] of Object.entries(workflowStep.stepId)) {
                const stepData = await db
                  .collection(stepsCollectionName)
                  .findOne({ stepId: stepId });

                if (stepData) {
                  enrichedStepIds[stepKey] = {
                    stepId: stepData.stepId,
                    stepName: stepData.stepName,
                    stepDesc: stepData.stepDesc,
                    functionName: stepData.functionName,
                    functionDesc: stepData.functionDesc,
                    functionType: stepData.functionType,
                    inputJsonSchema: stepData.inputJsonSchema,
                    outputJsonSchema: stepData.outputJsonSchema,
                    retryRule: stepData.retryRule,
                    runMode: stepData.runMode
                  };
                } else {
                  // If step not found, keep the stepId
                  enrichedStepIds[stepKey] = stepId;
                }
              }

              return {
                order: workflowStep.order,
                stepId: enrichedStepIds
              };
            })
          );

          return {
            ...template,
            workflowSteps: enrichedWorkflowSteps
          };
        })
      );

      return res.json({
        token: "200",
        count: enrichedTemplates.length,
        activityTemplates: enrichedTemplates,
      });
    } else {
      return res.status(404).json({
        token: "404",
        message: "No activity templates found",
      });
    }
  } catch (err) {
    console.error("Error fetching activity templates from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching activity templates from MongoDB",
      details: err.message,
    });
  }
};

// Global heartbeat manager for instances
const instanceHeartbeats = new Map(); // instanceId -> intervalId

const post_activityInstance = async function (req, res, next) {
  try {
    const {
      templateId,
      templateName,
      templateDesc,
      internalJson,
      workflowSteps,
      appId,
      orgId
    } = req.body;
    const db = await connectToMongoDB();
    const collectionName = process.env.ACTIVITY_TEMPLATE;
    const queueCollectionName = process.env.ACTIVITY_QUEUE;
    const instanceCollectionName = process.env.ACTIVITY_INSTANCE;

    const newObjectId = new ObjectId();

    const existingName = await db
      .collection(collectionName)
      .findOne({ templateId: templateId });

    if (!existingName) {
      return res.status(400).json({
        token: "400",
        response: "template Id not exists",
      });
    }

    const activityInstanceSchema = {
      _id: newObjectId,
      instanceId: newObjectId.toHexString(),
      templateId: templateId,
      templateName: templateName,
      templateDesc: templateDesc,
      internalJson: internalJson || {}, // Store instance-level internalJson
      workflowSteps: workflowSteps,
      status: "running",
      createdOn: new Date(),
      instanceHeartBeat: new Date(),
      heartbeatActive: true,
      appId: appId,
      orgId: orgId
    };

    const result = await db
      .collection(instanceCollectionName)
      .insertOne(activityInstanceSchema);

    const instanceId = result.insertedId;

    // Start instance heartbeat
    startInstanceHeartbeat(instanceId);

    // Insert first order steps into ACTIVITY_QUEUE
    const firstOrder = workflowSteps.find((step) => step.order === 1);
    for (const [stepKey, stepId] of Object.entries(firstOrder.stepId)) {
      const stepMeta = await db
        .collection(process.env.ACTIVITY_STEPS)
        .findOne({ stepId });

      await db.collection(queueCollectionName).insertOne({
        activityInstanceId: instanceId,
        order: 1,
        stepKey,
        stepId,
        status: "pending",
        functionName: stepMeta.functionName,
        runMode: stepMeta.runMode || "RW",
        retryCount: 0,
        createdAt: new Date(),
        heartBeat: new Date(),
        heartbeatActive: false,
        statusHistory: [
          {
            status: "pending",
            startTime: new Date(),
            message: "Step added to queue",
          },
        ],
      });
    }

    // Start processing this specific instance asynchronously
    processInstanceInBackground(instanceId);

    return res.json({ token: "200", activityInstanceId: instanceId });
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching data from MongoDB",
      details: err.message,
    });
  }
};

const get_activityInstance = async function (req, res, next) {
  try {
    let filters = {};
    const appId = req.body.appId;
    const orgId = req.body.orgId;

    filters = {
      ...(appId && { appId: appId }),
      ...(orgId && { orgId: orgId }),
    };

    const db = await connectToMongoDB();
    const instanceCollectionName = process.env.ACTIVITY_INSTANCE;

    const activityInstances = await db
      .collection(instanceCollectionName)
      .find(filters)
      .toArray();

    if (activityInstances.length > 0) {
      return res.json({
        token: "200",
        count: activityInstances.length,
        activityInstances: activityInstances,
      });
    } else {
      return res.status(404).json({
        token: "404",
        message: "No activity instances found",
      });
    }
  } catch (err) {
    console.error("Error fetching activity instances from MongoDB:", err);
    return res.status(500).json({
      error: "Error fetching activity instances from MongoDB",
      details: err.message,
    });
  }
};

// Background processing for a specific instance (non-blocking)
const processInstanceInBackground = async (instanceId) => {
  try {
    console.log(`[Instance ${instanceId}] Starting background processing`);
    await processInstanceSteps(instanceId);
  } catch (err) {
    console.error(`[Instance ${instanceId}] Background processing error:`, err);
  }
};

// Process steps for a specific instance with event-driven approach
const processInstanceSteps = async (instanceId) => {
  const db = await connectToMongoDB();
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);

  console.log(`[Instance ${instanceId}] Processing steps`);

  // Get all pending steps for this instance, ordered by order and creation time
  const pendingSteps = await queueCollection
    .find({
      activityInstanceId: instanceId,
      status: { $in: ["pending", "initializing"] },
    })
    .sort({ order: 1, createdAt: 1 })
    .toArray();

  if (pendingSteps.length === 0) {
    console.log(`[Instance ${instanceId}] No pending steps found`);
    await checkAndUpdateInstanceCompletion(instanceId);
    return;
  }

  // Group steps by order
  const stepsByOrder = {};
  pendingSteps.forEach((step) => {
    if (!stepsByOrder[step.order]) {
      stepsByOrder[step.order] = [];
    }
    stepsByOrder[step.order].push(step);
  });

  // Process the lowest order first
  const lowestOrder = Math.min(...Object.keys(stepsByOrder).map(Number));
  const currentOrderSteps = stepsByOrder[lowestOrder];

  console.log(
    `[Instance ${instanceId}] Processing ${currentOrderSteps.length} steps for order ${lowestOrder}`
  );

  // Execute all steps in current order concurrently
  const stepPromises = currentOrderSteps.map((step) =>
    executeStepWithCallback(step, instanceId)
  );
  await Promise.allSettled(stepPromises);
};

// Execute a single step and handle completion callback with detailed status stages
const executeStepWithCallback = async (step, instanceId) => {
  const db = await connectToMongoDB();
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);
  let stopHeartbeat = null;

  try {
    console.log(
      `[Instance ${instanceId}] [Step ${step.stepKey}] Starting execution`
    );

    // Start step heartbeat
    stopHeartbeat = startStepHeartbeat(queueCollection, step._id);

    // Stage 1: INITIALIZING - Fetching details from step collection
    await updateStepStatus(
      queueCollection,
      step._id,
      "initializing",
      "Fetching step details and preparing execution"
    );

    const stepMeta = await db
      .collection(process.env.ACTIVITY_STEPS)
      .findOne({ stepId: step.stepId });

    if (!stepMeta) {
      throw new Error(`Step metadata not found for stepId: ${step.stepId}`);
    }

    // Get instance data to access internalJson
    const instance = await db
      .collection(process.env.ACTIVITY_INSTANCE)
      .findOne({ _id: instanceId });

    if (!instance) {
      throw new Error(`Instance not found for instanceId: ${instanceId}`);
    }

    // Find the corresponding workflow step to get inputJsonMapping
    const workflowStep = instance.workflowSteps.find(
      (ws) => ws.stepId && Object.values(ws.stepId).includes(step.stepId)
    );

    console.log(
      `[Instance ${instanceId}] [Step ${step.stepKey}] Step details fetched, function: ${stepMeta.functionName}`
    );

    // Stage 2: EXECUTING - Processing the function
    await updateStepStatus(
      queueCollection,
      step._id,
      "executing",
      `Executing function: ${stepMeta.functionName}`
    );

    // Check if this is a control step
    if (stepMeta.stepType === "control" && stepMeta.stepLogic) {
      console.log(
        `[Instance ${instanceId}] [Step ${step.stepKey}] Control step detected`
      );

      // Build context data for stepLogic evaluation
      const contextData = {
        ...instance.internalJson,
      };

      // Execute stepLogic
      const controlResult = await executeStepLogic(stepMeta.stepLogic, contextData);

      console.log(
        `[Instance ${instanceId}] [Step ${step.stepKey}] Control result:`,
        controlResult
      );

      // Update step status with control action
      await updateStepStatus(
        queueCollection,
        step._id,
        "completed",
        `Control step completed - Action: ${controlResult.action}`,
        {
          output: controlResult,
          controlAction: controlResult.action,
          targetStep: controlResult.targetStep,
          completedAt: new Date(),
          heartbeatActive: false,
        }
      );

      // Stop step heartbeat
      if (stopHeartbeat) stopHeartbeat();

      // Handle control flow actions
      await handleControlStepCompletion(step, instanceId, controlResult);
      return;
    }

    // Normal step execution
    // Execute the function with instance internalJson and workflow step mapping
    // Build inputParameters from the function's inputJsonSchema
    // If no explicit inputJsonMapping exists, auto-map from internalJson by parameter name
    const inputParams = {};
    if (stepMeta.inputJsonSchema && stepMeta.inputJsonSchema.inputParameters) {
      stepMeta.inputJsonSchema.inputParameters.forEach(param => {
        // Auto-map from internalJson if the parameter name matches
        if (instance.internalJson && instance.internalJson.hasOwnProperty(param)) {
          inputParams[param] = instance.internalJson[param];
        } else {
          inputParams[param] = null; // Initialize with null if not found
        }
      });
    }

    const output = await executeFunctionCore({
      functionName: stepMeta.functionName,
      inputParameters: inputParams,
      instanceInternalJson: instance.internalJson || {},
      workflowStep: workflowStep || {},
    });

    console.log(
      `[Instance ${instanceId}] [Step ${step.stepKey}] Function execution completed`
    );

    // Stage 3: FINALIZING - Processing the output from function model
    await updateStepStatus(
      queueCollection,
      step._id,
      "finalizing",
      "Processing function output and preparing completion"
    );

    // Process and validate the output
    const processedOutput = await processStepOutput(output, stepMeta);

    console.log(
      `[Instance ${instanceId}] [Step ${step.stepKey}] Output processed successfully`
    );

    // Stage 4: COMPLETED - After completing
    await updateStepStatus(
      queueCollection,
      step._id,
      "completed",
      "Step execution completed successfully",
      {
        output: processedOutput,
        completedAt: new Date(),
        heartbeatActive: false,
      }
    );

    console.log(
      `[Instance ${instanceId}] [Step ${step.stepKey}] Completed successfully`
    );

    // Stop step heartbeat
    if (stopHeartbeat) stopHeartbeat();

    // Handle post-completion logic
    await handleStepCompletion(step, instanceId);
  } catch (err) {
    console.error(
      `[Instance ${instanceId}] [Step ${step.stepKey}] Execution error:`,
      err
    );

    await updateStepStatus(
      queueCollection,
      step._id,
      "failed",
      `Execution failed: ${err.message}`,
      {
        error: err.message,
        failedAt: new Date(),
        retryCount: (step.retryCount || 0) + 1,
        heartbeatActive: false,
      }
    );

    // Stop step heartbeat on failure
    if (stopHeartbeat) stopHeartbeat();

    // Implement retry logic with exponential backoff
    await handleStepFailure(step, instanceId);
  }
};

// Enhanced heartbeat function with better error handling
const startStepHeartbeat = (collection, stepId) => {
  let isStopped = false;
  let failureCount = 0;
  const maxFailures = 3;

  // Mark heartbeat as active
  collection
    .updateOne({ _id: stepId }, { $set: { heartbeatActive: true } })
    .catch((err) =>
      console.error(`Failed to activate heartbeat for ${stepId}:`, err)
    );

  const intervalId = setInterval(async () => {
    if (isStopped) return;

    try {
      const result = await collection.updateOne(
        { _id: stepId, heartbeatActive: true },
        { $set: { heartBeat: new Date() } }
      );

      if (result.matchedCount === 0) {
        console.log(
          `[Heartbeat] Step ${stepId} not found or heartbeat inactive - stopping`
        );
        stopHeartbeat();
        return;
      }

      failureCount = 0;
      console.log(`[Heartbeat] Updated for step ${stepId}`);
    } catch (err) {
      failureCount++;
      console.error(
        `[Heartbeat] Failed to update for step ${stepId} (${failureCount}/${maxFailures}):`,
        err
      );

      if (failureCount >= maxFailures) {
        console.error(
          `[Heartbeat] Max failures reached for step ${stepId} - stopping heartbeat`
        );
        stopHeartbeat();
      }
    }
  }, 10000);

  const stopHeartbeat = () => {
    isStopped = true;
    clearInterval(intervalId);

    collection
      .updateOne(
        { _id: stepId },
        {
          $set: {
            heartbeatActive: false,
            heartbeatStoppedAt: new Date(),
          },
        }
      )
      .catch((err) =>
        console.error(`Failed to deactivate heartbeat for ${stepId}:`, err)
      );

    console.log(`[Heartbeat] Stopped for step ${stepId}`);
  };

  return stopHeartbeat;
};

// Instance heartbeat function
const startInstanceHeartbeat = (instanceId) => {
  if (instanceHeartbeats.has(instanceId)) {
    console.log(`[Instance Heartbeat] Already active for ${instanceId}`);
    return;
  }

  const intervalId = setInterval(async () => {
    try {
      const db = await connectToMongoDB();
      const result = await db
        .collection(process.env.ACTIVITY_INSTANCE)
        .updateOne(
          { _id: instanceId, heartbeatActive: true },
          { $set: { instanceHeartBeat: new Date() } }
        );

      if (result.matchedCount === 0) {
        console.log(
          `[Instance Heartbeat] Instance ${instanceId} not found or inactive - stopping`
        );
        stopInstanceHeartbeat(instanceId);
        return;
      }

      console.log(`[Instance Heartbeat] Updated for ${instanceId}`);
    } catch (err) {
      console.error(`[Instance Heartbeat] Failed for ${instanceId}:`, err);
    }
  }, 10000);

  instanceHeartbeats.set(instanceId, intervalId);
  console.log(`[Instance Heartbeat] Started for ${instanceId}`);
};

// Stop instance heartbeat
const stopInstanceHeartbeat = (instanceId) => {
  const intervalId = instanceHeartbeats.get(instanceId);
  if (intervalId) {
    clearInterval(intervalId);
    instanceHeartbeats.delete(instanceId);

    connectToMongoDB().then((db) => {
      db.collection(process.env.ACTIVITY_INSTANCE)
        .updateOne(
          { _id: instanceId },
          {
            $set: {
              heartbeatActive: false,
              heartbeatStoppedAt: new Date(),
            },
          }
        )
        .catch((err) =>
          console.error(
            `Failed to deactivate instance heartbeat for ${instanceId}:`,
            err
          )
        );
    });

    console.log(`[Instance Heartbeat] Stopped for ${instanceId}`);
  }
};

// Helper function to update step status with history tracking
const updateStepStatus = async (
  queueCollection,
  stepId,
  status,
  message,
  additionalFields = {}
) => {
  const updateData = {
    status,
    lastUpdatedAt: new Date(),
    ...additionalFields,
  };

  const historyEntry = {
    status,
    startTime: new Date(),
    message,
  };

  const currentStep = await queueCollection.findOne({ _id: stepId });

  if (
    currentStep &&
    currentStep.statusHistory &&
    currentStep.statusHistory.length > 0
  ) {
    const lastIndex = currentStep.statusHistory.length - 1;
    await queueCollection.updateOne(
      { _id: stepId },
      { $set: { [`statusHistory.${lastIndex}.endTime`]: new Date() } }
    );
  }

  const updateOperation = {
    $set: updateData,
    $push: { statusHistory: historyEntry },
  };

  if (status === "completed" || status === "failed") {
    historyEntry.endTime = new Date();
  }

  await queueCollection.updateOne({ _id: stepId }, updateOperation);

  console.log(`[Step ${stepId}] Status updated to: ${status} - ${message}`);
};

// Helper function to execute stepLogic for control steps
const executeStepLogic = async (stepLogic, contextData) => {
  try {
    console.log(`[StepLogic] Executing control logic: ${stepLogic}`);
    console.log(`[StepLogic] Context data:`, contextData);

    // Parse stepLogic format: "if condition: action targetStep;"
    // Supported actions: continue, break, wait
    const logicPattern = /if\s+(.+?):\s*(continue|break|wait)\s*(step\w+)?;?/i;
    const match = stepLogic.match(logicPattern);

    if (!match) {
      throw new Error(`Invalid stepLogic format: ${stepLogic}`);
    }

    const [, condition, action, targetStep] = match;

    // Create a safe evaluation context
    const evaluationContext = createContext({
      ...contextData,
    });

    // Evaluate the condition
    const conditionScript = new Script(`(${condition})`);
    const conditionResult = conditionScript.runInContext(evaluationContext);

    console.log(`[StepLogic] Condition "${condition}" evaluated to:`, conditionResult);

    if (conditionResult) {
      const result = {
        action: action.toLowerCase(),
        targetStep: targetStep ? targetStep.trim() : null,
        conditionMet: true,
      };
      console.log(`[StepLogic] Control flow result:`, result);
      return result;
    }

    return {
      action: 'proceed',
      targetStep: null,
      conditionMet: false,
    };
  } catch (err) {
    console.error(`[StepLogic] Execution error:`, err);
    throw new Error(`StepLogic execution failed: ${err.message}`);
  }
};

// Helper function to process step output - return only the result
const processStepOutput = async (output, stepMeta) => {
  try {
    console.log(`Processing output for function: ${stepMeta.functionName}`);

    if (output && typeof output === "object" && output.result !== undefined) {
      return output.result;
    }

    if (output && typeof output === "object" && output.data !== undefined) {
      return output.data;
    }

    if (output && typeof output === "object" && output.output !== undefined) {
      return output.output;
    }

    return output;
  } catch (err) {
    console.error("Error processing step output:", err);
    throw new Error(`Output processing failed: ${err.message}`);
  }
};

// Handle control step completion with continue, break, or wait actions
const handleControlStepCompletion = async (completedStep, instanceId, controlResult) => {
  const db = await connectToMongoDB();
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);
  const instanceCollection = db.collection(process.env.ACTIVITY_INSTANCE);

  console.log(
    `[Instance ${instanceId}] [Step ${completedStep.stepKey}] Handling control action: ${controlResult.action}`
  );

  switch (controlResult.action) {
    case 'continue':
      // Continue to a specific target step - skip intermediate steps
      if (!controlResult.targetStep) {
        throw new Error('Continue action requires a target step');
      }

      console.log(
        `[Instance ${instanceId}] [Step ${completedStep.stepKey}] Continue to: ${controlResult.targetStep}`
      );

      // Find the target step in the instance workflow
      const instance = await instanceCollection.findOne({ _id: instanceId });
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      let targetStepId = null;
      let targetOrder = null;
      let targetStepKey = null;

      // Search for the target step across all workflow steps
      for (const workflowStep of instance.workflowSteps) {
        if (workflowStep.stepId && workflowStep.stepId[controlResult.targetStep]) {
          targetStepId = workflowStep.stepId[controlResult.targetStep];
          targetOrder = workflowStep.order;
          targetStepKey = controlResult.targetStep;
          break;
        }
      }

      if (!targetStepId || !targetOrder) {
        throw new Error(`Target step not found: ${controlResult.targetStep}`);
      }

      console.log(
        `[Instance ${instanceId}] Found target step ${targetStepKey} at order ${targetOrder}`
      );

      // Skip all intermediate steps:
      // 1. Steps in current order that are pending/initializing (except current step)
      // 2. Steps in orders between current and target (if target is in future order)
      const skipQuery = {
        activityInstanceId: instanceId,
        _id: { $ne: completedStep._id },
        stepKey: { $ne: targetStepKey }, // Don't skip the target step
        status: { $in: ["pending", "initializing"] }
      };

      if (targetOrder > completedStep.order) {
        // Target is in a future order - skip current order steps and intermediate orders
        skipQuery.$or = [
          { order: completedStep.order }, // Rest of current order
          { order: { $gt: completedStep.order, $lt: targetOrder } } // Intermediate orders
        ];
      } else if (targetOrder === completedStep.order) {
        // Target is in same order - only skip other steps in current order
        skipQuery.order = completedStep.order;
      }
      // If targetOrder < completedStep.order, we're jumping backwards - don't skip anything

      await queueCollection.updateMany(
        skipQuery,
        {
          $set: {
            status: "skipped",
            skippedAt: new Date(),
            heartbeatActive: false,
          },
          $push: {
            statusHistory: {
              status: "skipped",
              startTime: new Date(),
              endTime: new Date(),
              message: `Skipped due to continue to ${targetStepKey} from ${completedStep.stepKey}`,
            },
          },
        }
      );

      // Mark all intermediate orders as skipped to prevent them from being added later
      const currentOrder = completedStep.order;
      if (targetOrder > currentOrder) {
        // Jumping forward - mark all intermediate orders as skipped in instance
        const skippedOrders = [];
        for (let order = currentOrder + 1; order < targetOrder; order++) {
          skippedOrders.push(order);

          // Skip any pending steps in intermediate orders that might already be in queue
          await queueCollection.updateMany(
            {
              activityInstanceId: instanceId,
              order: order,
              status: { $in: ["pending", "initializing"] }
            },
            {
              $set: {
                status: "skipped",
                skippedAt: new Date(),
                heartbeatActive: false,
              },
              $push: {
                statusHistory: {
                  status: "skipped",
                  startTime: new Date(),
                  endTime: new Date(),
                  message: `Skipped - order ${order} bypassed by continue to ${targetStepKey}`,
                },
              },
            }
          );
        }

        // Mark these orders as skipped in the instance document
        if (skippedOrders.length > 0) {
          await instanceCollection.updateOne(
            { _id: instanceId },
            {
              $addToSet: { skippedOrders: { $each: skippedOrders } }
            }
          );
        }
      }

      // Ensure the target order steps are added to the queue
      // This handles the case where we jump to a future order that hasn't been inserted yet
      await insertNextOrderSteps(instanceId, targetOrder);

      // Check if target step already exists in queue
      const existingTargetStep = await queueCollection.findOne({
        activityInstanceId: instanceId,
        stepKey: targetStepKey,
      });

      if (existingTargetStep) {
        console.log(
          `[Instance ${instanceId}] Target step ${targetStepKey} already in queue with status: ${existingTargetStep.status}`
        );

        // If it was skipped, reset it to pending
        if (existingTargetStep.status === "skipped") {
          await queueCollection.updateOne(
            { _id: existingTargetStep._id },
            {
              $set: {
                status: "pending",
                heartbeatActive: false,
              },
              $push: {
                statusHistory: {
                  status: "pending",
                  startTime: new Date(),
                  message: `Reset to pending via continue from ${completedStep.stepKey}`,
                },
              },
            }
          );
          console.log(`[Instance ${instanceId}] Target step ${targetStepKey} reset to pending`);
        }
      } else {
        // Step should have been added by insertNextOrderSteps, but if not, add it manually
        const stepMeta = await db
          .collection(process.env.ACTIVITY_STEPS)
          .findOne({ stepId: targetStepId });

        if (stepMeta) {
          await queueCollection.insertOne({
            activityInstanceId: instanceId,
            order: targetOrder,
            stepKey: targetStepKey,
            stepId: targetStepId,
            status: "pending",
            functionName: stepMeta.functionName,
            runMode: stepMeta.runMode || "RW",
            retryCount: 0,
            createdAt: new Date(),
            heartBeat: new Date(),
            heartbeatActive: false,
            statusHistory: [
              {
                status: "pending",
                startTime: new Date(),
                message: `Step added via continue from ${completedStep.stepKey}`,
              },
            ],
          });

          console.log(
            `[Instance ${instanceId}] Target step ${targetStepKey} added to queue manually`
          );
        }
      }

      // Trigger processing
      setTimeout(() => processInstanceInBackground(instanceId), 100);
      break;

    case 'break':
      // Break the workflow execution - skip all remaining steps (current and future orders)
      console.log(
        `[Instance ${instanceId}] [Step ${completedStep.stepKey}] Breaking workflow execution - skipping all remaining steps`
      );

      // Mark all pending/initializing steps in current order AND higher orders as skipped
      // Exclude the current step and already executing/completed steps
      await queueCollection.updateMany(
        {
          activityInstanceId: instanceId,
          _id: { $ne: completedStep._id }, // Exclude current step
          $or: [
            { order: { $gt: completedStep.order } }, // All future orders
            {
              order: completedStep.order, // Same order
              status: { $in: ["pending", "initializing"] } // Only pending/initializing
            }
          ]
        },
        {
          $set: {
            status: "skipped",
            skippedAt: new Date(),
            heartbeatActive: false,
          },
          $push: {
            statusHistory: {
              status: "skipped",
              startTime: new Date(),
              endTime: new Date(),
              message: `Skipped due to break from ${completedStep.stepKey}`,
            },
          },
        }
      );

      // Mark the instance workflow to prevent adding new steps
      await instanceCollection.updateOne(
        { _id: instanceId },
        {
          $set: {
            workflowBroken: true,
            breakTriggeredBy: completedStep.stepKey,
            breakTriggeredAt: new Date(),
          }
        }
      );

      // Check if we should complete the instance now
      // Only wait for currently executing steps to finish
      const stillExecuting = await queueCollection.countDocuments({
        activityInstanceId: instanceId,
        status: { $in: ["executing", "finalizing"] },
      });

      if (stillExecuting === 0) {
        // No steps currently executing, mark instance as completed immediately
        stopInstanceHeartbeat(instanceId);
        await instanceCollection.updateOne(
          { _id: instanceId },
          {
            $set: {
              status: "completed_with_break",
              completedOn: new Date(),
            }
          }
        );
        console.log(
          `[Instance ${instanceId}] Workflow execution broken and instance marked as completed`
        );
      } else {
        console.log(
          `[Instance ${instanceId}] Workflow broken, waiting for ${stillExecuting} executing steps to complete`
        );
      }
      break;

    case 'wait':
      // Wait for all previous steps in current order to complete
      console.log(
        `[Instance ${instanceId}] [Step ${completedStep.stepKey}] Waiting for previous steps to complete`
      );

      const stillRunningPreviousSteps = await queueCollection.countDocuments({
        activityInstanceId: instanceId,
        order: { $lte: completedStep.order },
        _id: { $ne: completedStep._id },
        status: { $nin: ["completed", "failed", "skipped"] },
      });

      if (stillRunningPreviousSteps === 0) {
        console.log(
          `[Instance ${instanceId}] All previous steps completed - proceeding to next order`
        );
        await insertNextOrderSteps(instanceId, completedStep.order + 1);
        setTimeout(() => processInstanceInBackground(instanceId), 100);
      } else {
        console.log(
          `[Instance ${instanceId}] Still ${stillRunningPreviousSteps} steps running - waiting`
        );
        // The step will be re-evaluated when other steps complete
      }
      break;

    case 'proceed':
    default:
      // Normal flow - proceed to next step
      console.log(
        `[Instance ${instanceId}] [Step ${completedStep.stepKey}] Proceeding with normal flow`
      );
      await handleStepCompletion(completedStep, instanceId);
      break;
  }
};

// Handle logic after a step completes successfully
const handleStepCompletion = async (completedStep, instanceId) => {
  const db = await connectToMongoDB();
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);

  console.log(
    `[Instance ${instanceId}] [Step ${completedStep.stepKey}] Handling completion`
  );

  const lockKey = `processing_${instanceId}_${completedStep.order}`;
  const lockCollection = db.collection("processing_locks");

  try {
    await lockCollection.insertOne({
      _id: lockKey,
      instanceId: instanceId,
      order: completedStep.order,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30000),
    });
  } catch (err) {
    if (err.code === 11000) {
      console.log(
        `[Instance ${instanceId}] Order ${completedStep.order} completion already being processed`
      );
      return;
    }
    throw err;
  }

  try {
    if (completedStep.runMode === "R") {
      console.log(
        `[Instance ${instanceId}] [Step ${completedStep.stepKey}] R mode - triggering next order immediately`
      );
      await insertNextOrderSteps(instanceId, completedStep.order + 1);
      setTimeout(() => processInstanceInBackground(instanceId), 100);
    } else {
      console.log(
        `[Instance ${instanceId}] [Step ${completedStep.stepKey}] RW mode - checking if order ${completedStep.order} is complete`
      );

      // Count only non-skipped steps that are still running
      const stillRunningCurrentOrder = await queueCollection.countDocuments({
        activityInstanceId: instanceId,
        order: completedStep.order,
        status: { $nin: ["completed", "failed", "skipped"] },
      });

      if (stillRunningCurrentOrder === 0) {
        console.log(
          `[Instance ${instanceId}] Order ${completedStep.order} fully completed - triggering next order`
        );

        // Find the next order number that exists in the workflow and is not skipped
        const instance = await db.collection(process.env.ACTIVITY_INSTANCE).findOne({ _id: instanceId });
        const skippedOrders = instance?.skippedOrders || [];

        let nextOrder = completedStep.order + 1;
        const workflowOrders = instance.workflowSteps.map(ws => ws.order).sort((a, b) => a - b);
        const maxOrder = Math.max(...workflowOrders);

        // Skip over any orders that were marked as skipped by control flow
        while (nextOrder <= maxOrder && skippedOrders.includes(nextOrder)) {
          console.log(
            `[Instance ${instanceId}] Skipping order ${nextOrder} - marked as skipped by control flow`
          );
          nextOrder++;
        }

        if (nextOrder <= maxOrder) {
          await insertNextOrderSteps(instanceId, nextOrder);
          setTimeout(() => processInstanceInBackground(instanceId), 100);
        } else {
          console.log(
            `[Instance ${instanceId}] No more orders to process - checking completion`
          );
          await checkAndUpdateInstanceCompletion(instanceId);
        }
      } else {
        console.log(
          `[Instance ${instanceId}] Order ${completedStep.order} still has ${stillRunningCurrentOrder} running steps`
        );
      }
    }
  } finally {
    await lockCollection.deleteOne({ _id: lockKey });
  }
};

// Handle step failure and retry logic
const handleStepFailure = async (failedStep, instanceId) => {
  const maxRetries = 3;
  const baseDelay = 5000;

  if (failedStep.retryCount < maxRetries) {
    const retryDelay = baseDelay * Math.pow(2, failedStep.retryCount);
    console.log(
      `[Instance ${instanceId}] [Step ${failedStep.stepKey}] Scheduling retry ${failedStep.retryCount + 1
      }/${maxRetries} in ${retryDelay}ms`
    );

    setTimeout(async () => {
      const db = await connectToMongoDB();
      const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);

      await queueCollection.updateOne(
        { _id: failedStep._id },
        {
          $set: {
            status: "pending",
            heartbeatActive: false,
          },
          $push: {
            statusHistory: {
              status: "pending",
              startTime: new Date(),
              message: `Retry attempt ${failedStep.retryCount + 1
                }/${maxRetries} scheduled`,
            },
          },
        }
      );

      processInstanceInBackground(instanceId);
    }, retryDelay);
  } else {
    console.log(
      `[Instance ${instanceId}] [Step ${failedStep.stepKey}] Max retries exceeded - marking as permanently failed`
    );
  }
};

const insertNextOrderSteps = async (instanceId, orderNum) => {
  const db = await connectToMongoDB();

  const lockKey = `insert_${instanceId}_${orderNum}`;
  const lockCollection = db.collection("processing_locks");

  try {
    await lockCollection.insertOne({
      _id: lockKey,
      instanceId: instanceId,
      order: orderNum,
      operation: "insert_steps",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30000),
    });
  } catch (err) {
    if (err.code === 11000) {
      console.log(
        `[Instance ${instanceId}] Steps for order ${orderNum} already being inserted`
      );
      return;
    }
    throw err;
  }

  try {
    const instance = await db
      .collection(process.env.ACTIVITY_INSTANCE)
      .findOne({ _id: instanceId });
    if (!instance) {
      console.log(`[Instance ${instanceId}] Instance not found`);
      return;
    }

    // Check if workflow is broken - if so, don't add new steps
    if (instance.workflowBroken) {
      console.log(
        `[Instance ${instanceId}] Workflow is broken - not inserting steps for order ${orderNum}`
      );
      await checkAndUpdateInstanceCompletion(instanceId);
      return;
    }

    // Check if this order was marked as skipped by a control flow continue
    if (instance.skippedOrders && instance.skippedOrders.includes(orderNum)) {
      console.log(
        `[Instance ${instanceId}] Order ${orderNum} was skipped by control flow - not inserting steps`
      );
      // Move to next order or complete instance
      await checkAndUpdateInstanceCompletion(instanceId);
      return;
    }

    const existingSteps = await db
      .collection(process.env.ACTIVITY_QUEUE)
      .findOne({
        activityInstanceId: instanceId,
        order: orderNum,
      });

    if (existingSteps) {
      console.log(
        `[Instance ${instanceId}] Steps for order ${orderNum} already exist`
      );
      return;
    }

    const steps = instance.workflowSteps.find((w) => w.order === orderNum);
    if (!steps || !steps.stepId) {
      console.log(
        `[Instance ${instanceId}] No steps found for order ${orderNum} - workflow might be complete`
      );
      await checkAndUpdateInstanceCompletion(instanceId);
      return;
    }

    console.log(
      `[Instance ${instanceId}] Inserting ${Object.keys(steps.stepId).length
      } steps for order ${orderNum}`
    );

    const stepDocuments = [];
    for (const [stepKey, stepId] of Object.entries(steps.stepId)) {
      const stepMeta = await db
        .collection(process.env.ACTIVITY_STEPS)
        .findOne({ stepId });

      stepDocuments.push({
        activityInstanceId: instanceId,
        order: orderNum,
        stepKey,
        stepId,
        status: "pending",
        functionName: stepMeta.functionName,
        runMode: stepMeta.runMode || "RW",
        retryCount: 0,
        createdAt: new Date(),
        heartBeat: new Date(),
        heartbeatActive: false,
        statusHistory: [
          {
            status: "pending",
            startTime: new Date(),
            message: `Step added to queue for order ${orderNum}`,
          },
        ],
      });
    }

    if (stepDocuments.length > 0) {
      await db.collection(process.env.ACTIVITY_QUEUE).insertMany(stepDocuments);
    }
  } finally {
    await lockCollection.deleteOne({ _id: lockKey });
  }
};

// Check if instance is completed and update status
const checkAndUpdateInstanceCompletion = async (instanceId) => {
  const db = await connectToMongoDB();
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);
  const instanceCollection = db.collection(process.env.ACTIVITY_INSTANCE);

  const pendingOrRunning = await queueCollection.countDocuments({
    activityInstanceId: instanceId,
    status: { $in: ["pending", "initializing", "executing", "finalizing"] },
  });

  const failed = await queueCollection.countDocuments({
    activityInstanceId: instanceId,
    status: "failed",
  });

  if (pendingOrRunning === 0) {
    stopInstanceHeartbeat(instanceId);

    // Check if workflow was broken
    const instance = await instanceCollection.findOne({ _id: instanceId });

    if (instance && instance.workflowBroken) {
      // Workflow was broken by a control step
      await instanceCollection.updateOne(
        { _id: instanceId },
        { $set: { status: "completed_with_break", completedOn: new Date() } }
      );
      console.log(
        `[Instance ${instanceId}] Marked as COMPLETED_WITH_BREAK`
      );
    } else if (failed > 0) {
      await instanceCollection.updateOne(
        { _id: instanceId },
        { $set: { status: "failed", completedOn: new Date() } }
      );
      console.log(
        `[Instance ${instanceId}] Marked as FAILED due to permanent step failures`
      );
    } else {
      await instanceCollection.updateOne(
        { _id: instanceId },
        { $set: { status: "completed", completedOn: new Date() } }
      );
      console.log(`[Instance ${instanceId}] Marked as COMPLETED successfully`);
    }
  }
};

// Recovery function for application startup - restart all running instances
const recoverRunningInstances = async () => {
  const db = await connectToMongoDB();
  const instanceCollection = db.collection(process.env.ACTIVITY_INSTANCE);
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);
  const lockCollection = db.collection("processing_locks");

  console.log("[Recovery] Starting recovery of running instances...");

  await lockCollection.deleteMany({
    expiresAt: { $lt: new Date() },
  });

  const runningInstances = await instanceCollection
    .find({ status: "running" })
    .toArray();

  console.log(`[Recovery] Found ${runningInstances.length} running instances`);

  for (const instance of runningInstances) {
    console.log(`[Recovery] Recovering instance: ${instance._id}`);

    await instanceCollection.updateOne(
      { _id: instance._id },
      {
        $set: {
          instanceHeartBeat: new Date(),
          heartbeatActive: true,
        },
      }
    );

    startInstanceHeartbeat(instance._id);

    await queueCollection.updateMany(
      {
        activityInstanceId: instance._id,
        status: { $in: ["initializing", "executing", "finalizing"] },
      },
      {
        $set: {
          status: "pending",
          heartbeatActive: false,
        },
        $unset: { startedAt: "" },
        $push: {
          statusHistory: {
            status: "pending",
            startTime: new Date(),
            message: "Reset to pending due to application restart",
          },
        },
      }
    );

    setTimeout(
      () => processInstanceInBackground(instance._id),
      Math.random() * 1000
    );
  }

  console.log("[Recovery] Recovery process completed");
};

// Manual trigger to check and process any stalled instances
const processAllPendingInstances = async () => {
  const db = await connectToMongoDB();
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);

  const pendingInstanceIds = await queueCollection.distinct(
    "activityInstanceId",
    {
      status: { $in: ["pending", "initializing", "executing", "finalizing"] },
    }
  );

  console.log(
    `[Manual Trigger] Found ${pendingInstanceIds.length} instances with pending steps`
  );

  for (const instanceId of pendingInstanceIds) {
    console.log(`[Manual Trigger] Processing instance: ${instanceId}`);
    processInstanceInBackground(instanceId);
  }
};

// Enhanced function to get detailed status including heartbeat info
const getInstanceStepStatus = async (instanceId) => {
  const db = await connectToMongoDB();
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);
  const instanceCollection = db.collection(process.env.ACTIVITY_INSTANCE);

  const steps = await queueCollection
    .find({ activityInstanceId: instanceId })
    .sort({ order: 1, createdAt: 1 })
    .toArray();

  const instance = await instanceCollection.findOne({ _id: instanceId });

  const now = new Date();
  const staleThreshold = 30000;

  return {
    instanceInfo: {
      instanceId: instance?.instanceId,
      status: instance?.status,
      instanceHeartBeat: instance?.instanceHeartBeat,
      heartbeatActive: instance?.heartbeatActive,
      internalJson: instance?.internalJson,
      isInstanceStale: instance?.instanceHeartBeat
        ? now.getTime() - instance.instanceHeartBeat.getTime() > staleThreshold
        : true,
    },
    steps: steps.map((step) => {
      const isStale = step.heartBeat
        ? now.getTime() - step.heartBeat.getTime() > staleThreshold
        : true;

      return {
        stepKey: step.stepKey,
        stepId: step.stepId,
        order: step.order,
        status: step.status,
        functionName: step.functionName,
        runMode: step.runMode,
        retryCount: step.retryCount || 0,
        createdAt: step.createdAt,
        lastUpdatedAt: step.lastUpdatedAt,
        heartBeat: step.heartBeat,
        heartbeatActive: step.heartbeatActive,
        isStale: isStale,
        timeSinceLastHeartbeat: step.heartBeat
          ? now.getTime() - step.heartBeat.getTime()
          : null,
        statusHistory: step.statusHistory || [],
        output: step.output,
        error: step.error,
      };
    }),
  };
};

// Get summary of all instances and their current status
const getAllInstancesSummary = async () => {
  const db = await connectToMongoDB();
  const instanceCollection = db.collection(process.env.ACTIVITY_INSTANCE);
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);

  const instances = await instanceCollection.find({}).toArray();
  const now = new Date();
  const staleThreshold = 30000;

  const summary = [];

  for (const instance of instances) {
    const stepCounts = await queueCollection
      .aggregate([
        { $match: { activityInstanceId: instance._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray();

    const statusCounts = {};
    stepCounts.forEach((item) => {
      statusCounts[item._id] = item.count;
    });

    const isInstanceStale = instance.instanceHeartBeat
      ? now.getTime() - instance.instanceHeartBeat.getTime() > staleThreshold
      : true;

    summary.push({
      instanceId: instance.instanceId,
      templateName: instance.templateName,
      status: instance.status,
      createdOn: instance.createdOn,
      completedOn: instance.completedOn,
      instanceHeartBeat: instance.instanceHeartBeat,
      heartbeatActive: instance.heartbeatActive,
      internalJson: instance.internalJson,
      isInstanceStale: isInstanceStale,
      stepStatusCounts: statusCounts,
      totalSteps: stepCounts.reduce((sum, item) => sum + item.count, 0),
    });
  }

  return summary;
};

// Simple function to check heartbeat health of all active instances
const checkHeartbeatHealth = async () => {
  const db = await connectToMongoDB();
  const instanceCollection = db.collection(process.env.ACTIVITY_INSTANCE);
  const queueCollection = db.collection(process.env.ACTIVITY_QUEUE);

  const now = new Date();
  const staleThreshold = 30000;
  const staleTime = new Date(now.getTime() - staleThreshold);

  const staleInstances = await instanceCollection
    .find({
      status: "running",
      instanceHeartBeat: { $lt: staleTime },
    })
    .toArray();

  const staleSteps = await queueCollection
    .find({
      status: { $in: ["initializing", "executing", "finalizing"] },
      heartBeat: { $lt: staleTime },
    })
    .toArray();

  console.log(
    `[Health Check] Found ${staleInstances.length} stale instances and ${staleSteps.length} stale steps`
  );

  for (const step of staleSteps) {
    await queueCollection.updateOne(
      { _id: step._id },
      {
        $set: {
          status: "pending",
          heartbeatActive: false,
          error: "Step appeared to crash - heartbeat went stale",
        },
        $push: {
          statusHistory: {
            status: "pending",
            startTime: new Date(),
            message: "Reset due to stale heartbeat (possible crash)",
          },
        },
      }
    );

    setTimeout(
      () => processInstanceInBackground(step.activityInstanceId),
      1000
    );
  }

  return {
    staleInstances: staleInstances.length,
    staleSteps: staleSteps.length,
    timestamp: new Date(),
  };
};

// Graceful shutdown - stop all heartbeats
const gracefulShutdown = () => {
  console.log("[Shutdown] Stopping all heartbeats...");

  for (const [instanceId, intervalId] of instanceHeartbeats) {
    clearInterval(intervalId);
    console.log(`[Shutdown] Stopped heartbeat for instance ${instanceId}`);
  }
  instanceHeartbeats.clear();

  console.log("[Shutdown] All heartbeats stopped");
};

const get_activityQueue = async function (req, res, next) {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const fetchData = async () => {
      try {
        const db = await connectToMongoDB();
        const collectionName = process.env.ACTIVITY_QUEUE;
        const activityInstanceId = req.params.id;

        // Validate ObjectId
        if (!ObjectId.isValid(activityInstanceId)) {
          return sendEvent({ error: "Invalid activityInstanceId" });
        }

        // Fetch documents matching the given activityInstanceId
        const activityDocs = await db
          .collection(collectionName)
          .find({ activityInstanceId: new ObjectId(activityInstanceId) })
          .toArray();

        sendEvent(activityDocs);
      } catch (err) {
        console.error("Error fetching data from MongoDB:", err);
        sendEvent({
          error: "Error fetching data from MongoDB",
          details: err.message,
        });
      }
    };

    // Fetch data every 5 seconds
    const intervalId = setInterval(fetchData, 5000);

    // Initial fetch immediately
    fetchData();

    req.on("close", () => {
      clearInterval(intervalId);
      res.end();
    });
  } catch (err) {
    console.error("Error setting up event stream:", err);
    return next(err);
  }
};
// Expose the enhanced functions
export default {
  post_activityFM,
  get_activityFM,
  execute_activityFM,
  post_activityTemplate,
  get_activityTemplate,
  post_activityInstance,
  get_activityInstance,
  post_activitySteps,
  get_activitySteps,
  processInstanceSteps,
  recoverRunningInstances,
  processAllPendingInstances,
  getInstanceStepStatus,
  getAllInstancesSummary,
  updateStepStatus,
  checkHeartbeatHealth,
  gracefulShutdown,
  get_activityFMById,
  get_activityQueue
};
