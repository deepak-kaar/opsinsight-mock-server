import { connectToMongoDB } from "../../../config/connection.js";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
import controller from "../../../App/CalculationEngine/controllers/calculation.js";
import vm from "vm";
import { create, all } from "mathjs";
const math = create(all);

dotenv.config();

const post_calculationSteps = async (req, res, next) => {
  try {
    const db = await connectToMongoDB();
    const stepsCollectionName = process.env.CALCULATION_STEPS_COLLECTION;
    const graphCollectionName = process.env.CALCULATION_GRAPH;

    const calculationSteps = req.body.calculationSteps;

    if (!Array.isArray(calculationSteps) || calculationSteps.length === 0) {
      return res
        .status(400)
        .json({ error: "Invalid or empty calculationSteps array" });
    }

    // Prepare bulk insert documents
    const documents = calculationSteps.map((step) => ({
      _id: new ObjectId(),
      ...step,
    }));

    // Perform batch insert
    const result = await db
      .collection(stepsCollectionName)
      .insertMany(documents);

    // Extract information for calculation graph
    const calculationId = calculationSteps[0]?.calculationId;
    let affectedAttributes = []; // Track which attributes need cache invalidation

    if (calculationId) {
      // Process steps to generate calculation graph entry
      const sortedSteps = [...calculationSteps].sort(
        (a, b) => a.order - b.order
      );

      // Extract input attributes and output attribute
      const inputJsonSchema = new Set();
      let outputAttribute = null;

      for (const step of sortedSteps) {
        if (step.attribute && step.operator !== "S") {
          inputJsonSchema.add(step.attribute);
        } else if (step.operator === "S" && step.attribute) {
          outputAttribute = step.attribute;
        }
      }

      // If we have a valid output, create graph entry
      if (outputAttribute) {
        // Generate expression
        // const infix = [];
        // const rawTokens = [];

        // for (let i = 0; i < sortedSteps.length; i++) {
        //   const { attribute, operator, register, constValue } = sortedSteps[i];

        //   if (register && !attribute && operator !== "S") {
        //     infix.push(operator, `[register:${register}]`);
        //     rawTokens.push(operator);
        //   } else if (constValue !== undefined && constValue !== null) {
        //     infix.push(operator, constValue);
        //     rawTokens.push(operator, constValue);
        //   } else if (!attribute) {
        //     continue;
        //   } else if (i === 0) {
        //     infix.push(attribute);
        //     rawTokens.push(attribute);
        //   } else if (operator === "S") {
        //     // End of expression
        //     break;
        //   } else {
        //     infix.push(operator, attribute);
        //     rawTokens.push(operator, attribute);
        //   }
        // }

        const graphEntry = {
          calculationId,
          outputAttribute,
          inputJsonSchema: Array.from(inputJsonSchema),
          updatedAt: new Date(),
        };

        // Check if this calculation already exists in graph
        const existingGraph = await db
          .collection(graphCollectionName)
          .findOne({ outputAttribute });

        if (existingGraph) {
          // Compare input attributes to see if they've changed
          const existingInputs = new Set(existingGraph.inputJsonSchema || []);
          const newInputs = new Set(graphEntry.inputJsonSchema);

          // Check if input attributes changed
          if (
            existingInputs.size !== newInputs.size ||
            ![...existingInputs].every((attr) => newInputs.has(attr))
          ) {
            // If attributes changed, add both existing and new attributes to affected list
            affectedAttributes = [
              ...affectedAttributes,
              outputAttribute,
              ...graphEntry.inputJsonSchema,
              ...(existingGraph.inputJsonSchema || []),
            ];
          } else {
            // Even if attributes haven't changed, the output attribute may need to be recalculated
            affectedAttributes.push(outputAttribute);
          }

          // Update existing entry
          await db
            .collection(graphCollectionName)
            .updateOne({ outputAttribute }, { $set: graphEntry });
        } else {
          // Insert new entry - new calculation needs topological update
          affectedAttributes = [
            ...affectedAttributes,
            outputAttribute,
            ...graphEntry.inputJsonSchema,
          ];
          await db.collection(graphCollectionName).insertOne(graphEntry);
        }

        // If there are affected attributes, invalidate the cached topology
        if (affectedAttributes.length > 0) {
          // Use the new method to specifically invalidate affected topological orders
          await controller.invalidateTopologicalOrders(affectedAttributes);
        }
      }
    }

    return res.json({
      token: "200",
      insertedCount: result.insertedCount,
      insertedIds: result.insertedIds,
      affectedAttributes: affectedAttributes,
    });
  } catch (err) {
    return next(err);
  }
};

async function calculationEngine(req, res, next) {
  let instanceId = null;

  try {
    const startTime = Date.now();
    const db = await connectToMongoDB();
    const graphCollectionName = process.env.CALCULATION_GRAPH;
    const calcMappingCollection = process.env.CALCULATION_MAPPING;
    const calcStepCollection = process.env.CALCULATION_STEPS_COLLECTION;

    // Extract changed attributes from request
    // const changedInputs = req.body.changedAttributes;
    const changedInputs = Object.entries(req.body.changedAttributes).map(
      ([key, value]) => `${key}_${value}`
    );

    const triggeredDate = req.body.triggeredDate;

    // Gather template metadata for instance creation
    let templateMetadata = null;
    try {
      // Try to get template metadata from one of the impacted calculations
      const templateCollection = db.collection(process.env.FUNCTION_MODEL_COLLECTION);

      // Get the first available template to use as metadata base
      const sampleTemplate = await templateCollection.findOne({
        type: "Calculation Engine"
      });

      if (sampleTemplate) {
        templateMetadata = {
          calculationName: `Triggered Calculation - ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
          calculationDesc: `Auto-triggered calculation execution for attributes: ${changedInputs.join(', ')}`,
          inputJsonSchema: sampleTemplate.inputJsonSchema || {},
          outputJsonSchema: sampleTemplate.outputJsonSchema || {},
          jsLogic: sampleTemplate.jsLogic || "",
          internalJsonSchema: sampleTemplate.internalJsonSchema || [],
          orgId: sampleTemplate.orgId || "",
          orgName: sampleTemplate.orgName || "",
          appId: sampleTemplate.appId || "",
          appName: sampleTemplate.appName || ""
        };
      }
    } catch (err) {
      console.warn("Could not gather template metadata:", err.message);
    }

    // Create calculation instance record with 'pending' status
    instanceId = await createCalculationInstance(
      changedInputs,
      triggeredDate,
      templateMetadata
    );
    // Performance Tracking
    const executionStats = {
      cacheHit: false,
      cacheUpdated: false,
      processingTime: startTime,
      dbQueriesCount: 0,
      impactedCalcsCount: 0,
    };

    // Performance Optimization #1: Use projection to only fetch necessary fields
    executionStats.dbQueriesCount++;

    const graphCalcs = await db
      .collection(graphCollectionName)
      .find(
        { inputJsonSchema: { $in: changedInputs } },
        {
          projection: {
            calculationId: 1,
            templateId: 1,
            outputAttribute: 1,
            inputJsonSchema: 1,
          },
        }
      )
      .toArray();

    const calculatIds = graphCalcs.map((c) => c.calculationId);

    // Step 1: Find in calculationStep
    const steps = await db
      .collection(calcStepCollection)
      .find(
        {
          calculationId: { $in: calculatIds },
          attribute: { $in: changedInputs },
          $or: [{ calcTrigInd: true }, { calcReTrigInd: true }],
        },
        {
          projection: { calculationId: 1 },
        }
      )
      .toArray();

    const stepTriggeredCalcIds = new Set(steps.map((s) => s.calculationId));

    const calculateIdsTemplate = graphCalcs.map((c) => c.templateId);
    if (calculateIdsTemplate === undefined || calculateIdsTemplate === null) {
      calculateIdsTemplate = calculatIds;
    }

    // Step 2: Find in calculationMapping
    const mappings = await db
      .collection(calcMappingCollection)
      .find({
        calculationId: { $in: calculatIds },
      })
      .toArray();

    const mappingTriggeredCalcIds = new Set();
    for (const mapping of mappings) {
      const inputAttributeList = mapping.inputAttributeList || {};
      for (const attr of changedInputs) {
        if (inputAttributeList[attr] === undefined) {
          continue;
        }
        if (
          inputAttributeList[attr].calcTrigInd === true ||
          inputAttributeList[attr].calcReTrigInd === true
        ) {
          mappingTriggeredCalcIds.add(mapping.calculationId);
          break;
        }
      }
    }

    // Combine both
    const finalTriggeredIds = new Set([
      ...stepTriggeredCalcIds,
      ...mappingTriggeredCalcIds,
    ]);

    // Filter the original impacted list
    const directlyImpactedCalcs = graphCalcs.filter((c) =>
      finalTriggeredIds.has(c.calculationId)
    );

    // console.log(directlyImpactedCalcs);

    // Performance Optimization #2: Use efficient data structures for lookups
    const attributeToCalculations = new Map();
    const calculationMap = new Map();
    const outputToCalculation = new Map();
    const dependentMap = new Map();
    const impactedCalcs = new Set();
    const impactedAttrs = new Set(changedInputs);

    // Performance Optimization #3: Process data in batches
    for (const calc of directlyImpactedCalcs) {
      const calcId = calc.calculationId;
      if (!calcId) continue;

      impactedCalcs.add(calcId);
      impactedAttrs.add(calc.outputAttribute);

      // Initialize maps with these calculations
      calculationMap.set(calcId, calc);
      outputToCalculation.set(calc.outputAttribute, calcId);

      // Setup initial dependency maps
      if (!dependentMap.has(calc.outputAttribute)) {
        dependentMap.set(calc.outputAttribute, []);
      }

      for (const input of calc.inputJsonSchema || []) {
        if (!attributeToCalculations.has(input)) {
          attributeToCalculations.set(input, []);
        }
        attributeToCalculations.get(input).push(calcId);

        if (!dependentMap.has(input)) {
          dependentMap.set(input, []);
        }

        const dependents = dependentMap.get(input);
        if (!dependents.includes(calc.outputAttribute)) {
          dependents.push(calc.outputAttribute);
        }
      }
    }

    // Performance Optimization #4: Process dependencies iteratively to minimize DB queries
    let newlyImpactedAttrs = [...impactedAttrs].filter(
      (attr) => !changedInputs.includes(attr)
    );
    let fetchedAllDependencies = false;

    while (!fetchedAllDependencies) {
      if (newlyImpactedAttrs.length === 0) {
        fetchedAllDependencies = true;
        continue;
      }

      // Batch query for next level dependencies
      executionStats.dbQueriesCount++;
      const nextLevelCalcs = await db
        .collection(graphCollectionName)
        .find(
          {
            inputJsonSchema: { $in: newlyImpactedAttrs },
          },
          {
            projection: {
              calculationId: 1,
              outputAttribute: 1,
              inputJsonSchema: 1,
            },
          }
        )
        .toArray();

      if (nextLevelCalcs.length === 0) {
        fetchedAllDependencies = true;
        continue;
      }

      // Track new attributes that might affect others
      const nextImpactedAttrs = new Set();

      // Process the new calculations
      for (const calc of nextLevelCalcs) {
        const calcId = calc.calculationId;
        if (!calcId || impactedCalcs.has(calcId)) continue;

        impactedCalcs.add(calcId);
        nextImpactedAttrs.add(calc.outputAttribute);

        // Update our maps
        calculationMap.set(calcId, calc);
        outputToCalculation.set(calc.outputAttribute, calcId);

        if (!dependentMap.has(calc.outputAttribute)) {
          dependentMap.set(calc.outputAttribute, []);
        }

        for (const input of calc.inputJsonSchema || []) {
          if (!attributeToCalculations.has(input)) {
            attributeToCalculations.set(input, []);
          }
          attributeToCalculations.get(input).push(calcId);

          if (!dependentMap.has(input)) {
            dependentMap.set(input, []);
          }

          const dependents = dependentMap.get(input);
          if (!dependents.includes(calc.outputAttribute)) {
            dependents.push(calc.outputAttribute);
          }
        }
      }

      // Performance Optimization #5: Use Set operations for faster diff calculation
      newlyImpactedAttrs = [...nextImpactedAttrs].filter(
        (attr) => !impactedAttrs.has(attr)
      );
      newlyImpactedAttrs.forEach((attr) => impactedAttrs.add(attr));
    }

    executionStats.impactedCalcsCount = impactedCalcs.size;

    // Performance Optimization #6: Build graph with Map/Set for faster lookups
    // console.log(impactedAttrs);

    const graph = {
      nodes: impactedAttrs,
      edges: [],
      dependencyMap: {},
      dependentMap: {},
    };

    // Copy relevant portions of the dependency relationships
    for (const attr of impactedAttrs) {
      if (dependentMap.has(attr)) {
        const relevantDependents = dependentMap
          .get(attr)
          .filter((dep) => impactedAttrs.has(dep));
        if (relevantDependents.length > 0) {
          graph.dependentMap[attr] = relevantDependents;

          for (const dep of relevantDependents) {
            graph.edges.push([attr, dep]);

            const calcId = outputToCalculation.get(dep);
            if (calcId) {
              graph.dependencyMap[dep] = {
                inputs: calculationMap.get(calcId).inputJsonSchema || [],
                calculationId: calcId,
              };
            }
          }
        }
      }
    }

    // Update instance status to initializing
    if (instanceId) {
      await updateCalculationInstance(instanceId, 'initializing');
    }

    // Step 4: Check for cycles in the graph
    const cycles = controller.detectCyclesInGraph(graph);
    if (cycles.length > 0) {
      // Update instance with error
      if (instanceId) {
        await updateCalculationInstance(instanceId, 'error', null, 'Cannot proceed with calculations due to circular dependencies');
      }

      return res.status(400).json({
        token: "400",
        error: "Cannot proceed with calculations due to circular dependencies",
        cycles,
        instanceId: instanceId,
      });
    }

    // Step 5: Try to get stored topological sort first
    const graphId = controller.generateGraphId(graph.nodes);

    // Performance Optimization #7: Use Promise.all for concurrent operations
    const [storedOrder] = await Promise.all([
      controller.getStoredTopologicalOrder(graph),
    ]);

    let sortedAttributes;
    if (storedOrder) {
      // Use the stored order
      sortedAttributes = storedOrder;
      executionStats.cacheHit = true;
    } else {
      // Calculate topological sort
      sortedAttributes = controller.topologicalSort(graph);

      // Store for future use - pass the changed attributes
      controller
        .storeTopologicalOrder(graph, sortedAttributes, changedInputs)
        .catch((err) =>
          console.error("Failed to store topological order:", err)
        );
      executionStats.cacheUpdated = true;
    }

    // Map sorted attributes back to calculation IDs for execution
    const sortedCalculations = [];
    for (const attr of sortedAttributes) {
      const calcId = outputToCalculation.get(attr);
      if (calcId && impactedCalcs.has(calcId)) {
        sortedCalculations.push(calcId);
      }
    }

    // Performance Optimization #8: Prepare bulk queries for calculation data
    const results = [];
    const processedAttributes = new Set();

    // Performance Optimization #9: Fetch calculation data in bulk where possible
    const calcIds = [...impactedCalcs];

    const [calculationSteps, calcMappings] = await Promise.all([
      db
        .collection(process.env.CALCULATION_STEPS_COLLECTION)
        .find({ calculationId: { $in: calcIds } })
        .toArray()
        .then((steps) => {
          // Group by calculationId for faster access
          const stepsByCalcId = {};
          steps.forEach((step) => {
            if (!stepsByCalcId[step.calculationId]) {
              stepsByCalcId[step.calculationId] = [];
            }
            stepsByCalcId[step.calculationId].push(step);
          });
          return stepsByCalcId;
        }),
      db
        .collection(calcMappingCollection)
        .find({ calculationId: { $in: calcIds } })
        .toArray()
        .then((mappings) => {
          // Convert to Map for O(1) lookup
          const mappingsByCalcId = new Map();
          mappings.forEach((mapping) => {
            mappingsByCalcId.set(mapping.calculationId, mapping);
          });
          return mappingsByCalcId;
        }),
    ]);

    executionStats.dbQueriesCount += 2;

    // Update instance status to executing
    if (instanceId) {
      await updateCalculationInstance(instanceId, 'executing');
    }

    // Performance Optimization #10: Process calculations with minimized DB calls
    const calcPromises = [];

    for (const calcId of sortedCalculations) {
      const calc = calculationMap.get(calcId);
      if (!calc) continue;

      const calcStepsForId = calculationSteps[calcId] || null;
      const calcMapping = calcMappings.get(calcId);

      let calcPromise;
      if (calcStepsForId === null && calcMapping) {
        calcPromise = await controller
          .newPerformOperations(calcMapping, triggeredDate, impactedAttrs)
          .then((performResult) => ({
            calculationId: calcId,
            result: performResult,
          }));
      } else if (calcStepsForId) {
        calcPromise = await controller
          .segregateOperations(calcStepsForId)
          .then((segregatedGroups) =>
            controller.performOperationsOptimized(
              segregatedGroups,
              processedAttributes,
              graph,
              triggeredDate,
              impactedAttrs
            )
          )
          .then((performResult) => ({
            calculationId: calcId,
            result: performResult,
          }));
      } else {
        // Skip this calculation as we have no data for it
        continue;
      }

      calcPromises.push(calcPromise);

      if (calc.outputAttribute) {
        processedAttributes.add(calc.outputAttribute);
      }
    }

    // Wait for all calculations to complete
    const calculationResults = await Promise.all(calcPromises);
    results.push(...calculationResults);

    // Update instance status to finalizing
    if (instanceId) {
      await updateCalculationInstance(instanceId, 'finalizing');
    }

    // Calculate total execution time
    executionStats.processingTime = Date.now() - executionStats.processingTime;

    // Update instance with successful completion
    if (instanceId) {
      await updateCalculationInstance(
        instanceId,
        'completed',
        {
          executedCalculations: results,
          changedAttributes: changedInputs,
          executionStats: executionStats
        },
        null,
        sortedAttributes || [], // calculationPath
        impactedCalcs ? [...impactedCalcs] : [] // impactedCalculations
      );
    }

    return res.json({
      token: "200",
      changedAttributes: changedInputs,
      executedCalculations: results,
      instanceId: instanceId,
      cacheStats: {
        usedCachedTopology: executionStats.cacheHit,
        cacheUpdated: executionStats.cacheUpdated,
        processingTime: executionStats.processingTime,
        dbQueries: executionStats.dbQueriesCount,
        impactedCalculations: executionStats.impactedCalcsCount,
      },
    });
  } catch (err) {
    console.error("Error in calculation engine:", err);

    // Update instance with error if we have instanceId
    if (instanceId) {
      await updateCalculationInstance(instanceId, 'error', null, err.message);
    }

    return next(err);
  }
}


// const post_newCalculationSteps = async (req, res, next) => {
//   try {
//     const db = await connectToMongoDB();
//     const collectionName = process.env.CALCULATION_TEMPLATE;

//     const {
//       calculationName,
//       calculationDesc,
//       inputJsonSchema,
//       outputJsonSchema,
//       jsLogic,
//       orgId,
//       orgName,
//       appId,
//       appName,
//     } = req.body;

//     if (!calculationName || calculationName.trim() === "") {
//       return res.status(400).json({
//         token: "400",
//         response: "calculationName is required and cannot be empty",
//       });
//     }

//     // Validate calculation logic is provided
//     if (!jsLogic || jsLogic.trim() === "") {
//       return res.status(400).json({
//         token: "400",
//         response: "jsLogic is required and cannot be empty",
//       });
//     }

//     // Validate required input attributes are used in calculation logic
//     if (inputJsonSchema && inputJsonSchema.required && inputJsonSchema.required.length > 0) {
//       const requiredVariables = inputJsonSchema.required;
//       const logicString = jsLogic.toString();
//       const missingVariables = [];

//       for (const variable of requiredVariables) {
//         // Create a regex pattern to find the variable used in calculations
//         // This pattern looks for the variable name as a whole word (not part of another word)
//         const variablePattern = new RegExp(`\\b${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

//         if (!variablePattern.test(logicString)) {
//           missingVariables.push(variable);
//         }
//       }

//       if (missingVariables.length > 0) {
//         return res.status(400).json({
//           token: "400",
//           response: `Required input attributes [${missingVariables.join(', ')}] are not used in the calculation logic`,
//         });
//       }
//     }

//     // Additional validation: Check if properties marked as required are also in the required array
//     if (inputJsonSchema && inputJsonSchema.properties && inputJsonSchema.properties.length > 0) {
//       const requiredFromProperties = inputJsonSchema.properties
//         .filter(prop => prop.isrequired === true)
//         .map(prop => prop.name);

//       const declaredRequired = inputJsonSchema.required || [];
//       const inconsistentRequired = requiredFromProperties.filter(prop => !declaredRequired.includes(prop));

//       if (inconsistentRequired.length > 0) {
//         return res.status(400).json({
//           token: "400",
//           response: `Properties [${inconsistentRequired.join(', ')}] are marked as required but not listed in the required array`,
//         });
//       }
//     }

//     const existingCalc = await db
//       .collection(collectionName)
//       .findOne({ calculationName });

//     if (existingCalc) {
//       return res.status(400).json({
//         token: "400",
//         response: "ID with the provided calculationName already exists",
//       });
//     }

//     const newObjectId = new ObjectId();

//     const calculationSchema = {
//       _id: newObjectId,
//       calculationId: newObjectId.toHexString(),
//       calculationName: calculationName.trim(),
//       calculationDesc: calculationDesc?.trim() || "",
//       inputJsonSchema: inputJsonSchema,
//       outputJsonSchema: outputJsonSchema,
//       jsLogic: jsLogic,
//       orgId: orgId,
//       orgName: orgName,
//       appId: appId,
//       appName: appName,
//       createdOn: new Date(),
//     };

//     const result = await db
//       .collection(collectionName)
//       .insertOne(calculationSchema);

//     // Mark any existing topological orders as needing recalculation
//     const topoOrderCollection = db.collection(process.env.CALCULATION_CACHE);

//     if (outputJsonSchema && outputJsonSchema.length > 0) {
//       await topoOrderCollection.updateMany(
//         {}, // Update all documents - an optimization would be to find only relevant ones
//         { $set: { needsRecalculation: true } }
//       );
//     }

//     return res.json({
//       token: "200",
//       response: "Successfully created in database",
//       CalculationSteps: result,
//       topologyNeedsUpdate: true,
//     });
//   } catch (err) {
//     return next(err);
//   }
// };

const post_newCalculationSteps = async (req, res, next) => {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.FUNCTION_MODEL_COLLECTION;

    const {
      calculationName,
      calculationDesc,
      inputJsonSchema,
      outputJsonSchema,
      jsLogic,
      orgId,
      orgName,
      appId,
      appName,
    } = req.body;



    if (!calculationName || calculationName.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "calculationName is required and cannot be empty",
      });
    }
    // else if(!type){
    //    return res.status(400).json({
    //     token: "400",
    //     response: "Function Model Type is required and cannot be empty",
    //   });
    // }

    // Validate calculation logic is provided
    if (!jsLogic || jsLogic.trim() === "") {
      return res.status(400).json({
        token: "400",
        response: "jsLogic is required and cannot be empty",
      });
    }

    // Validate required input attributes are used in calculation logic
    if (inputJsonSchema && inputJsonSchema.required && inputJsonSchema.required.length > 0) {
      const requiredVariables = inputJsonSchema.required;
      const logicString = jsLogic.toString();
      const missingVariables = [];

      for (const variable of requiredVariables) {
        const variablePattern = new RegExp(`\\b${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        if (!variablePattern.test(logicString)) {
          missingVariables.push(variable);
        }
      }

      if (missingVariables.length > 0) {
        return res.status(400).json({
          token: "400",
          response: `Required input attributes [${missingVariables.join(', ')}] are not used in the calculation logic`,
        });
      }
    }

    // Additional validation: Check if properties marked as required are also in the required array
    if (inputJsonSchema && inputJsonSchema.properties && inputJsonSchema.properties.length > 0) {
      const requiredFromProperties = inputJsonSchema.properties
        .filter(prop => prop.isrequired === true)
        .map(prop => prop.name);

      const declaredRequired = inputJsonSchema.required || [];
      const inconsistentRequired = requiredFromProperties.filter(prop => !declaredRequired.includes(prop));

      if (inconsistentRequired.length > 0) {
        return res.status(400).json({
          token: "400",
          response: `Properties [${inconsistentRequired.join(', ')}] are marked as required but not listed in the required array`,
        });
      }
    }

    const existingCalc = await db
      .collection(collectionName)
      .findOne({ calculationName });

    if (existingCalc) {
      return res.status(400).json({
        token: "400",
        response: "ID with the provided calculationName already exists",
      });
    }

    const newObjectId = new ObjectId();

    // Build internalJsonSchema from input + output attributes
    const internalJsonSchema = [
      ...(inputJsonSchema?.properties?.map(p => p.name) || []),
      ...(outputJsonSchema?.properties?.map(p => p.name) || []),
    ];

    const calculationSchema = {
      _id: newObjectId,
      type: "Calculation Engine",
      calculationId: newObjectId.toHexString(),
      calculationName: calculationName.trim(),
      calculationDesc: calculationDesc?.trim() || "",
      inputJsonSchema: inputJsonSchema,
      outputJsonSchema: outputJsonSchema,
      jsLogic: jsLogic,
      internalJsonSchema, // <-- New field
      orgId: orgId,
      orgName: orgName,
      appId: appId,
      appName: appName,
      createdOn: new Date(),
    };

    const result = await db
      .collection(collectionName)
      .insertOne(calculationSchema);

    // Mark any existing topological orders as needing recalculation
    const topoOrderCollection = db.collection(process.env.CALCULATION_CACHE);

    if (outputJsonSchema && outputJsonSchema.length > 0) {
      await topoOrderCollection.updateMany(
        {},
        { $set: { needsRecalculation: true } }
      );
    }

    return res.json({
      token: "200",
      response: "Successfully created in database",
      CalculationSteps: result,
      topologyNeedsUpdate: true,
    });
  } catch (err) {
    return next(err);
  }
};


// const newCalculationEngine = async (req, res, next) => {
//   try {
//     const db = await connectToMongoDB();
//     const collectionName = process.env.CALCULATION_TEMPLATE;

//     const { calculationId, inputValues } = req.body;

//     if (!calculationId || !inputValues) {
//       return res.status(400).json({
//         token: "400",
//         response: "calculationId and inputValues are required",
//       });
//     }

//     const calculation = await db
//       .collection(collectionName)
//       .findOne({ calculationId });

//     if (!calculation) {
//       return res
//         .status(404)
//         .json({ token: "404", response: "Calculation not found" });
//     }

//     const allowedInputs = calculation.inputJsonSchema;

//     console.log(allowedInputs);


//     // Check for extra/unexpected input
//     const invalidInputs = Object.keys(inputValues).filter(
//       (key) => !allowedInputs.includes(key)
//     );
//     if (invalidInputs.length > 0) {
//       return res.status(400).json({
//         token: "400",
//         response: `Invalid input attributes provided: ${invalidInputs.join(
//           ", "
//         )}`,
//       });
//     }

//     // Check for missing required inputs
//     const missingInputs = allowedInputs.filter(
//       (key) => !inputValues.hasOwnProperty(key)
//     );
//     if (missingInputs.length > 0) {
//       return res.status(400).json({
//         token: "400",
//         response: `Missing required input attributes: ${missingInputs.join(
//           ", "
//         )}`,
//       });
//     }

//     const results = {};

//     for (const outputAttr of calculation.outputJsonSchema) {
//       const jsCode = calculation.jsLogic[outputAttr];

//       const context = {
//         ...inputValues,
//         result: null,
//       };

//       console.log(jsCode);

//       const script = new vm.Script(`
//         result = (function() {
//           ${jsCode}
//         })();
//       `);

//       try {
//         vm.createContext(context); // create sandboxed environment
//         script.runInContext(context); // execute script
//         results[outputAttr] = context.result;
//       } catch (err) {
//         return res.status(400).json({
//           token: "400",
//           response: `Error evaluating JavaScript for ${outputAttr}`,
//           error: err.message,
//         });
//       }
//     }

//     return res.json({
//       token: "200",
//       response: "Calculation successful",
//       results,
//     });
//   } catch (err) {
//     next(err);
//   }
// };z


const newCalculationEngine = async (req, res, next) => {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.FUNCTION_MODEL_COLLECTION;

    const { calculationId, inputValues } = req.body;

    if (!calculationId || !inputValues) {
      return res.status(400).json({
        token: "400",
        response: "calculationId and inputValues are required",
      });
    }

    const calculation = await db
      .collection(collectionName)
      .findOne({ calculationId });

    if (!calculation) {
      return res
        .status(404)
        .json({ token: "404", response: "Calculation not found" });
    }

    const inputJsonSchema = calculation.inputJsonSchema;
    console.log("Input Attributes:", inputJsonSchema);

    // Extract allowed input names from the properties array
    const allowedInputNames = inputJsonSchema.properties
      ? inputJsonSchema.properties.map(prop => prop.name)
      : [];

    // Extract required input names from the required array
    const requiredInputNames = inputJsonSchema.required || [];

    console.log("Allowed inputs:", allowedInputNames);
    console.log("Required inputs:", requiredInputNames);

    // Check for extra/unexpected input
    const invalidInputs = Object.keys(inputValues).filter(
      (key) => !allowedInputNames.includes(key)
    );
    if (invalidInputs.length > 0) {
      return res.status(400).json({
        token: "400",
        response: `Invalid input attributes provided: ${invalidInputs.join(
          ", "
        )}`,
      });
    }

    // Check for missing required inputs
    const missingInputs = requiredInputNames.filter(
      (key) => !inputValues.hasOwnProperty(key)
    );
    if (missingInputs.length > 0) {
      return res.status(400).json({
        token: "400",
        response: `Missing required input attributes: ${missingInputs.join(
          ", "
        )}`,
      });
    }

    // Validate input types (optional but recommended)
    const typeValidationErrors = [];
    if (inputJsonSchema.properties) {
      for (const prop of inputJsonSchema.properties) {
        const inputValue = inputValues[prop.name];
        if (inputValue !== undefined && prop.type) {
          const isValid = validateInputType(inputValue, prop.type);
          if (!isValid) {
            typeValidationErrors.push(`${prop.name} should be of type ${prop.type}`);
          }
        }
      }
    }

    if (typeValidationErrors.length > 0) {
      return res.status(400).json({
        token: "400",
        response: `Type validation errors: ${typeValidationErrors.join(", ")}`,
      });
    }

    // Handle different calculation logic formats
    let jsLogic = calculation.jsLogic;
    let results = {};

    // Check if jsLogic is a string (like in your payload example)
    if (typeof jsLogic === 'string') {
      // Parse the calculation logic string
      results = executeStringjsLogic(jsLogic, inputValues);
    }
    // Handle object format (per-output attribute)
    else if (typeof jsLogic === 'object' && calculation.outputJsonSchema) {
      for (const outputAttr of calculation.outputJsonSchema) {
        const jsCode = jsLogic[outputAttr];

        if (!jsCode) {
          return res.status(400).json({
            token: "400",
            response: `No calculation logic found for output attribute: ${outputAttr}`,
          });
        }

        const context = {
          ...inputValues,
          result: null,
        };

        console.log("JS Code for", outputAttr, ":", jsCode);

        const script = new vm.Script(`
          result = (function() {
            ${jsCode}
          })();
        `);

        try {
          vm.createContext(context); // create sandboxed environment
          script.runInContext(context); // execute script
          results[outputAttr] = context.result;
        } catch (err) {
          return res.status(400).json({
            token: "400",
            response: `Error evaluating JavaScript for ${outputAttr}`,
            error: err.message,
          });
        }
      }
    } else {
      return res.status(400).json({
        token: "400",
        response: "Invalid calculation logic format",
      });
    }

    return res.json({
      token: "200",
      response: "Calculation successful",
      results,
    });
  } catch (err) {
    next(err);
  }
};

// Helper function to validate input types
function validateInputType(value, expectedType) {
  switch (expectedType.toLowerCase()) {
    case 'double':
    case 'number':
      return !isNaN(Number(value)) && isFinite(Number(value));
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
    case 'int':
      return Number.isInteger(Number(value));
    default:
      return true; // If no type specified or unknown type, consider valid
  }
}

// Helper function to execute string-based calculation logic
function executeStringjsLogic(jsLogic, inputValues) {
  const results = {};

  // Split the calculation logic by semicolons to get individual statements
  const statements = jsLogic.split(';').filter(stmt => stmt.trim() !== '');

  // Create context with input values
  const context = { ...inputValues };

  try {
    // Execute each statement
    for (const statement of statements) {
      const trimmedStatement = statement.trim();
      if (trimmedStatement) {
        // Create a script to execute the statement
        const script = new vm.Script(trimmedStatement);
        vm.createContext(context);
        script.runInContext(context);
      }
    }

    // Extract results (assuming they are set as variables in the context)
    // Remove input values from results to only return calculated outputs
    Object.keys(context).forEach(key => {
      if (!inputValues.hasOwnProperty(key)) {
        results[key] = context[key];
      }
    });

    return results;
  } catch (err) {
    throw new Error(`Error executing calculation logic: ${err.message}`);
  }
}


const post_newCalculationMapping = async (req, res, next) => {
  try {
    const db = await connectToMongoDB();
    const mappingCollectionName = process.env.CALCULATION_MAPPING;
    const graphCollectionName = process.env.CALCULATION_GRAPH;
    const attrCollectionName = process.env.ATTRIBUTE_COLLECTION;

    const {
      calculationId,
      calculationName,
      calculationDesc,
      inputJsonSchema,
      outputJsonSchema,
      jsLogic,
    } = req.body;

    // Performance Optimization #1: Use projection in queries to reduce data transfer
    const existingMapping = await db
      .collection(mappingCollectionName)
      .findOne({ calculationDesc }, { projection: { _id: 1 } });

    if (existingMapping) {
      return res.status(400).json({
        token: "400",
        response: "Name with the provided calculation already exists",
      });
    }

    const newObjectId = new ObjectId();

    // Performance Optimization #2: Extract data preparation outside of database operations
    const inputAttributeIds = Object.values(inputJsonSchema)
      .map((attr) => `${attr.attribute}_${attr.frequency}`)
      .filter(Boolean); // Filter out falsy values (more efficient than !!attr)

    const inputAttributeIdsObj = Object.values(inputJsonSchema).reduce(
      (acc, attr) => {
        if (attr.attribute && attr.frequency) {
          const key = `${attr.attribute}_${attr.frequency}`;
          acc[key] = {
            calcTrigInd: attr.calcTrigInd,
            calcReTrigInd: attr.calcReTrigInd,
          };
        }
        return acc;
      },
      {}
    );
    // console.log(inputAttributeIds);

    const outputAttributeId =
      Object.values(outputJsonSchema)[0]?.attribute +
      "_" +
      Object.values(outputJsonSchema)[0]?.frequency;
    // const outputAttributeId = Object.values(outputJsonSchema).reduce(
    //   (acc, attr) => {
    //     if (attr.attribute && attr.frequency) {
    //       const key = `${attr.attribute}_${attr.frequency}`;
    //       // acc[key] = {
    //       //   calcTrigInd: attr.calcTrigInd,
    //       //   calcReTrigInd: attr.calcReTrigInd,
    //       // };
    //     }
    //     return acc;
    //   },
    //   {}
    // );

    // console.log(outputAttributeId);

    // Performance Optimization #3: Prepare both documents before database operations
    const calcMapping = {
      _id: newObjectId,
      calculationId: newObjectId.toHexString(),
      calculationName,
      calculationDesc,
      templateId: calculationId,
      inputAttributeList: inputAttributeIdsObj,
      inputJsonSchema,
      outputJsonSchema,
      jsLogic,
      createdOn: new Date(),
    };

    const calcMappingGraph = {
      _id: newObjectId, // Using same ID to help with document correlation
      calculationId: newObjectId.toHexString(),
      templateId: calculationId,
      outputAttribute: outputAttributeId,
      inputJsonSchema: inputAttributeIds,
      updatedAt: new Date(),
    };

    // Performance Optimization #4: Use Promise.all to execute multiple DB operations in parallel
    const [mappingResult, graphResult] = await Promise.all([
      db.collection(mappingCollectionName).insertOne(calcMapping),
      db.collection(graphCollectionName).insertOne(calcMappingGraph),
    ]);

    // Adding attributes to CalculationIds field in attribute collection

    const inputAttrIds = Object.values(inputJsonSchema)
      .map((attr) => attr.attribute)
      .filter(Boolean);

    const outputAttrIds = Object.values(outputJsonSchema)
      .map((attr) => attr.attribute)
      .filter(Boolean);

    const allAttributeIds = [...new Set([...inputAttrIds, ...outputAttrIds])];

    if (allAttributeIds.length > 0) {
      await db.collection(attrCollectionName).updateMany(
        {
          attributeId: { $in: allAttributeIds },
        },
        {
          $addToSet: {
            calculationIDS: calculationId,
          },
        },
        {
          upsert: false,
        }
      );
    }

    return res.json({
      token: "200",
      response: "Successfully created in database",
      Mapping: {
        ...calcMapping,
        _id: calcMapping._id.toString(), // Convert ObjectId to string for JSON response
      },
    });
  } catch (err) {
    console.error("Error creating mapping:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to create mapping",
      error: err.message,
    });
  }
};

const getNewCalculationMapping = async (req, res, next) => {
  try {
    const db = await connectToMongoDB();
    const calcMappingCollectionName = process.env.CALCULATION_MAPPING;

    const { templateId } = req.body;

    const existingTemplate = await db
      .collection(calcMappingCollectionName)
      .find({ templateId })
      .toArray();

    if (!existingTemplate) {
      return res.status(400).json({
        token: "400",
        response: "Calculation Template Id does not exist",
      });
    }

    return res.json({
      token: "200",
      calculationMapping: existingTemplate,
    });
  } catch (err) {
    console.error("Error in calculation mapping:", err);
    return {
      token: "500",
      response: "Calculation failed",
      error: err.message,
    };
  }
};

const monthToDate = async (req, res, next) => {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const attributeValueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;

    const { attributeId } = req.body;

    const existingAttribute = await db
      .collection(attributeCollectionName)
      .findOne(
        { attributeId },
        { projection: { _id: 1, calculationTotal: 1, calculationAverage: 1 } }
      );

    if (!existingAttribute) {
      return res.status(400).json({
        token: "400",
        response: "Attribute Id does not exist",
      });
    }

    const newObjectId = new ObjectId();

    const calculationTotal = existingAttribute.calculationTotal;
    const calculationAverage = existingAttribute.calculationAverage;

    // To handle calculationTotal
    const newDate = new Date();
    const startOfMonth = new Date(
      Date.UTC(newDate.getUTCFullYear(), newDate.getUTCMonth(), 1)
    );
    const startOfNextMonth = new Date(
      Date.UTC(newDate.getUTCFullYear(), newDate.getUTCMonth() + 1, 1)
    );

    // MongoDB query
    const data = await db
      .collection(attributeValueCollection)
      .find({
        frequency: "D",
        attributeId: attributeId,
        $expr: {
          $and: [
            {
              $gte: [
                { $dateFromString: { dateString: "$createdOn" } },
                startOfMonth,
              ],
            },
            {
              $lt: [
                { $dateFromString: { dateString: "$createdOn" } },
                startOfNextMonth,
              ],
            },
          ],
        },
      })
      .toArray();

    const year = newDate.getUTCFullYear();
    const month = newDate.getUTCMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Create a map of day -> value from the input data
    const dayValueMap = {};

    data.forEach((item) => {
      const date = new Date(item.createdOn);
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month) {
        const day = date.getUTCDate();
        dayValueMap[day] = item.value;
      }
    });

    if (calculationTotal.length > 0) {
      // Generate Fibonacci series for all days
      const mtdTotalAvg = [];
      let prev1 = 0,
        prev2 = 0,
        count = 0,
        average = 0; // F(n-1)

      for (let day = 1; day <= daysInMonth; day++) {
        const dayValue = dayValueMap[day] || 0;

        let fibValue;
        if (day === 1) {
          fibValue = dayValue;
          prev1 = 0;
          prev2 = dayValue;
        } else if (day === 2) {
          // Second day: previous + current
          fibValue = prev2 + dayValue;
          prev1 = prev2;
          prev2 = fibValue;
        } else {
          // Subsequent days: F(n) = F(n-1) + F(n-2) + current_day_value
          fibValue = prev2 + dayValue;
          prev1 = prev2;
          prev2 = fibValue;
        }

        if (dayValue) {
          count++;
          if (calculationAverage.length > 0) {
            // average = Math.floor(fibValue / count);
            average = fibValue / count;
          }
        }

        mtdTotalAvg.push({
          _id: newObjectId,
          attributeId: data[0]?.attributeId,
          attributeFreq: data[0]?.attributeFreq,
          value: fibValue,
          count,
          average,
          required: data[0]?.required,
          name: data[0]?.name,
          frequency: "MTD",
          createdBy: data[0]?.createdBy,
          createdOn: new Date(Date.UTC(year, month, day)).toISOString(),
        });
      }
      res.send(mtdTotalAvg);
    }
  } catch (err) {
    console.error("Error in monthtodate:", err);
    return {
      token: "500",
      response: "Calculation failed",
      error: err.message,
    };
  }
};

const yearToDate = async (req, res, next) => {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const attributeValueCollection = process.env.ATTRIBUTE_VALUE_COLLECTION;

    const { attributeId } = req.body;

    const existingAttribute = await db
      .collection(attributeCollectionName)
      .findOne(
        { attributeId },
        { projection: { _id: 1, calculationTotal: 1, calculationAverage: 1 } }
      );

    if (!existingAttribute) {
      return res.status(400).json({
        token: "400",
        response: "Attribute Id does not exist",
      });
    }

    const newObjectId = new ObjectId();

    const calculationTotal = existingAttribute.calculationTotal;
    const calculationAverage = existingAttribute.calculationAverage;

    // To handle calculationTotal
    const newDate = new Date();
    const startOfYear = new Date(
      Date.UTC(newDate.getUTCFullYear(), 0, 1) // January 1st
    );
    const startOfNextYear = new Date(
      Date.UTC(newDate.getUTCFullYear() + 1, 0, 1) // January 1st next year
    );

    // MongoDB query
    const data = await db
      .collection(attributeValueCollection)
      .find({
        frequency: "D",
        attributeId: attributeId,
        $expr: {
          $and: [
            {
              $gte: [
                { $dateFromString: { dateString: "$createdOn" } },
                startOfYear,
              ],
            },
            {
              $lt: [
                { $dateFromString: { dateString: "$createdOn" } },
                startOfNextYear,
              ],
            },
          ],
        },
      })
      .toArray();

    const year = newDate.getUTCFullYear();

    // Check if it's a leap year
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInYear = isLeapYear ? 366 : 365;

    // Create a map of date -> value from the input data
    const dateValueMap = {};

    data.forEach((item) => {
      const date = new Date(item.createdOn);
      if (date.getUTCFullYear() === year) {
        const dateKey = `${date.getUTCMonth()}-${date.getUTCDate()}`; // month-day format
        dateValueMap[dateKey] = item.value;
      }
    });

    if (calculationTotal.length > 0) {
      // Generate Fibonacci series for all days of the year
      const ytdTotalAvg = [];
      let prev1 = 0,
        prev2 = 0,
        count = 0,
        average = 0;

      let dayOfYear = 1;

      // Iterate through all months
      for (let month = 0; month < 12; month++) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Iterate through all days in the current month
        for (let day = 1; day <= daysInMonth; day++) {
          const dateKey = `${month}-${day}`;
          const dayValue = dateValueMap[dateKey] || 0;

          let fibValue;
          if (dayOfYear === 1) {
            fibValue = dayValue;
            prev1 = 0;
            prev2 = dayValue;
          } else if (dayOfYear === 2) {
            // Second day: previous + current
            fibValue = prev2 + dayValue;
            prev1 = prev2;
            prev2 = fibValue;
          } else {
            // Subsequent days: F(n) = F(n-1) + F(n-2) + current_day_value
            fibValue = prev2 + dayValue;
            prev1 = prev2;
            prev2 = fibValue;
          }

          if (dayValue) {
            count++;
            if (calculationAverage.length > 0) {
              average = fibValue / count;
            }
          }

          ytdTotalAvg.push({
            _id: newObjectId,
            attributeId: data[0]?.attributeId,
            attributeFreq: data[0]?.attributeFreq,
            value: fibValue,
            count,
            average,
            required: data[0]?.required,
            name: data[0]?.name,
            frequency: "YTD",
            createdBy: data[0]?.createdBy,
            createdOn: new Date(Date.UTC(year, month, day)).toISOString(),
          });

          dayOfYear++;
        }
      }

      res.send(ytdTotalAvg);
    }
  } catch (err) {
    console.error("Error in yeartodate:", err);
    return {
      token: "500",
      response: "Calculation failed",
      error: err.message,
    };
  }
};

// const collectionAggregation = async (req, res, next) => {
//   try {
//     const db = await connectToMongoDB();
//     const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
//     const { collectionName, variable, operand, comparator, operation } = req.body;

//     const collName = process.env[collectionName] || collectionName;

//     // Step 1: Build the base filter
//     let filter = {};
//     switch (operand) {
//       case "equal":
//         filter[variable] = comparator;
//         break;
//       case "not_equal":
//         filter[variable] = { $ne: comparator };
//         break;
//       case "greater_than":
//         filter[variable] = { $gt: comparator };
//         break;
//       case "less_than":
//         filter[variable] = { $lt: comparator };
//         break;
//       default:
//         return res.status(400).json({ error: "Unsupported operand" });
//     }

//     // Step 2: Fetch filtered base collection data
//     const filteredData = await db.collection(collName).find(filter).toArray();

//     // Step 3: Extract unique instanceIds
//     const instanceIds = [...new Set(filteredData.map(item => item.instanceId).filter(Boolean))];

//     // Step 4: Fetch all attributes matching those instances
//     const allAttributes = await db.collection(attributeCollectionName)
//       .find({ instanceId: { $in: instanceIds } })
//       .toArray();

//     // Step 5: Group attributes by instanceId (optional)
//     const attributesByInstance = allAttributes.reduce((acc, attr) => {
//       if (!acc[attr.instanceId]) acc[attr.instanceId] = [];
//       acc[attr.instanceId].push(attr);
//       return acc;
//     }, {});

//     // Step 6: Process dynamic operations
//     const results = {};

//     if (Array.isArray(operation)) {
//       for (const op of operation) {
//         const { type, field, filters = [] } = op;

//         const matchingAttributes = allAttributes.filter(attr => matchFilters(attr, filters));
//         const values = matchingAttributes
//           .map(attr => Number(attr[field]))
//           .filter(v => !isNaN(v));

//         const key = `${type}_${field}`;

//         switch (type) {
//           case "sum":
//             results[key] = values.reduce((a, b) => a + b, 0);
//             break;

//           case "average":
//             results[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
//             break;

//           case "count":
//             results[key] = values.length;
//             break;

//           case "min":
//             results[key] = values.length ? Math.min(...values) : null;
//             break;

//           case "max":
//             results[key] = values.length ? Math.max(...values) : null;
//             break;

//           default:
//             return res.status(400).json({ error: `Unsupported operation type: ${type}` });
//         }
//       }
//     }

//     // Step 7: Add default result counts
//     results.instanceCount = instanceIds.length;

//     // Step 8: Return final response
//     res.json({
//       filter,
//       operations: results,
//       instanceIds,
//       attributesByInstance
//     });
//   } catch (err) {
//     console.error("Error in collectionAggregation:", err);
//     return res.status(500).json({
//       token: "500",
//       response: "Calculation failed",
//       error: err.message,
//     });
//   }
// };

// // Utility function for dynamic filter evaluation
// function matchFilters(attr, filters) {
//   return filters.every(f => {
//     const attrVal = attr[f.field];

//     switch (f.operator) {
//       case "equal":
//         return attrVal === f.value;
//       case "not_equal":
//         return attrVal !== f.value;
//       case "greater_than":
//         return attrVal > f.value;
//       case "less_than":
//         return attrVal < f.value;
//       case "contains":
//         return typeof attrVal === "string" && attrVal.includes(f.value);
//       default:
//         return false;
//     }
//   });
// }

const collectionAggregation = async (req, res, next) => {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
    const { collectionName, filters, operation } = req.body;

    const collName = process.env[collectionName] || collectionName;

    // Step 1: Build base filter from dynamic OR/AND logic
    const baseFilter = buildLogicalFilter(filters);
    if (baseFilter === null) {
      return res.status(400).json({ error: "Invalid filter structure" });
    }

    // Step 2: Fetch filtered collection
    const filteredData = await db
      .collection(collName)
      .find(baseFilter)
      .toArray();

    // Step 3: Extract unique instanceIds
    const instanceIds = [
      ...new Set(filteredData.map((item) => item.instanceId).filter(Boolean)),
    ];

    // Step 4: Fetch all attributes
    const allAttributes = await db
      .collection(attributeCollectionName)
      .find({ instanceId: { $in: instanceIds } })
      .toArray();

    // Step 5: Group attributes by instanceId (optional)
    const attributesByInstance = allAttributes.reduce((acc, attr) => {
      if (!acc[attr.instanceId]) acc[attr.instanceId] = [];
      acc[attr.instanceId].push(attr);
      return acc;
    }, {});

    // Step 6: Perform operations
    const results = {};

    if (Array.isArray(operation)) {
      for (const op of operation) {
        const { type, field, filters = [] } = op;

        const matchingAttributes = allAttributes.filter((attr) =>
          matchFilters(attr, filters)
        );
        const values = matchingAttributes
          .map((attr) => Number(attr[field]))
          .filter((v) => !isNaN(v));

        const key = `${type}_${field}`;

        switch (type) {
          case "sum":
            results[key] = values.reduce((a, b) => a + b, 0);
            break;
          case "average":
            results[key] = values.length
              ? values.reduce((a, b) => a + b, 0) / values.length
              : 0;
            break;
          case "count":
            results[key] = values.length;
            break;
          case "min":
            results[key] = values.length ? Math.min(...values) : null;
            break;
          case "max":
            results[key] = values.length ? Math.max(...values) : null;
            break;
          default:
            return res
              .status(400)
              .json({ error: `Unsupported operation type: ${type}` });
        }
      }
    }

    // Step 7: Add basic count info
    results.count = filteredData.length;
    results.instanceCount = instanceIds.length;

    // Step 8: Final response
    res.json({
      filter: baseFilter,
      operations: results,
      filteredData,
      instanceIds,
      attributesByInstance,
    });
  } catch (err) {
    console.error("Error in collectionAggregation:", err);
    return res.status(500).json({
      token: "500",
      response: "Calculation failed",
      error: err.message,
    });
  }
};

// ✅ Utility: Match filters for attribute operations
function matchFilters(attr, filters) {
  return filters.every((f) => {
    const attrVal = attr[f.field];
    switch (f.operator) {
      case "equal":
        return attrVal === f.value;
      case "not_equal":
        return attrVal !== f.value;
      case "greater_than":
        return attrVal > f.value;
      case "less_than":
        return attrVal < f.value;
      case "contains":
        return typeof attrVal === "string" && attrVal.includes(f.value);
      default:
        return false;
    }
  });
}

//Utility: Build compound Mongo filter (AND/OR)
function buildLogicalFilter(filterBlock) {
  if (!filterBlock || !Array.isArray(filterBlock.conditions)) {
    return null;
  }
  let operator;
  if (!filterBlock.type) {
    operator = "OR";
  } else {
    operator = filterBlock.type.toUpperCase(); // AND / OR
  }

  const mongoOp = operator === "AND" ? "$and" : "$or";
  const conditions = filterBlock.conditions
    .map((f) => {
      if (f.type && f.conditions) {
        return buildLogicalFilter(f); // Nested AND/OR group
      }

      const field = f.variable;
      const value = f.comparator;

      switch (f.operand) {
        case "equal":
          return { [field]: value };
        case "not_equal":
          return { [field]: { $ne: value } };
        case "greater_than":
          return { [field]: { $gt: value } };
        case "less_than":
          return { [field]: { $lt: value } };
        case "contains":
          return { [field]: { $regex: value, $options: "i" } };
        default:
          return null;
      }
    })
    .filter(Boolean);

  return { [mongoOp]: conditions };
}

// const correlationEngine = async (req, res, next) => {
//   try {
//     const db = await connectToMongoDB();
//     const { correlationId, inputParameters, outputParameters } = req.body;

//     // Fetch correlation template
//     const template = await db
//       .collection(process.env.CORRELATION_TEMPLATE)
//       .findOne({ correlationId });

//     if (!template) {
//       return res.status(404).json({
//         token: "404",
//         response: "Correlation template not found",
//         error: "No template found for the given correlationId",
//       });
//     }

//     // Build variable mapping
//     const variableMap = {
//       ...inputParameters.variables,
//       ...inputParameters.collection,
//     };

//     // Execute correlation logic
//     const result = await executeCorrelationLogic(
//       db,
//       template.correlationLogic,
//       variableMap,
//       template.aggregation,
//       template.projection,
//       outputParameters
//     );

//     // console.log(result.data);
//     // console.log(result.data.results[0]);

//     res.json({
//       correlationId,
//       template: template.correlationName,
//       variableMapping: variableMap,
//       results: result,
//     });
//   } catch (err) {
//     console.error("Error in correlationEngine:", err);
//     return res.status(500).json({
//       token: "500",
//       response: "Correlation execution failed",
//       error: err.message,
//     });
//   }
// };

// /**
//  * Execute correlation logic with pseudo code parsing
//  */
// async function executeCorrelationLogic(
//   db,
//   correlationLogic,
//   variableMap,
//   aggregationTypes,
//   projectionConfig,
//   outputParameters
// ) {
//   try {
//     // Parse pseudo code syntax
//     const parsedLogic = parsePseudoCode(correlationLogic, variableMap);

//     // Create execution context
//     const context = {
//       db,
//       ...variableMap,
//       projectionConfig,
//       projection: projectionConfig,

//       // Built-in functions
//       getCollection: async (collection, filter, projection) => {
//         return await executeQuery(
//           db,
//           collection,
//           filter,
//           projection || projectionConfig,
//           variableMap,
//           aggregationTypes
//         );
//       },

//       // Add getInstance function to context
//       getInstance: async (collection, instanceIdentifier, projection) => {
//         return await getInstance(
//           collection,
//           instanceIdentifier,
//           projection || projectionConfig
//         );
//       },

//       getEntity: async (collection, entityName, projection) => {
//         return await getEntity(
//           entityName,
//           collection,
//           projection || projectionConfig
//         );
//       },

//       graphLookup: async (
//         collection,
//         matchField,
//         matchValue,
//         fromField,
//         toField,
//         as,
//         projection
//       ) => {
//         return await graphLookup(
//           collection,
//           matchField,
//           matchValue,
//           fromField,
//           toField,
//           as,
//           projection || projectionConfig
//         );
//       },

//       getLookup: async (
//         sourceData,
//         targetData,
//         sourceField,
//         targetField,
//         sourceFilters,
//         targetFilters,
//         returnFields,
//         projection
//       ) => {
//         return await getLookup(
//           sourceData,
//           targetData,
//           sourceField,
//           targetField,
//           sourceFilters,
//           targetFilters,
//           returnFields,
//           projection || projectionConfig
//         );
//       },

//       getLookupLeft: async (
//         primaryData,
//         enrichData,
//         primaryKey,
//         enrichKey,
//         sourceFilters,
//         targetFilters,
//         enrichFields,
//         projection
//       ) => {
//         return await getLookupLeft(
//           primaryData,
//           enrichData,
//           primaryKey,
//           enrichKey,
//           sourceFilters,
//           targetFilters,
//           enrichFields,
//           projection
//         );
//       },

//       logger: (...args) => {
//         console.log("[EXEC LOG]:", ...args);
//       },
//     };

//     // Execute the parsed JavaScript code
//     const executionFunction = new Function(
//       "context",
//       `
//       with(context) { 
//         return (async function() {
//           ${parsedLogic}

//           const outputResults = {};
//           ${outputParameters
//             .map((param) => {
//               if (typeof param === "string") {
//                 return `if (typeof ${param} !== 'undefined') outputResults['${param}'] = ${param};`;
//               } else if (typeof param === "object") {
//                 const key = Object.keys(param)[0];
//                 const label = param[key];
//                 return `if (typeof ${key} !== 'undefined') outputResults['${label}'] = ${key};`;
//               }
//             })
//             .join("\n          ")}

//           return outputResults;
//         })();
//       }
//     `
//     );

//     const result = await executionFunction(context);
//     // Apply aggregation to the final result if aggregationTypes is specified
//     if (aggregationTypes && result && typeof result === "object") {
//       const aggregatedResult = await applyAggregationToResult(
//         result,
//         aggregationTypes
//       );
//       return {
//         success: true,
//         data: result,
//         aggregations: aggregatedResult, // Add aggregation results
//         executedCode: parsedLogic,
//       };
//     }

//     return {
//       success: true,
//       data: result,
//       executedCode: parsedLogic,
//     };
//   } catch (error) {
//     console.error("Error executing correlation logic:", error);
//     return {
//       success: false,
//       error: error.message,
//       stack: error.stack,
//     };
//   }
// }

// /**
//  * Parse pseudo code syntax to JavaScript
//  */
// function parsePseudoCode(correlationLogic, variableMap) {
//   // console.log(variableMap);

//   let parsedLogic = correlationLogic;

//   // Replace collection and variable references
//   // Object.entries(variableMap).forEach(([key, value]) => {
//   //   const regex = new RegExp(`'${key}'`, "g");
//   //   parsedLogic = parsedLogic.replace(regex, `'${value}'`);
//   // });
//   for (const [key, value] of Object.entries(variableMap)) {
//     const regex = new RegExp(`\\b${key}\\b`, "g");
//     if (typeof value === "object") {
//       // inject directly as code, no JSON string
//       parsedLogic = parsedLogic.replace(regex, JSON.stringify(value, null, 2));
//     } else if (typeof value === "string") {
//       parsedLogic = parsedLogic.replace(regex, `'${value}'`);
//     } else {
//       parsedLogic = parsedLogic.replace(regex, String(value));
//     }
//   }

//   // Parse filter objects with pseudo operators
//   const filterRegex = /\{([^}]+)\}/g;

//   parsedLogic = parsedLogic.replace(filterRegex, (match, filterContent) => {
//     return `{${parseFilterConditions(filterContent, variableMap)}}`;
//   });

//   // console.log(parsedLogic);

//   return parsedLogic;
// }

// /**
//  * Parse filter conditions with pseudo operators
//  */
// function parseFilterConditions(filterContent, variableMap) {
//   // Handle OR conditions by building $or array
//   if (filterContent.includes(" or ")) {
//     return parseLogicalConditions(filterContent, variableMap);
//   }

//   // Handle AND conditions (default MongoDB behavior)
//   const conditions = splitByLogicalOperators(filterContent);

//   const parsedConditions = conditions.map((condition) => {
//     return parseSingleCondition(condition.trim(), variableMap);
//   });

//   return parsedConditions.join(", ");
// }

// /**
//  * Parse logical conditions (AND/OR)
//  */
// function parseLogicalConditions(filterContent, variableMap) {
//   // Split by 'and' first, then handle 'or' within each part
//   const andParts = filterContent.split(" and ");
//   const mongoConditions = [];

//   andParts.forEach((andPart) => {
//     andPart = andPart.trim();

//     if (andPart.includes(" or ")) {
//       // Handle OR condition - create $or array
//       const orConditions = andPart.split(" or ").map((orPart) => {
//         const condition = parseSingleCondition(orPart.trim(), variableMap);
//         return `{${condition}}`;
//       });

//       mongoConditions.push(`"$or": [${orConditions.join(", ")}]`);
//     } else {
//       // Simple condition
//       mongoConditions.push(parseSingleCondition(andPart, variableMap));
//     }
//   });

//   return mongoConditions.join(", ");
// }

// /**
//  * Parse a single condition
//  */
// function parseSingleCondition(condition, variableMap) {
//   // Remove parentheses if present
//   condition = condition.replace(/^\(|\)$/g, "").trim();

//   // Handle comparison operators (eq, ne, gt, gte, lt, lte)
//   const comparisonRegex = /(\w+)\s+(eq|ne|gt|gte|lt|lte)\s+(.+)/;
//   const match = condition.match(comparisonRegex);

//   if (match) {
//     const [, field, operator, value] = match;

//     // Parse and convert value
//     let parsedValue = parseValue(value.trim());

//     // Replace field name if it's a variable
//     const actualField = variableMap[field] || field;

//     if (operator === "eq") {
//       // Simple equality - no need for $eq operator
//       return `"${actualField}": ${JSON.stringify(parsedValue)}`;
//     } else {
//       // Convert pseudo operators to MongoDB operators
//       const mongoOperators = {
//         ne: "$ne",
//         gt: "$gt",
//         gte: "$gte",
//         lt: "$lt",
//         lte: "$lte",
//       };

//       return `"${actualField}": {"${
//         mongoOperators[operator]
//       }": ${JSON.stringify(parsedValue)}}`;
//     }
//   }

//   return condition;
// }

// /**
//  * Split filter content by logical operators (and, or)
//  */
// function splitByLogicalOperators(filterContent) {
//   const conditions = [];
//   let currentCondition = "";
//   let inQuotes = false;
//   let quoteChar = "";
//   let i = 0;

//   while (i < filterContent.length) {
//     const char = filterContent[i];
//     const prevChar = i > 0 ? filterContent[i - 1] : "";

//     // Handle quotes
//     if ((char === '"' || char === "'") && prevChar !== "\\") {
//       if (!inQuotes) {
//         inQuotes = true;
//         quoteChar = char;
//       } else if (char === quoteChar) {
//         inQuotes = false;
//         quoteChar = "";
//       }
//     }

//     if (!inQuotes) {
//       // Check for 'and' operator
//       if (filterContent.substr(i, 5) === " and ") {
//         conditions.push(currentCondition.trim());
//         currentCondition = "";
//         i += 4; // Skip ' and'
//       }
//       // Check for 'or' operator
//       else if (filterContent.substr(i, 4) === " or ") {
//         conditions.push(currentCondition.trim());
//         currentCondition = "";
//         i += 3; // Skip ' or'
//       } else {
//         currentCondition += char;
//       }
//     } else {
//       currentCondition += char;
//     }

//     i++;
//   }

//   // Add the last condition
//   if (currentCondition.trim()) {
//     conditions.push(currentCondition.trim());
//   }

//   // If no logical operators found, return the entire content as one condition
//   return conditions.length > 0 ? conditions : [filterContent.trim()];
// }

// /**
//  * Parse value from string to appropriate type
//  */
// function parseValue(value) {
//   value = value.trim();

//   if (value === "true") return true;
//   if (value === "false") return false;
//   if (value === "null") return null;

//   // Remove quotes for strings
//   if (
//     (value.startsWith('"') && value.endsWith('"')) ||
//     (value.startsWith("'") && value.endsWith("'"))
//   ) {
//     return value.slice(1, -1);
//   }

//   // Parse numbers
//   if (!isNaN(value) && !isNaN(parseFloat(value))) {
//     return parseFloat(value);
//   }

//   return value;
// }

// /**
//  * Execute database query with projection and aggregation
//  */
// async function executeQuery(
//   db,
//   collection,
//   filter,
//   projection,
//   variableMap,
//   aggregationTypes
// ) {
//   try {
//     // Get collection name from environment variable if it's a variable reference
//     const collectionName = process.env[collection] || collection;

//     // Build MongoDB query options
//     const queryOptions = {};
//     if (projection && Object.keys(projection).length > 0) {
//       queryOptions.projection = projection;
//     }

//     // Execute query
//     const documents = await db
//       .collection(collectionName)
//       .find(filter || {}, queryOptions)
//       .toArray();

//     // Perform aggregations if specified
//     const aggregationResults = aggregationTypes
//       ? performAggregations(documents, aggregationTypes)
//       : {};

//     return {
//       success: true,
//       documents: documents,
//       collection: collectionName,
//       filter: filter,
//       projection: projection,
//       aggregations: aggregationResults,
//       count: documents.length,
//     };
//   } catch (error) {
//     console.error("Error executing query:", error);
//     return {
//       success: false,
//       error: error.message,
//     };
//   }
// }

// /**
//  * Perform aggregation operations on documents
//  */
// function performAggregations(documents, aggregationConfig) {
//   const results = {};

//   if (!aggregationConfig || !Array.isArray(aggregationConfig)) {
//     return results;
//   }

//   aggregationConfig.forEach((operation) => {
//     switch (operation.toLowerCase()) {
//       case "count":
//         results.count = documents.length;
//         break;

//       case "sum":
//         results.sum = documents.reduce((total, doc) => {
//           const numericValues = Object.values(doc).filter(
//             (val) => typeof val === "number" && !isNaN(val)
//           );
//           return total + numericValues.reduce((sum, val) => sum + val, 0);
//         }, 0);
//         break;

//       case "avg":
//       case "average":
//         const allValues = [];
//         documents.forEach((doc) => {
//           Object.values(doc).forEach((val) => {
//             if (typeof val === "number" && !isNaN(val)) {
//               allValues.push(val);
//             }
//           });
//         });
//         results.average =
//           allValues.length > 0
//             ? allValues.reduce((sum, val) => sum + val, 0) / allValues.length
//             : 0;
//         break;

//       case "min":
//         const minValues = [];
//         documents.forEach((doc) => {
//           Object.values(doc).forEach((val) => {
//             if (typeof val === "number" && !isNaN(val)) {
//               minValues.push(val);
//             }
//           });
//         });
//         results.min = minValues.length > 0 ? Math.min(...minValues) : null;
//         break;

//       case "max":
//         const maxValues = [];
//         documents.forEach((doc) => {
//           Object.values(doc).forEach((val) => {
//             if (typeof val === "number" && !isNaN(val)) {
//               maxValues.push(val);
//             }
//           });
//         });
//         results.max = maxValues.length > 0 ? Math.max(...maxValues) : null;
//         break;

//       default:
//         results[operation] = { error: `Unsupported aggregation: ${operation}` };
//     }
//   });

//   return results;
// }

// async function getInstance(collectionName, instanceIdentifier, projection) {
//   try {
//     const db = await connectToMongoDB();

//     // Step 1: Find the instance document
//     const instanceDoc = await db
//       .collection(process.env.INSTANCE_COLLECTION)
//       .findOne({ instanceName: instanceIdentifier });

//     if (!instanceDoc) {
//       return {
//         success: false,
//         error: `Instance '${instanceIdentifier}' not found in collection '${collectionName}'`,
//         documents: [],
//         sortedResult: {},
//         count: 0,
//       };
//     }

//     const instanceId = instanceDoc.instanceId;

//     // Step 2: get entity details to fetch template
//     const entityId = instanceDoc.entityLookupId;
//     const entityDoc = await db
//       .collection(process.env.ENTITY_COLLECTION)
//       .findOne({ entityId });

//     const orderedKeys = entityDoc?.attributeTemplate || [];

//     // Step 3: Query the attribute collection
//     const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;

//     const attributeQuery = { instanceId: instanceId.toString() };

//     const queryOptions = {};
//     if (projection && Object.keys(projection).length > 0) {
//       queryOptions.projection = projection;
//     }

//     const attributeDocs = await db
//       .collection(attributeCollectionName)
//       .find(attributeQuery, queryOptions)
//       .toArray();

//     // fallback if no template found
//     let finalOrderedKeys = orderedKeys;
//     if (finalOrderedKeys.length === 0 && attributeDocs.length > 0) {
//       finalOrderedKeys = attributeDocs.map((a) => a.attributeName);
//     }

//     // Step 4: build sortedResult
//     const attributeMap = {};
//     attributeDocs.forEach((attr) => {
//       attributeMap[attr.attributeName] = attr.value;
//     });

//     const sortedResult = {};
//     finalOrderedKeys.forEach((key) => {
//       sortedResult[key] = attributeMap[key] || "";
//     });
//     sortedResult.instanceId = instanceId;

//     return {
//       success: true,
//       documents: attributeDocs,
//       sortedResult,
//       instanceId,
//       instanceData: instanceDoc,
//       collection: attributeCollectionName,
//       filter: attributeQuery,
//       projection,
//       count: attributeDocs.length,
//     };
//   } catch (error) {
//     console.error("Error in getInstance:", error);
//     return {
//       success: false,
//       error: error.message,
//       documents: [],
//       sortedResult: {},
//       count: 0,
//     };
//   }
// }

// async function getEntity(entityName, collectionName, projection) {
//   try {
//     const db = await connectToMongoDB();

//     // Step 0: lookup entity ID and get its template if defined
//     const entityDocument = await db
//       .collection(process.env.ENTITY_COLLECTION)
//       .findOne({ entityName });

//     const entityId = entityDocument?.entityId;

//     if (!entityId) {
//       return {
//         success: false,
//         error: `Entity '${entityName}' not found in collection '${collectionName}'`,
//         results: [],
//         sortedResults: [],
//         count: 0,
//       };
//     }

//     const orderedKeys = entityDocument?.attributeTemplate || [];

//     // Step 1: get all instances for this entity
//     const instanceQuery = { entityLookupId: entityId };
//     const instanceDocs = await db
//       .collection(process.env.INSTANCE_COLLECTION)
//       .find(instanceQuery)
//       .toArray();

//     if (instanceDocs.length === 0) {
//       return {
//         success: false,
//         error: `No instances found for entity '${entityName}'`,
//         results: [],
//         sortedResults: [],
//         count: 0,
//       };
//     }

//     const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
//     const entityResults = [];

//     // Step 2: for each instance, get attributes
//     for (const instance of instanceDocs) {
//       const attributeQuery = { instanceId: instance.instanceId.toString() };

//       const queryOptions = {};
//       if (projection && Object.keys(projection).length > 0) {
//         queryOptions.projection = projection;
//       }

//       const attributeDocs = await db
//         .collection(attributeCollectionName)
//         .find(attributeQuery, queryOptions)
//         .toArray();

//       entityResults.push({
//         instanceId: instance.instanceId,
//         attributes: attributeDocs.map((attr) => ({
//           attributeName: attr.attributeName,
//           value: attr.value,
//         })),
//         attributeCount: attributeDocs.length,
//       });
//     }

//     // if orderedKeys missing, fallback to first instance attribute names
//     let finalOrderedKeys = orderedKeys;
//     if (finalOrderedKeys.length === 0 && entityResults.length > 0) {
//       finalOrderedKeys = entityResults[0].attributes.map(
//         (a) => a.attributeName
//       );
//     }

//     // Step 3: build sorted results
//     const sortedResults = entityResults.map((item) => {
//       const attributeMap = {};
//       item.attributes.forEach((attr) => {
//         attributeMap[attr.attributeName] = attr.value;
//       });

//       const orderedEntity = {};
//       finalOrderedKeys.forEach((key) => {
//         orderedEntity[key] = attributeMap[key] || "";
//       });
//       orderedEntity.instanceId = item.instanceId;

//       return orderedEntity;
//     });

//     return {
//       success: true,
//       entity: entityName,
//       collection: collectionName,
//       results: entityResults, // raw attributes
//       sortedResults, // cleaned
//       instanceCount: instanceDocs.length,
//     };
//   } catch (error) {
//     console.error("Error in getEntity:", error);
//     return {
//       success: false,
//       error: error.message,
//       results: [],
//       sortedResults: [],
//       count: 0,
//     };
//   }
// }

// async function graphLookup(
//   collection, // this is the array of JSON documents
//   matchField,
//   matchValue,
//   fromField,
//   toField,
//   as,
//   projection
// ) {
//   try {
//     // no DB, use collection directly
//     const data = collection;

//     // find the starting node(s)
//     const roots = data.filter((doc) => doc[matchField] === matchValue);

//     if (roots.length === 0) {
//       return {
//         success: true,
//         count: 0,
//         results: [
//           {
//             [matchField]: matchValue,
//             [as]: [],
//           },
//         ],
//         sortedResults: [],
//       };
//     }

//     const visited = new Set();
//     const descendants = [];

//     function recurse(currentValue) {
//       for (const doc of data) {
//         if (doc[toField] === currentValue && !visited.has(doc.instanceId)) {
//           visited.add(doc.instanceId);
//           descendants.push(doc);
//           recurse(doc[fromField]);
//         }
//       }
//     }

//     recurse(matchValue);

//     // apply projection if requested
//     let projectedResults = descendants;
//     if (projection && Object.keys(projection).length > 0) {
//       projectedResults = descendants.map((doc) => {
//         const proj = {};
//         for (const key in projection) {
//           if (projection[key] && doc.hasOwnProperty(key)) {
//             proj[key] = doc[key];
//           }
//         }
//         return proj;
//       });
//     }

//     return {
//       success: true,
//       count: projectedResults.length,
//       results: [
//         {
//           ...roots[0], // the matching parent node
//           [as]: projectedResults,
//         },
//       ],
//       sortedResults: projectedResults,
//     };
//   } catch (error) {
//     console.error("Error in in-memory graphLookup:", error);
//     return {
//       success: false,
//       error: error.message,
//       results: [],
//       sortedResults: [],
//       count: 0,
//     };
//   }
// }


// async function getLookup(
//   inputData,
//   fromData,
//   localField,
//   foreignField,
//   localFilters,
//   foreignFilters,
//   returnFields,
//   projection
// ) {
//   try {
//     // STEP 1 - filter the input/source
//     let filteredLocal = inputData;
//     if (localFilters) {
//       filteredLocal = filteredLocal.filter((item) => {
//         return Object.entries(localFilters).every(([key, value]) => {
//           if (Array.isArray(value)) {
//             return value.includes(item[key]);
//           } else {
//             return item[key] === value;
//           }
//         });
//       });
//     }

//     // STEP 2 - get join keys from local
//     const localKeys = filteredLocal.map((item) => item[localField]);

//     // STEP 3 - filter foreign data (from)
//     let filteredFrom = fromData.filter((item) =>
//       localKeys.includes(item[foreignField])
//     );

//     if (foreignFilters) {
//       filteredFrom = filteredFrom.filter((item) => {
//         return Object.entries(foreignFilters).every(([key, value]) => {
//           if (Array.isArray(value)) {
//             return value.includes(item[key]);
//           } else {
//             return item[key] === value;
//           }
//         });
//       });
//     }

//     // STEP 4 - build merged result
//     let finalResult = filteredFrom.map((fromItem) => {
//       const matchingLocal = filteredLocal.find(
//         (src) => src[localField] === fromItem[foreignField]
//       );

//       let obj = {};
//       returnFields.forEach((field) => {
//         obj[field] =
//           fromItem[field] !== undefined
//             ? fromItem[field]
//             : matchingLocal?.[field];
//       });
//       return obj;
//     });

//     return {
//       success: true,
//       count: finalResult.length,
//       results: finalResult,
//     };
//   } catch (error) {
//     console.error("Error in mongoStyleLookup:", error);
//     return {
//       success: false,
//       error: error.message,
//       results: [],
//       count: 0,
//     };
//   }
// }


async function getLookup(
  inputData,
  fromData,
  localField,
  foreignField,
  let1,
  pipeline,
  returnFields,
  projection,
  unwind,
  group,
  sort,
  limit,
  skip
) {
  try {
    // STEP 1 - filter the input/source using 'let' variables
    let filteredLocal = inputData;
    if (let1) {
      filteredLocal = filteredLocal.filter((item) => {
        return Object.entries(let1).every(([key, value]) => {
          if (Array.isArray(value)) {
            return value.includes(item[key]);
          } else {
            return item[key] === value;
          }
        });
      });
    }

    // STEP 2 - get join keys from local
    const localKeys = filteredLocal.map((item) => item[localField]);

    // STEP 3 - filter foreign data (from) and apply pipeline operations
    let filteredFrom = fromData.filter((item) =>
      localKeys.includes(item[foreignField])
    );

    // Apply pipeline operations sequentially
    if (pipeline && pipeline.length > 0) {
      for (const stage of pipeline) {
        if (stage.$match) {
          filteredFrom = filteredFrom.filter((item) => {
            return Object.entries(stage.$match).every(([key, value]) => {
              if (Array.isArray(value)) {
                return value.includes(item[key]);
              } else if (typeof value === 'object' && value !== null) {
                // Handle operators like $gte, $lte, $in, etc.
                if (value.$in) return value.$in.includes(item[key]);
                if (value.$gte !== undefined) return item[key] >= value.$gte;
                if (value.$lte !== undefined) return item[key] <= value.$lte;
                if (value.$gt !== undefined) return item[key] > value.$gt;
                if (value.$lt !== undefined) return item[key] < value.$lt;
                if (value.$ne !== undefined) return item[key] !== value.$ne;
                return item[key] === value;
              } else {
                return item[key] === value;
              }
            });
          });
        }

        if (stage.$project) {
          filteredFrom = filteredFrom.map((item) => {
            let projectedItem = {};
            Object.entries(stage.$project).forEach(([key, value]) => {
              if (value === 1) {
                projectedItem[key] = item[key];
              } else if (value === 0) {
                // Exclude field (don't add to projectedItem)
              } else if (typeof value === 'string' && value.startsWith('$')) {
                // Field reference
                const fieldName = value.substring(1);
                projectedItem[key] = item[fieldName];
              } else {
                projectedItem[key] = value;
              }
            });
            return projectedItem;
          });
        }
      }
    }

    // STEP 4 - build merged result
    let finalResult = filteredFrom.map((fromItem) => {
      const matchingLocal = filteredLocal.find(
        (src) => src[localField] === fromItem[foreignField]
      );

      let obj = {};
      returnFields.forEach((field) => {
        obj[field] =
          fromItem[field] !== undefined
            ? fromItem[field]
            : matchingLocal?.[field];
      });
      return obj;
    });

    // STEP 5 - Apply post-lookup operations

    // Apply unwind operation
    if (unwind) {
      let unwoundResults = [];
      finalResult.forEach((item) => {
        const arrayField = unwind.path.startsWith('$') ? unwind.path.substring(1) : unwind.path;
        const arrayValue = item[arrayField];

        if (Array.isArray(arrayValue)) {
          arrayValue.forEach((element) => {
            let newItem = { ...item };
            newItem[arrayField] = element;
            unwoundResults.push(newItem);
          });
        } else if (unwind.preserveNullAndEmptyArrays) {
          unwoundResults.push(item);
        }
      });
      finalResult = unwoundResults;
    }

    // Apply grouping
    if (group) {
      const grouped = {};
      finalResult.forEach((item) => {
        let groupKey;
        if (group._id === null) {
          groupKey = 'null';
        } else if (typeof group._id === 'string' && group._id.startsWith('$')) {
          groupKey = item[group._id.substring(1)];
        } else {
          groupKey = group._id;
        }

        if (!grouped[groupKey]) {
          grouped[groupKey] = [];
        }
        grouped[groupKey].push(item);
      });

      finalResult = Object.entries(grouped).map(([key, items]) => {
        let result = { _id: key === 'null' ? null : key };

        Object.entries(group).forEach(([field, operation]) => {
          if (field === '_id') return;

          if (operation.$sum) {
            if (operation.$sum === 1) {
              result[field] = items.length;
            } else if (typeof operation.$sum === 'string' && operation.$sum.startsWith('$')) {
              const fieldName = operation.$sum.substring(1);
              result[field] = items.reduce((sum, item) => sum + (item[fieldName] || 0), 0);
            }
          } else if (operation.$avg) {
            const fieldName = operation.$avg.substring(1);
            const sum = items.reduce((sum, item) => sum + (item[fieldName] || 0), 0);
            result[field] = sum / items.length;
          } else if (operation.$max) {
            const fieldName = operation.$max.substring(1);
            result[field] = Math.max(...items.map(item => item[fieldName] || 0));
          } else if (operation.$min) {
            const fieldName = operation.$min.substring(1);
            result[field] = Math.min(...items.map(item => item[fieldName] || 0));
          } else if (operation.$first) {
            const fieldName = operation.$first.substring(1);
            result[field] = items[0] ? items[0][fieldName] : null;
          } else if (operation.$last) {
            const fieldName = operation.$last.substring(1);
            result[field] = items[items.length - 1] ? items[items.length - 1][fieldName] : null;
          } else if (operation.$push) {
            const fieldName = operation.$push.substring(1);
            result[field] = items.map(item => item[fieldName]);
          }
        });

        return result;
      });
    }

    // Apply sorting
    if (sort) {
      finalResult.sort((a, b) => {
        for (const [field, order] of Object.entries(sort)) {
          const aVal = a[field];
          const bVal = b[field];

          if (aVal < bVal) return order === 1 ? -1 : 1;
          if (aVal > bVal) return order === 1 ? 1 : -1;
        }
        return 0;
      });
    }

    // Apply skip
    if (skip && skip > 0) {
      finalResult = finalResult.slice(skip);
    }

    // Apply limit
    if (limit && limit > 0) {
      finalResult = finalResult.slice(0, limit);
    }

    return {
      success: true,
      count: finalResult.length,
      results: finalResult,
    };
  } catch (error) {
    console.error("Error in mongoStyleLookup:", error);
    return {
      success: false,
      error: error.message,
      results: [],
      count: 0,
    };
  }
}


async function getLookupLeft(
  primaryData,
  enrichData,
  primaryKey,
  enrichKey,
  sourceFilters = {},
  targetFilters = {},
  enrichFields,
  projection,
  enrichPrefix // <== default prefix, but caller can override
) {
  try {
    enrichPrefix = enrichPrefix || "Users_";

    // STEP 1: filter primary
    let filteredPrimary = primaryData;
    if (Object.keys(sourceFilters).length) {
      filteredPrimary = filteredPrimary.filter((item) =>
        Object.entries(sourceFilters).every(([key, value]) =>
          Array.isArray(value) ? value.includes(item[key]) : item[key] === value
        )
      );
    }

    // STEP 2: filter enrich
    let filteredEnrich = enrichData;
    if (Object.keys(targetFilters).length) {
      filteredEnrich = filteredEnrich.filter((item) =>
        Object.entries(targetFilters).every(([key, value]) =>
          Array.isArray(value) ? value.includes(item[key]) : item[key] === value
        )
      );
    }

    // STEP 3: build lookup
    const enrichMap = {};
    filteredEnrich.forEach((item) => {
      enrichMap[item[enrichKey]] = item;
    });

    // STEP 4: enrich with prefixed fields
    const enrichedResults = filteredPrimary.map((item) => {
      const match = enrichMap[item[primaryKey]] || {};
      const enrichValues = {};
      enrichFields.forEach((field) => {
        if (match[field] !== undefined) {
          // prefix it so you do not clash with primary fields
          enrichValues[`${enrichPrefix}${field}`] = match[field];
        }
      });
      return {
        ...item,
        ...enrichValues,
      };
    });

    return {
      success: true,
      count: enrichedResults.length,
      results: enrichedResults,
    };
  } catch (e) {
    console.error("Error in getLookupLeft:", e);
    return {
      success: false,
      error: e.message,
      results: [],
      count: 0,
    };
  }
}

async function applyAggregationToResult(result, aggregationConfig) {
  try {
    const aggregationResults = {};

    if (!aggregationConfig || typeof aggregationConfig !== "object") {
      return aggregationResults;
    }

    // Extract operation and field from aggregation config
    const operations = aggregationConfig.operation || [];
    const fields = aggregationConfig.field || [];

    // Find the main result data to aggregate
    let dataToAggregate = [];

    // Look for results in the main result object
    if (result.results && Array.isArray(result.results)) {
      dataToAggregate = result.results;
    } else if (
      result.data &&
      result.data.results &&
      Array.isArray(result.data.results)
    ) {
      dataToAggregate = result.data.results;
    } else {
      // Check each property in result for array data
      for (const [key, value] of Object.entries(result)) {
        if (
          value &&
          typeof value === "object" &&
          value.results &&
          Array.isArray(value.results)
        ) {
          dataToAggregate = value.results;
          break;
        }
      }
    }

    // console.log("Data to aggregate:", dataToAggregate);
    // console.log("Operations:", operations);
    // console.log("Fields:", fields);

    // Perform aggregations
    operations.forEach((operation) => {
      switch (operation.toLowerCase()) {
        case "count":
          if (fields.length > 0) {
            fields.forEach((field) => {
              const fieldValues = dataToAggregate
                .filter(
                  (doc) => doc[field] !== undefined && doc[field] !== null
                )
                .map((doc) => doc[field]);
              aggregationResults[`${field}_count`] = fieldValues.length;
            });
          } else {
            aggregationResults.count = dataToAggregate.length;
          }
          break;

        case "sum":
          fields.forEach((field) => {
            const fieldValues = dataToAggregate
              .filter(
                (doc) => typeof doc[field] === "number" && !isNaN(doc[field])
              )
              .map((doc) => doc[field]);
            aggregationResults[`${field}_sum`] = fieldValues.reduce(
              (sum, val) => sum + val,
              0
            );
          });
          break;

        case "avg":
        case "average":
          fields.forEach((field) => {
            const fieldValues = dataToAggregate
              .filter(
                (doc) => typeof doc[field] === "number" && !isNaN(doc[field])
              )
              .map((doc) => doc[field]);
            aggregationResults[`${field}_avg`] =
              fieldValues.length > 0
                ? fieldValues.reduce((sum, val) => sum + val, 0) /
                fieldValues.length
                : 0;
          });
          break;

        case "min":
          fields.forEach((field) => {
            const fieldValues = dataToAggregate
              .filter(
                (doc) => typeof doc[field] === "number" && !isNaN(doc[field])
              )
              .map((doc) => doc[field]);
            aggregationResults[`${field}_min`] =
              fieldValues.length > 0 ? Math.min(...fieldValues) : null;
          });
          break;

        case "max":
          fields.forEach((field) => {
            const fieldValues = dataToAggregate
              .filter(
                (doc) => typeof doc[field] === "number" && !isNaN(doc[field])
              )
              .map((doc) => doc[field]);
            aggregationResults[`${field}_max`] =
              fieldValues.length > 0 ? Math.max(...fieldValues) : null;
          });
          break;

        default:
          aggregationResults[operation] = {
            error: `Unsupported aggregation: ${operation}`,
          };
      }
    });

    return aggregationResults;
  } catch (error) {
    console.error("Error applying aggregation:", error);
    return { error: error.message };
  }
}

// Global heartbeat manager for calculation instances
const calculationInstanceHeartbeats = new Map(); // instanceId -> intervalId

// Function to create initial calculation instance with template fields
async function createCalculationInstance(changedAttributes, triggeredDate, templateMetadata = null) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.FUNCTION_MODEL_INSTANCE; // Use unified collection
    const newInstanceId = new ObjectId();

    const instanceRecord = {
      _id: newInstanceId,
      instanceId: newInstanceId.toHexString(),

      // Type for differentiation in unified collection
      type: "Calculation Engine",

      // Core execution data
      changedAttributes: changedAttributes || [],
      triggeredDate: triggeredDate,
      calculationPath: [],
      impactedCalculations: [],

      // Template fields (from Function Model) - remove duplicate type field
      calculationName: templateMetadata?.calculationName || `Calculation Instance ${newInstanceId.toHexString().slice(-8)}`,
      calculationDesc: templateMetadata?.calculationDesc || "Auto-generated calculation instance",
      inputJsonSchema: templateMetadata?.inputJsonSchema || {},
      outputJsonSchema: templateMetadata?.outputJsonSchema || {},
      jsLogic: templateMetadata?.jsLogic || "",
      internalJsonSchema: templateMetadata?.internalJsonSchema || [],

      // Organization and application context
      orgId: templateMetadata?.orgId || "",
      orgName: templateMetadata?.orgName || "",
      appId: templateMetadata?.appId || "",
      appName: templateMetadata?.appName || "",

      // Execution status and results
      status: 'pending', // Start with pending status
      result: null,
      errorMessage: null,

      // Enhanced status history (Activity Engine style)
      statusHistory: [
        {
          status: 'pending',
          startTime: new Date(),
          message: 'Calculation instance created and queued for execution'
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
    startCalculationInstanceHeartbeat(instanceId);

    console.log(`Calculation instance created: ${instanceId} with status: pending`);
    return instanceId;

  } catch (err) {
    console.error("Error creating calculation instance:", err);
    // Don't throw error to avoid breaking the main execution
    return null;
  }
}

// Function to update calculation instance status
async function updateCalculationInstance(instanceId, status, result = null, errorMessage = null, calculationPath = null, impactedCalculations = null) {
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
      if (calculationPath) updateData.calculationPath = calculationPath;
      if (impactedCalculations) updateData.impactedCalculations = impactedCalculations;

      statusHistoryEntry.message = 'Calculation engine execution completed successfully';
      statusHistoryEntry.endTime = new Date();

      // Stop heartbeat
      stopCalculationInstanceHeartbeat(instanceId);

    } else if (status === 'error') {
      updateData.errorMessage = errorMessage;
      updateData.failedAt = new Date();
      updateData.heartbeatActive = false;
      updateData.heartbeatStoppedAt = new Date();

      statusHistoryEntry.message = `Calculation engine execution failed: ${errorMessage}`;
      statusHistoryEntry.error = errorMessage;
      statusHistoryEntry.endTime = new Date();

      // Stop heartbeat
      stopCalculationInstanceHeartbeat(instanceId);

    } else if (status === 'initializing') {
      statusHistoryEntry.message = 'Initializing calculation engine and analyzing dependencies';
    } else if (status === 'executing') {
      statusHistoryEntry.message = 'Executing calculations in topological order';
    } else if (status === 'finalizing') {
      statusHistoryEntry.message = 'Finalizing calculation results and updating attribute values';
    } else if (status === 'processing') {
      statusHistoryEntry.message = 'Calculation engine processing calculations';
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
      console.log(`Calculation instance updated: ${instanceId} -> ${status}`);
    } else {
      console.warn(`Calculation instance not found for update: ${instanceId}`);
    }

  } catch (err) {
    console.error("Error updating calculation instance:", err);
    // Don't throw error to avoid breaking the main execution
  }
}

// Calculation instance heartbeat function (similar to Activity Engine)
const startCalculationInstanceHeartbeat = (instanceId) => {
  if (calculationInstanceHeartbeats.has(instanceId)) {
    console.log(`[Calculation Instance Heartbeat] Already active for ${instanceId}`);
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
          `[Calculation Instance Heartbeat] Instance ${instanceId} not found or inactive - stopping`
        );
        stopCalculationInstanceHeartbeat(instanceId);
        return;
      }

      console.log(`[Calculation Instance Heartbeat] Updated for ${instanceId}`);
    } catch (err) {
      console.error(`[Calculation Instance Heartbeat] Failed for ${instanceId}:`, err);
    }
  }, 10000); // Update every 10 seconds

  calculationInstanceHeartbeats.set(instanceId, intervalId);
  console.log(`[Calculation Instance Heartbeat] Started for ${instanceId}`);
};

// Stop calculation instance heartbeat
const stopCalculationInstanceHeartbeat = (instanceId) => {
  const intervalId = calculationInstanceHeartbeats.get(instanceId);
  if (intervalId) {
    clearInterval(intervalId);
    calculationInstanceHeartbeats.delete(instanceId);

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
            `Failed to deactivate calculation instance heartbeat for ${instanceId}:`,
            err
          )
        );
    });

    console.log(`[Calculation Instance Heartbeat] Stopped for ${instanceId}`);
  }
};

// Enhanced function to get detailed calculation instance status
const getCalculationInstanceStatus = async (instanceId) => {
  const db = await connectToMongoDB();
  const instanceCollection = db.collection(process.env.FUNCTION_MODEL_INSTANCE);

  const instance = await instanceCollection.findOne({
    _id: new ObjectId(instanceId),
    type: "Calculation Engine"
  });

  if (!instance) {
    throw new Error(`Calculation instance not found: ${instanceId}`);
  }

  const now = new Date();
  const staleThreshold = 30000; // 30 seconds

  const isInstanceStale = instance.instanceHeartBeat
    ? now.getTime() - instance.instanceHeartBeat.getTime() > staleThreshold
    : true;

  return {
    instanceId: instance.instanceId,
    status: instance.status,
    changedAttributes: instance.changedAttributes,
    triggeredDate: instance.triggeredDate,
    calculationPath: instance.calculationPath,
    impactedCalculations: instance.impactedCalculations,
    result: instance.result,
    errorMessage: instance.errorMessage,
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

// Get all calculation instances summary
const getAllCalculationInstancesSummary = async () => {
  const db = await connectToMongoDB();
  const instanceCollection = db.collection(process.env.FUNCTION_MODEL_INSTANCE);

  const instances = await instanceCollection.find({ type: "Calculation Engine" }).toArray();
  const now = new Date();
  const staleThreshold = 30000; // 30 seconds

  const summary = instances.map(instance => {
    const isInstanceStale = instance.instanceHeartBeat
      ? now.getTime() - instance.instanceHeartBeat.getTime() > staleThreshold
      : true;

    return {
      instanceId: instance.instanceId,
      status: instance.status,
      changedAttributes: instance.changedAttributes,
      triggeredDate: instance.triggeredDate,
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      failedAt: instance.failedAt,
      instanceHeartBeat: instance.instanceHeartBeat,
      heartbeatActive: instance.heartbeatActive,
      isInstanceStale: isInstanceStale,
      statusHistoryCount: instance.statusHistory?.length || 0,
      hasResult: !!instance.result,
      hasError: !!instance.errorMessage,
      calculationPathLength: instance.calculationPath?.length || 0,
      impactedCalculationsCount: instance.impactedCalculations?.length || 0
    };
  });

  return summary;
};

// Check heartbeat health of all active calculation instances
const checkCalculationHeartbeatHealth = async () => {
  const db = await connectToMongoDB();
  const instanceCollection = db.collection(process.env.FUNCTION_MODEL_INSTANCE);

  const now = new Date();
  const staleThreshold = 30000; // 30 seconds
  const staleTime = new Date(now.getTime() - staleThreshold);

  const staleInstances = await instanceCollection
    .find({
      type: "Calculation Engine",
      status: "running",
      instanceHeartBeat: { $lt: staleTime },
    })
    .toArray();

  console.log(
    `[Calculation Health Check] Found ${staleInstances.length} stale instances`
  );

  // Mark stale instances as failed
  for (const instance of staleInstances) {
    await updateCalculationInstance(
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

// Graceful shutdown - stop all calculation heartbeats
const gracefulCalculationShutdown = () => {
  console.log("[Calculation Shutdown] Stopping all heartbeats...");

  for (const [instanceId, intervalId] of calculationInstanceHeartbeats) {
    clearInterval(intervalId);
    console.log(`[Calculation Shutdown] Stopped heartbeat for instance ${instanceId}`);
  }
  calculationInstanceHeartbeats.clear();

  console.log("[Calculation Shutdown] All heartbeats stopped");
};

// Get calculation instances
const getCalculationInstances = async (req, res, next) => {
  try {
    const { status, changedAttributes, limit = 50, skip = 0 } = req.body;

    const db = await connectToMongoDB();
    const collectionName = process.env.FUNCTION_MODEL_INSTANCE;

    // Build filter - only get Calculation Engine instances
    let filter = { type: "Calculation Engine" };
    if (status) filter.status = status;
    if (changedAttributes && changedAttributes.length > 0) {
      filter.changedAttributes = { $in: changedAttributes };
    }

    // Get instances with pagination
    const instances = await db
      .collection(collectionName)
      .find(filter)
      .sort({ startedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();

    // Get total count for pagination
    const totalCount = await db
      .collection(collectionName)
      .countDocuments(filter);

    return res.json({
      token: "200",
      response: "Calculation instances retrieved successfully",
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
    console.error("Error getting calculation instances:", err);
    return res.status(500).json({
      token: "500",
      response: "Failed to get calculation instances",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};

export default {
  post_calculationSteps,
  calculationEngine,
  newCalculationEngine,
  post_newCalculationSteps,
  post_newCalculationMapping,
  getNewCalculationMapping,
  monthToDate,
  yearToDate,
  collectionAggregation,
  getCalculationInstances,
  // Enhanced calculation instance monitoring functions
  getCalculationInstanceStatus,
  getAllCalculationInstancesSummary,
  checkCalculationHeartbeatHealth,
  gracefulCalculationShutdown,
  // correlationEngine,
};
