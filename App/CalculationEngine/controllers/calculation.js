// Modified calculation.js with optimized topological order storage

import { connectToMongoDB } from "../../../config/connection.js";
import { ObjectId } from "mongodb";
import { create, all, log, log10 } from "mathjs";
import vm from "vm";
const math = create(all);

/**
 * Retrieve a calculation by ID
 */
async function getCalculation(calculationId) {
  try {
    const db = await connectToMongoDB();
    const collectionName = process.env.CALCULATION_STEPS_COLLECTION;

    if (!ObjectId.isValid(calculationId)) {
      return null;
    }

    const calcjson = await db
      .collection(collectionName)
      .find({ calculationId })
      .toArray();

    return calcjson.length > 0 ? calcjson : null;
  } catch (err) {
    throw err;
  }
}

/**
 * Segregate operations into logical groups
 */
async function segregateOperations(calcStepsList) {
  const db = await connectToMongoDB();
  const stepCollection = db.collection(
    process.env.CALCULATION_STEPS_COLLECTION
  );

  if (!Array.isArray(calcStepsList)) return [];

  // Sort by order
  const sortedSteps = [...calcStepsList].sort((a, b) => a.order - b.order);

  const result = [];
  let currentGroup = [];
  let i = 0;

  while (i < sortedSteps.length) {
    const current = sortedSteps[i];

    // Skip "* 0" operations
    if (
      current.operator === "*" &&
      Number(current.constValue) === 0 &&
      current.attribute === ""
    ) {
      i++;
      continue;
    }

    // If current is "S with attribute" (trigger condition)
    if (current.operator === "S" && current.attribute) {
      currentGroup.push(current);

      // Include next if it's "S with register and no attribute"
      const next = sortedSteps[i + 1];
      if (
        next &&
        next.operator === "S" &&
        next.register &&
        (!next.attribute || next.attribute === "")
      ) {
        currentGroup.push(next);
        i++; // Consume next
      }

      result.push(currentGroup);
      currentGroup = [];
      i++;
      continue;
    }

    // Regular step
    currentGroup.push(current);
    i++;

    // If next is trigger condition ("S" with attribute), finalize group
    const next = sortedSteps[i];
    if (current.operator === "S" && next?.attribute) {
      result.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length) {
    result.push(currentGroup);
  }

  const bulkOps = [];

  result.forEach((group, stepIndex) => {
    const stepNumber = stepIndex + 1;

    group.forEach((obj) => {
      bulkOps.push({
        updateOne: {
          filter: { _id: obj._id },
          update: { $set: { step: stepNumber } },
        },
      });
    });
  });

  if (bulkOps.length > 0) {
    await stepCollection.bulkWrite(bulkOps, { ordered: false });
  }

  return result;
}

/**
 * Detect cycles in the dependency graph
 */
function detectCyclesInGraph(graph) {
  const cycles = [];
  const visited = new Set();
  const stack = new Set();

  function dfs(node, path = []) {
    if (stack.has(node)) {
      // Found cycle
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat([node]);
      cycles.push(cycle);
      return true;
    }

    if (visited.has(node)) return false;

    visited.add(node);
    stack.add(node);
    path.push(node);
    const dependents = graph.dependentMap[node] || [];
    for (const dependent of dependents) {
      if (dfs(dependent, path)) {
        // Don't return early so we can find all cycles
      }
    }

    stack.delete(node);
    return false;
  }

  // Run DFS from each node to find all possible cycles
  for (const node of graph.nodes) {
    dfs(node, []);
  }

  return cycles;
}

/**
 * Perform topological sort on the graph
 */
function topologicalSort(graph) {
  const result = [];
  const visited = new Set();
  const temp = new Set(); // For cycle detection during sort

  function visit(node) {
    if (temp.has(node)) {
      throw new Error(`Cycle detected involving ${node}`);
    }

    if (visited.has(node)) return;

    temp.add(node);

    // Visit all dependencies first
    const dependencies = graph.dependencyMap[node]?.inputs || [];
    for (const dependency of dependencies) {
      visit(dependency);
    }

    temp.delete(node);
    visited.add(node);
    result.push(node);
  }

  // Try to visit each node
  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      visit(node);
    }
  }

  return result;
}

/**
 * Generate a compact hash representation of the graph structure
 * This helps efficiently detect changes in graph structure
 */
function generateGraphHash(graph) {
  // Sort edges to ensure consistent ordering
  const sortedEdges = [...graph.edges].sort((a, b) =>
    a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])
  );

  // Create a compact representation
  return sortedEdges.map((edge) => `${edge[0]}->${edge[1]}`).join(";");
}

/**
 * Generate a unique identifier for a set of nodes
 */
function generateGraphId(nodes) {
  // Sort nodes for consistent ID
  return Array.from(nodes).sort().join("_");
}

/**
 * Store the topological ordering in MongoDB with optimized document structure
 * Updates the existing document rather than creating a new one
 */
async function storeTopologicalOrder(
  graph,
  sortedAttributes,
  changedAttributes = []
) {
  try {
    const db = await connectToMongoDB();
    const topoOrderCollection = db.collection(process.env.CALCULATION_CACHE);

    // Create a unique identifier for this graph based on included nodes
    const graphId = generateGraphId(graph.nodes);

    // Generate a compact hash of the graph structure
    const edgesHash = generateGraphHash(graph);

    // Create dependency maps for quick lookups
    const dependencyMaps = {};
    for (const node of graph.nodes) {
      if (graph.dependencyMap[node]) {
        dependencyMaps[node] = {
          inputs: graph.dependencyMap[node].inputs || [],
          calculationId: graph.dependencyMap[node].calculationId,
        };
      }
    }

    // Find the existing document
    const existingDoc = await topoOrderCollection.findOne({ graphId });

    // Update fields
    const updateDoc = {
      sortedAttributes,
      nodeCount: graph.nodes.size,
      edgesHash,
      dependencies: dependencyMaps,
      lastUpdated: new Date(),
      needsRecalculation: false,
    };

    // Add changed attributes information
    if (changedAttributes && changedAttributes.length > 0) {
      updateDoc.changedAttributes = changedAttributes;
      updateDoc.lastChangedAt = new Date();
    }

    if (existingDoc) {
      // Update existing document
      await topoOrderCollection.updateOne({ graphId }, { $set: updateDoc });
    } else {
      // Create new document if none exists
      await topoOrderCollection.insertOne({
        graphId,
        ...updateDoc,
        createdAt: new Date(),
      });
    }

    return graphId;
  } catch (err) {
    console.error("Error storing topological order:", err);
    throw err;
  }
}

/**
 * Retrieve the stored topological ordering if available with optimized lookup
 */
async function getStoredTopologicalOrder(graph) {
  try {
    const db = await connectToMongoDB();
    const topoOrderCollection = db.collection(process.env.CALCULATION_CACHE);

    // Create the same identifier used in storeTopologicalOrder
    const graphId = generateGraphId(graph.nodes);

    // Get the current edges hash
    const currentEdgesHash = generateGraphHash(graph);

    // Try to find the stored topological order
    const storedOrder = await topoOrderCollection.findOne({
      graphId,
      edgesHash: currentEdgesHash, // Only use if the graph structure hasn't changed
      needsRecalculation: { $ne: true }, // Skip if marked for recalculation
    });

    return storedOrder ? storedOrder.sortedAttributes : null;
  } catch (err) {
    console.error("Error retrieving topological order:", err);
    return null;
  }
}

/**
 * Invalidate specific topological orders that depend on given attributes
 * Also records which attributes triggered the invalidation
 */
async function invalidateTopologicalOrders(attributes) {
  try {
    const db = await connectToMongoDB();
    const topoOrderCollection = db.collection(process.env.CALCULATION_CACHE);

    if (!Array.isArray(attributes) || attributes.length === 0) {
      return 0;
    }

    // Find topological orders that contain any of the affected attributes
    const result = await topoOrderCollection.updateMany(
      {
        sortedAttributes: { $in: attributes },
      },
      {
        $set: {
          needsRecalculation: true,
          invalidatedAt: new Date(),
          invalidatedBy: attributes,
        },
      }
    );

    return result.modifiedCount;
  } catch (err) {
    console.error("Error invalidating topological orders:", err);
    return 0;
  }
}

/**
 * Optimized version of performOperations that doesn't trigger redundant calculations
 */

function getFrequencyWeight(frequency) {
  if (frequency === "M") return 3;
  if (frequency === "D") return 2;
  if (frequency.endsWith("H")) return 1; // All H variants have the same base weight
  return 0; // Default for unknown frequencies
}

function compareFrequencies(freq1, freq2) {
  const weight1 = getFrequencyWeight(freq1);
  const weight2 = getFrequencyWeight(freq2);

  if (weight1 === weight2) return "equal";
  if (weight1 > weight2) return "greater";
  return "lesser";
}


// converting into milliseconds
const MS_CONSTANTS = {
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
};

// Parse frequency string to milliseconds and unit info
function parseFrequencyToMs(frequency) {
  const freqStr = String(frequency).trim();
  const simpleFormats = {
    M: { unit: "month", value: 1, ms: null },
    D: { unit: "day", value: 1, ms: MS_CONSTANTS.DAY },
    H: { unit: "hour", value: 1, ms: MS_CONSTANTS.HOUR },
    Min: { unit: "minute", value: 1, ms: MS_CONSTANTS.MINUTE },
  };

  if (simpleFormats[freqStr]) return simpleFormats[freqStr];

  const match = freqStr.match(/^(\d+)(H|Min|D|M)$/i);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const unitMap = {
      h: { unit: "hour", ms: MS_CONSTANTS.HOUR * value },
      min: { unit: "minute", ms: MS_CONSTANTS.MINUTE * value },
      d: { unit: "day", ms: MS_CONSTANTS.DAY * value },
      m: { unit: "month", ms: null },
    };
    if (unitMap[unit]) return { ...unitMap[unit], value };
  }

  return { unit: "hour", value: 1, ms: MS_CONSTANTS.HOUR };
}

// Add time interval to a date
function addTimeInterval(date, frequencyInfo) {
  const newDate = new Date(date);
  if (frequencyInfo.unit === "month") {
    newDate.setUTCMonth(newDate.getUTCMonth() + frequencyInfo.value);
  } else {
    newDate.setTime(newDate.getTime() + frequencyInfo.ms);
  }
  return newDate;
}

// Get end date based on value frequency
function getEndDate(startDate, valueFreqInfo) {
  const endDate = new Date(startDate);
  if (valueFreqInfo.unit === "month") {
    endDate.setUTCMonth(endDate.getUTCMonth() + valueFreqInfo.value, 0);
    endDate.setUTCHours(23, 59, 59, 999);
  } else if (valueFreqInfo.unit === "day") {
    endDate.setUTCDate(endDate.getUTCDate() + valueFreqInfo.value - 1);
    endDate.setUTCHours(23, 59, 59, 999);
  } else {
    endDate.setTime(endDate.getTime() + valueFreqInfo.ms - 1);
  }
  return endDate;
}

// Dynamically normalize start date based on outputFreq and valueFreq
function normalizeStartDateDynamic(date, outputFreqInfo, valueFreqInfo) {
  const normalized = new Date(date);
  if (outputFreqInfo.unit === "month" || outputFreqInfo.unit === "day") {
    // Always start from beginning of month
    normalized.setUTCDate(1);
    normalized.setUTCHours(0, 0, 0, 0);
  } else if (outputFreqInfo.unit === "hour") {
    if (valueFreqInfo.unit === "month") {
      normalized.setUTCDate(1);
      normalized.setUTCHours(0, 0, 0, 0);
    } else if (valueFreqInfo.unit === "day") {
      // Start from 00:00 of day + outputFreq value (hours)
      normalized.setUTCHours(0, 0, 0, 0);
      // normalized.setTime(normalized.getTime() + (outputFreqInfo.value * MS_CONSTANTS.HOUR));
    } else {
      normalized.setUTCHours(0, 0, 0, 0);
    }
  } else if (outputFreqInfo.unit === "minute") {
    normalized.setUTCHours(0, 0, 0, 0);
  } else {
    normalized.setUTCHours(0, 0, 0, 0); // Fallback
  }
  return normalized;
}

// Generate frequency range dynamically
function generateFrequencyRange(outputFreq, valueFreq, startOfTriggeredDate) {
  const range = [];
  let currentDate = new Date(startOfTriggeredDate);
  if (isNaN(currentDate.getTime())) {
    console.error("Invalid date:", startOfTriggeredDate);
    return [];
  }

  try {
    const outputFreqInfo = parseFrequencyToMs(outputFreq);
    const valueFreqInfo = parseFrequencyToMs(valueFreq);
    currentDate = normalizeStartDateDynamic(
      currentDate,
      outputFreqInfo,
      valueFreqInfo
    );
    const endDate = getEndDate(new Date(startOfTriggeredDate), valueFreqInfo);

    let iterationDate = new Date(currentDate);
    let counter = 0,
      maxIterations = 100000;

    while (iterationDate <= endDate && counter < maxIterations) {
      range.push(new Date(iterationDate));
      iterationDate = addTimeInterval(iterationDate, outputFreqInfo);
      counter++;
    }
  } catch (err) {
    console.error("Error generating range:", err.message);
    return [];
  }

  return range;
}

// Format date range nicely
function formatDateRange(dateRange, frequency) {
  if (!dateRange || dateRange.length === 0) {
    return { start: null, end: null, values: [] };
  }

  const start = dateRange[0];
  const end = dateRange[dateRange.length - 1];
  const frequencyInfo = parseFrequencyToMs(frequency);
  const baseUnit = frequencyInfo.unit;

  const formatTemplates = {
    month: (d) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getUTCDate()).padStart(2, "0")}`,
    day: (d) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getUTCDate()).padStart(2, "0")}`,
    hour: (d) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getUTCDate()).padStart(2, "0")} ${String(
        d.getUTCHours()
      ).padStart(2, "0")}:00`,
    minute: (d) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getUTCDate()).padStart(2, "0")} ${String(
        d.getUTCHours()
      ).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
  };

  const formatter = formatTemplates[baseUnit] || formatTemplates.hour;
  const formattedValues = dateRange.map(formatter);

  return {
    start,
    end,
    formattedStart: formattedValues[0],
    formattedEnd: formattedValues[formattedValues.length - 1],
    values: formattedValues,
    count: formattedValues.length,
    frequency,
    baseUnit,
  };
}

// Main function
function processLessComparison(outputFreq, valueFreq, startOfTriggeredDate) {
  console.log(
    `Generating range for ${outputFreq} within ${valueFreq} starting from ${startOfTriggeredDate}`
  );
  const dateRange = generateFrequencyRange(
    outputFreq,
    valueFreq,
    startOfTriggeredDate
  );
  const formattedRange = formatDateRange(dateRange, outputFreq);
  console.log(`Generated ${formattedRange.count} intervals`);
  console.log(`Start: ${formattedRange.formattedStart}`);
  console.log(`End: ${formattedRange.formattedEnd}`);
  return formattedRange;
}

async function multiFreqhandling(
  group,
  attributeMap,
  registerMap,
  impactedAttrs,
  startOfTriggeredDate
) {
  try {
    const infix = [];
    const rawTokens = [];
    let finalExpression = [];
    for (let i = 0; i < group.length; i++) {
      const {
        calculationId,
        attribute,
        operator,
        register,
        constValue,
        offset,
      } = group[i];
      const next = group[i + 1];

      if (register && !attribute && operator !== "S") {
        const regVal = registerMap.get(register);

        console.log("regval", regVal);

        if (regVal !== undefined) {
          infix.push(operator, regVal);
          rawTokens.push(operator);
        } else {
          throw new Error(
            `Register value not found for ${calculationId}-${register}`
          );
        }
      }

      if (!attribute && constValue !== undefined && constValue !== null) {
        infix.push(",", constValue);
      } else if (!attribute) continue;
      const attrValue = attributeMap.get(attribute);

      if (typeof attrValue !== "number") {
        continue;
      }

      if (i === 0) {
        infix.push(attribute);
      } else if (operator === "S") {
        const expression = infix.join("");
        // finalExpression = `${attribute} = ${expression}`;
        finalExpression.push({
          outputAttribute: attribute,
          expression: expression,
        });
        infix.length = 0;
      } else {
        infix.push(",", attribute);
      }
    }

    const result = {};

    // Process each item in finalExpression
    finalExpression.forEach((item) => {
      const { outputAttribute, expression } = item;

      // Extract the frequency from outputAttribute (part after the underscore)
      const outputFrequency = outputAttribute.split("_").pop();

      // If this frequency doesn't exist in result yet, initialize it
      if (!result[outputFrequency]) {
        result[outputFrequency] = [];
      }

      // Split the expression by comma
      const expressionParts = expression.split(",");

      // Check each part against impactedAttrs
      expressionParts.forEach((part) => {
        if (impactedAttrs.has(part)) {
          // If there's a match, extract its frequency
          const matchedFrequency = part.split("_").pop();

          // Add to result if not already present
          if (!result[outputFrequency].includes(matchedFrequency)) {
            result[outputFrequency].push(matchedFrequency);
          }
        }
      });
    });
    // console.log(result);

    const comparisonResults = {};
    const groupsToReturn = [];

    // Iterate through each key in the result object
    for (const outputFreq in result) {
      comparisonResults[outputFreq] = [];

      // Process each value in the array
      result[outputFreq].forEach((valueFreq) => {
        const comparison = compareFrequencies(outputFreq, valueFreq);
        comparisonResults[outputFreq].push({
          value: valueFreq,
          comparison: comparison,
        });
        if (comparison === "equal" || comparison === "greater") {
          groupsToReturn.push({ group, startOfTriggeredDate });
        }

        // else if (comparison === "lesser") {
        else {
          // const range = processLessComparison("2H", "D", startOfTriggeredDate);
          const range = processLessComparison(
            outputFreq,
            valueFreq,
            startOfTriggeredDate
          );
          for (let varCount = 0; varCount < range.values.length; varCount++) {
            // const newStartOfTriggeredDate = new Date(range.values[varCount]);

            // console.log("date", newStartOfTriggeredDate);

            // const newTriggeredDate = new Date(
            //   Date.UTC(
            //     newStartOfTriggeredDate.getUTCFullYear(),
            //     newStartOfTriggeredDate.getUTCMonth(),
            //     newStartOfTriggeredDate.getUTCDate(),
            //     newStartOfTriggeredDate.getUTCHours(),
            //     newStartOfTriggeredDate.getUTCMinutes(),
            //     newStartOfTriggeredDate.getUTCSeconds(),
            //     newStartOfTriggeredDate.getUTCMilliseconds()
            //   )
            // );

            const dateStr = range.values[varCount]; // e.g. "2025-05-13 07:00"

            // If your string is in "YYYY-MM-DD HH:mm", split it
            const [datePart, timePart] = dateStr.split(" ");
            const [year, month, day] = datePart.split("-").map(Number);
            const [hour, minute] = timePart.split(":").map(Number);

            // Construct Date in UTC
            const newTriggeredDate = new Date(
              Date.UTC(year, month - 1, day, hour, minute)
            );

            groupsToReturn.push({ group, newTriggeredDate });
          }
        }
      });
    }

    return groupsToReturn;
  } catch (err) {
    console.error("Error invalidating topological orders:", err);
    return 0;
  }
}

async function performOperationsOptimized(
  groups,
  processedAttributes = new Set(),
  graph = null,
  triggeredCalcDate,
  impactedAttrs
) {
  const db = await connectToMongoDB();

  const attributeCollection = db.collection(
    process.env.ATTRIBUTE_VALUE_COLLECTION
  );
  const stepCollection = db.collection(
    process.env.CALCULATION_STEPS_COLLECTION
  );

  const results = [];
  const offsetAttr = new Map();
  const freqAttr = new Map();
  const stepQueries = [];

  let attributes1 = []; // Declare attributes1 here to ensure it's defined

  // Convert to UTC date to ensure global standardization
  const triggeredDate = new Date(triggeredCalcDate);

  // Create start of day in UTC
  let startOfTriggeredDate = new Date(
    Date.UTC(
      triggeredDate.getUTCFullYear(),
      triggeredDate.getUTCMonth(),
      triggeredDate.getUTCDate(),
      triggeredDate.getUTCHours(),
      triggeredDate.getUTCMinutes(),
      triggeredDate.getUTCSeconds(),
      triggeredDate.getUTCMilliseconds()
    )
  );

  // First, gather all attributes and registers
  for (const group of groups) {
    for (const step of group) {
      if (step.attribute) {
        const stepAttributeFreq = step.attribute;
        const stepOffset = step.offset || 0;
        offsetAttr.set(stepAttributeFreq, stepOffset);
        freqAttr.set(stepAttributeFreq, stepAttributeFreq);

        // Create offset dates using UTC to ensure global standardization
        const offsetStartTriggeredDate = new Date(startOfTriggeredDate);
        offsetStartTriggeredDate.setUTCDate(
          offsetStartTriggeredDate.getUTCDate() + stepOffset
        );

        const offsetStartTriggeredMonth = new Date(startOfTriggeredDate);
        offsetStartTriggeredMonth.setUTCMonth(
          offsetStartTriggeredMonth.getUTCMonth() + stepOffset
        );

        const offsetStartTriggeredHours = new Date(startOfTriggeredDate);
        offsetStartTriggeredHours.setUTCHours(
          offsetStartTriggeredHours.getUTCHours() + stepOffset
        );
        const attributeQueryResult = await attributeCollection
          .find({
            attributeFreq: stepAttributeFreq,
            $expr: {
              $switch: {
                branches: [
                  // Daily frequency match: only compare date (YYYY-MM-DD)
                  {
                    case: { $eq: ["$frequency", "D"] },
                    then: {
                      $eq: [
                        {
                          $dateToString: {
                            format: "%Y-%m-%d",
                            date: { $toDate: "$createdOn" },
                            timezone: "UTC",
                          },
                        },
                        {
                          $dateToString: {
                            format: "%Y-%m-%d",
                            date: offsetStartTriggeredDate,
                            timezone: "UTC",
                          },
                        },
                      ],
                    },
                  },
                  // Monthly frequency match: match both month and year
                  {
                    case: { $eq: ["$frequency", "M"] },
                    then: {
                      $and: [
                        {
                          $eq: [
                            {
                              $month: {
                                $dateFromString: {
                                  dateString: "$createdOn",
                                  timezone: "UTC",
                                },
                              },
                            },
                            { $month: { $toDate: offsetStartTriggeredMonth } },
                          ],
                        },
                        {
                          $eq: [
                            {
                              $year: {
                                $dateFromString: {
                                  dateString: "$createdOn",
                                  timezone: "UTC",
                                },
                              },
                            },
                            { $year: { $toDate: offsetStartTriggeredMonth } },
                          ],
                        },
                      ],
                    },
                  },
                  // Hour-based frequency match (handles H, 1H, 2H, 3H, etc.)
                  {
                    case: {
                      $regexMatch: { input: "$frequency", regex: /^\d*H$/ },
                    },
                    then: {
                      $and: [
                        // First ensure we're on the same day
                        {
                          $eq: [
                            {
                              $dateToString: {
                                format: "%Y-%m-%d",
                                date: { $toDate: "$createdOn" },
                                timezone: "UTC",
                              },
                            },
                            {
                              $dateToString: {
                                format: "%Y-%m-%d",
                                date: offsetStartTriggeredHours,
                                timezone: "UTC",
                              },
                            },
                          ],
                        },
                        // Then compare hour counters
                        {
                          $eq: [
                            "$counter",
                            {
                              $let: {
                                vars: {
                                  hourFreqNumber: {
                                    $convert: {
                                      input: {
                                        $replaceAll: {
                                          input: "$frequency",
                                          find: "H",
                                          replacement: "",
                                        },
                                      },
                                      to: "int",
                                      onError: 1,
                                      onNull: 1,
                                    },
                                  },
                                  hour: { $hour: { $toDate: "$createdOn" } },
                                },
                                in: {
                                  $floor: {
                                    $divide: ["$$hour", "$$hourFreqNumber"],
                                  },
                                },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                ],
                default: false,
              },
            },
          })
          .toArray();

        // Append to attributes1 array instead of destructuring
        attributes1 = attributes1.concat(attributeQueryResult);
      }

      if (step.register && !step.attribute && step.operator !== "S") {
        stepQueries.push({
          calculationId: step.calculationId,
          register: step.register,
        });
      }
    }
  }

  const registerSteps =
    stepQueries.length > 0
      ? await stepCollection.find({ $or: stepQueries }).toArray()
      : [];

  const attributeMap = new Map(
    attributes1.map((attr) => [attr.attributeFreq, attr.value])
  );

  const registerMap = new Map(
    registerSteps
      .filter((r) => r.value !== undefined)
      .map((r) => [r.register, r.value])
  );

  const attributeUpdates = [];
  const stepUpdates = [];
  const outputAttributeIds = [];

  // Process immediate calculations first
  for (let group of groups) {
    const infix = [];
    const rawTokens = [];
    let lastAttributeId = null;

    const updatedGroups = await multiFreqhandling(
      group,
      attributeMap,
      registerMap,
      impactedAttrs,
      startOfTriggeredDate
    );

    // console.log("up", updatedGroups);

    // const triggerGroup = updatedGroups[0];

    for (let upGrp = 0; upGrp < updatedGroups.length; upGrp++) {
      group = updatedGroups[upGrp].group;

      startOfTriggeredDate = updatedGroups[upGrp].startOfTriggeredDate;

      for (let i = 0; i < group.length; i++) {
        const {
          calculationId,
          attribute,
          operator,
          register,
          constValue,
          offset,
        } = group[i];
        const next = group[i + 1];

        const offsetStartTriggeredDate = new Date(startOfTriggeredDate);
        offsetStartTriggeredDate.setUTCDate(
          offsetStartTriggeredDate.getUTCDate() + offset
        );

        const offsetStartTriggeredMonth = new Date(startOfTriggeredDate);
        offsetStartTriggeredMonth.setUTCMonth(
          offsetStartTriggeredMonth.getUTCMonth() + offset
        );

        const offsetStartTriggeredHours = new Date(startOfTriggeredDate);
        offsetStartTriggeredHours.setUTCHours(
          offsetStartTriggeredHours.getUTCHours() + offset
        );

        if (register && !attribute && operator !== "S") {
          const regVal = registerMap.get(register);
          if (regVal !== undefined) {
            infix.push(operator, regVal);
            rawTokens.push(operator);
          } else {
            throw new Error(
              `Register value not found for ${calculationId}-${register}`
            );
          }
        }

        if (!attribute && constValue !== undefined && constValue !== null) {
          infix.push(operator, constValue);
          rawTokens.push(operator, constValue);
        } else if (!attribute) continue;

        const attrValue = attributeMap.get(attribute);

        if (typeof attrValue !== "number") {
          continue;
        }

        lastAttributeId = attribute;

        if (i === 0) {
          infix.push(attrValue);
          rawTokens.push(attribute);
        } else if (operator === "S") {
          const expression = infix.join(" ");
          const evaluated = math.evaluate(expression);

          attributeMap.set(lastAttributeId, evaluated);

          attributeUpdates.push({
            updateOne: {
              filter: {
                attributeFreq: lastAttributeId,
                // frequency: lastAttributeFreq,
                $expr: {
                  $switch: {
                    branches: [
                      // Daily frequency match: only compare date (YYYY-MM-DD)
                      {
                        case: { $eq: ["$frequency", "D"] },
                        then: {
                          $eq: [
                            {
                              $dateToString: {
                                format: "%Y-%m-%d",
                                date: { $toDate: "$createdOn" },
                                timezone: "UTC",
                              },
                            },
                            {
                              $dateToString: {
                                format: "%Y-%m-%d",
                                date: offsetStartTriggeredDate,
                                timezone: "UTC",
                              },
                            },
                          ],
                        },
                      },
                      // Monthly frequency match: match both month and year
                      {
                        case: { $eq: ["$frequency", "M"] },
                        then: {
                          $and: [
                            {
                              $eq: [
                                {
                                  $month: {
                                    $dateFromString: {
                                      dateString: "$createdOn",
                                      timezone: "UTC",
                                    },
                                  },
                                },
                                {
                                  $month: {
                                    $toDate: offsetStartTriggeredMonth,
                                  },
                                },
                              ],
                            },
                            {
                              $eq: [
                                {
                                  $year: {
                                    $dateFromString: {
                                      dateString: "$createdOn",
                                      timezone: "UTC",
                                    },
                                  },
                                },
                                {
                                  $year: { $toDate: offsetStartTriggeredMonth },
                                },
                              ],
                            },
                          ],
                        },
                      },
                      // Hour-based frequency match (handles H, 1H, 2H, 3H, etc.)
                      {
                        case: {
                          $regexMatch: { input: "$frequency", regex: /^\d*H$/ },
                        },
                        then: {
                          $and: [
                            // First ensure we're on the same day
                            {
                              $eq: [
                                {
                                  $dateToString: {
                                    format: "%Y-%m-%d",
                                    date: { $toDate: "$createdOn" },
                                    timezone: "UTC",
                                  },
                                },
                                {
                                  $dateToString: {
                                    format: "%Y-%m-%d",
                                    date: offsetStartTriggeredHours,
                                    timezone: "UTC",
                                  },
                                },
                              ],
                            },
                            // Then compare hour counters
                            {
                              $eq: [
                                "$counter",
                                {
                                  $let: {
                                    vars: {
                                      hourFreqNumber: {
                                        $convert: {
                                          input: {
                                            $replaceAll: {
                                              input: "$frequency",
                                              find: "H",
                                              replacement: "",
                                            },
                                          },
                                          to: "int",
                                          onError: 1,
                                          onNull: 1,
                                        },
                                      },
                                      hour: {
                                        $hour: { $toDate: "$createdOn" },
                                      },
                                    },
                                    in: {
                                      $floor: {
                                        $divide: ["$$hour", "$$hourFreqNumber"],
                                      },
                                    },
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      },
                    ],
                    default: false,
                  },
                },
              },
              update: { $set: { value: evaluated } },
              // upsert: true
            },
          });

          if (next?.operator === "S" && next.register) {
            stepUpdates.push({
              updateOne: {
                filter: { _id: next._id },
                update: { $set: { value: evaluated } },
              },
            });
          }

          results.push({
            attributeFreq: lastAttributeId,
            expression: `${lastAttributeId} = ${expression}`,
            result: evaluated,
          });

          outputAttributeIds.push(lastAttributeId);

          // Mark attribute as processed
          processedAttributes.add(lastAttributeId);

          infix.length = 0;
          rawTokens.length = 0;
        } else {
          infix.push(operator, attrValue);
          rawTokens.push(operator, attribute);
        }
      }
    }
    const finalAttrbuteFreq =
      attributeUpdates[0].updateOne.filter.attributeFreq;
    const finalStepCollection = await stepCollection.findOne({
      attribute: finalAttrbuteFreq,
    });

    if (
      (finalStepCollection && finalStepCollection.calcReTrigInd === true) ||
      finalStepCollection.calcTrigInd === true
    ) {
      const test = await attributeCollection.bulkWrite(attributeUpdates);
      // console.log(test);
    }

    // else if (
    //   finalStepCollection &&
    //   finalStepCollection.calcTrigInd === true
    // ) {
    //   // Convert your updates to use upsert
    //   // const upsertUpdates = attributeUpdates.map((update) => {
    //   //   if (update.updateOne) {
    //   //     return {
    //   //       updateOne: {
    //   //         filter: update.updateOne.filter,
    //   //         update: update.updateOne.update,
    //   //         upsert: true, // Enable upsert
    //   //       },
    //   //     };
    //   //   }
    //   // });

    //   // if (upsertUpdates.length > 0) {
    //   //   const test = await attributeCollection.bulkWrite(upsertUpdates);
    //   //   console.log(test);
    //   // }

    //   const upsertUpdates = [];

    //   for (const update of attributeUpdates) {
    //     const { filter, update: updateData } = update.updateOne;

    //     // Check if filter contains $expr
    //     if (filter.$expr) {
    //       // Manually split out the filter (without $expr)
    //       const baseFilter = { attributeFreq: filter.attributeFreq }; // Add other base fields if needed
    //       const exprQuery = { $expr: filter.$expr };

    //       // Find a matching document using the base filter + $expr
    //       const existingDoc = await attributeCollection.findOne({
    //         ...baseFilter,
    //         ...exprQuery,
    //       });

    //       if (existingDoc) {
    //         // Match found, perform an updateOne on the matched _id
    //         upsertUpdates.push({
    //           updateOne: {
    //             filter: { _id: existingDoc._id },
    //             update: updateData,
    //           },
    //         });
    //       } else {
    //         // No match found, prepare insertOne
    //         // Construct the new document based on your update content
    //         console.log(filter);

    //         const insertDoc = {
    //           attributeFreq: filter.attributeFreq,
    //           frequency: extractFrequency(updateData), // Extract frequency if possible
    //           createdOn: new Date(), // Use your offsetStartTriggered date if needed
    //           counter: extractCounter(updateData), // Extract counter if needed
    //           value: updateData.$set.value,
    //         };
    //         upsertUpdates.push({
    //           insertOne: { document: insertDoc },
    //         });
    //       }
    //     } else {
    //       // No $expr in filter, can use upsert directly
    //       upsertUpdates.push({
    //         updateOne: {
    //           filter,
    //           update: updateData,
    //           upsert: true,
    //         },
    //       });
    //     }
    //   }

    //   // Finally, execute the bulkWrite
    //   if (upsertUpdates.length > 0) {
    //     // const result = await attributeCollection.bulkWrite(upsertUpdates);
    //     // console.log(result);
    //   }

    //   // Optional: Helper functions to extract fields
    //   function extractFrequency(updateData) {
    //     // You may need to pass in frequency from your context, or extract from updateData
    //     return updateData.$set.frequency || "D"; // Default to 'D', adjust as needed
    //   }

    //   function extractCounter(updateData) {
    //     return updateData.$set.counter || 0; // Default to 0, adjust as needed
    //   }
    // }
  }

  if (stepUpdates.length) {
    await stepCollection.bulkWrite(stepUpdates);
  }

  return results;
}

async function newPerformOperations(
  calcMapping,
  triggeredCalcDate,
  impactedAttrs
) {
  try {
    const db = await connectToMongoDB();
    const attributeCollectionName = db.collection(
      process.env.ATTRIBUTE_VALUE_COLLECTION
    );
    const inputAttributeList = calcMapping.inputAttributeList;

    const matchedFrequencies = new Set();

    const results = [];

    // Check each key in inputAttributeList against impactedAttr
    for (const inputKey of Object.keys(inputAttributeList)) {
      if (impactedAttrs.has(inputKey)) {
        // Split by underscore to get the frequency
        const parts = inputKey.split("_");
        if (parts.length > 1) {
          matchedFrequencies.add(parts[1]);
        }
      }
    }

    // Get output attribute frequencies
    const outputFrequencies = new Set();
    for (const output of Object.values(calcMapping.outputJsonSchema)) {
      if (output.frequency) {
        outputFrequencies.add(output.frequency);
      }
    }

    // Create the result object mapping output frequencies to matched frequencies
    const result = {};
    for (const outputFreq of outputFrequencies) {
      result[outputFreq] = [...matchedFrequencies];
    }

    // console.log(result);
    const triggeredDate = new Date(triggeredCalcDate);

    let startOfTriggeredDate = new Date(
      Date.UTC(
        triggeredDate.getUTCFullYear(),
        triggeredDate.getUTCMonth(),
        triggeredDate.getUTCDate(),
        triggeredDate.getUTCHours(),
        triggeredDate.getUTCMinutes(),
        triggeredDate.getUTCSeconds(),
        triggeredDate.getUTCMilliseconds()
      )
    );
    const comparisonResults = {};
    const groupsToReturn = [];

    // Iterate through each key in the result object
    for (const outputFreq in result) {
      comparisonResults[outputFreq] = [];

      // Process each value in the array
      result[outputFreq].forEach((valueFreq) => {
        const comparison = compareFrequencies(outputFreq, valueFreq);
        // console.log(outputFreq, valueFreq);

        comparisonResults[outputFreq].push({
          value: valueFreq,
          comparison: comparison,
        });
        if (comparison === "equal" || comparison === "greater") {
          groupsToReturn.push({ calcMapping, startOfTriggeredDate });
        }

        // else if (comparison === "lesser") {
        else {
          // const range = processLessComparison("2H", "D", startOfTriggeredDate);

          const range = processLessComparison(
            outputFreq,
            valueFreq,
            startOfTriggeredDate
          );
          for (let varCount = 0; varCount < range.values.length; varCount++) {
            const newStartOfTriggeredDate = new Date(range.values[varCount]);

            const newTriggeredDate = new Date(
              Date.UTC(
                newStartOfTriggeredDate.getUTCFullYear(),
                newStartOfTriggeredDate.getUTCMonth(),
                newStartOfTriggeredDate.getUTCDate(),
                newStartOfTriggeredDate.getUTCHours(),
                newStartOfTriggeredDate.getUTCMinutes(),
                newStartOfTriggeredDate.getUTCSeconds(),
                newStartOfTriggeredDate.getUTCMilliseconds()
              )
            );

            startOfTriggeredDate = newStartOfTriggeredDate;

            groupsToReturn.push({ calcMapping, startOfTriggeredDate });
          }
        }
      });
    }

    for (let upGrp = 0; upGrp < groupsToReturn.length; upGrp++) {
      const inputAttrMap = groupsToReturn[upGrp].calcMapping.inputJsonSchema;
      const output = {};
      const offsetAttr = {};
      for (const key in inputAttrMap) {
        let { attribute, frequency, offset } = inputAttrMap[key];
        attribute = `${attribute}_${frequency}`;
        output[key] = { attribute };
        offsetAttr[attribute] = offset;
      }

      const inputKeys = Object.keys(inputAttrMap);
      const attributeIds = inputKeys.map((key) => output[key].attribute);

      // const triggeredDate = new Date(triggeredCalcDate);
      // const startOfTriggeredDate = new Date(
      //   Date.UTC(
      //     triggeredDate.getUTCFullYear(),
      //     triggeredDate.getUTCMonth(),
      //     triggeredDate.getUTCDate(),
      //     triggeredDate.getUTCHours(),
      //     triggeredDate.getUTCMinutes(),
      //     triggeredDate.getUTCSeconds(),
      //     triggeredDate.getUTCMilliseconds()
      //   )
      // );

      const attributeQueries = [];

      startOfTriggeredDate = groupsToReturn[upGrp].startOfTriggeredDate;

      for (let attribute in attributeIds) {
        const attributeId = attributeIds[attribute];
        const attributeOffset = offsetAttr[attributeId];

        const offsetStartTriggeredDate = new Date(startOfTriggeredDate);
        offsetStartTriggeredDate.setUTCDate(
          offsetStartTriggeredDate.getUTCDate() + attributeOffset
        );

        const offsetStartTriggeredMonth = new Date(startOfTriggeredDate);
        offsetStartTriggeredMonth.setUTCMonth(
          offsetStartTriggeredMonth.getUTCMonth() + attributeOffset
        );

        const offsetStartTriggeredHours = new Date(startOfTriggeredDate);
        offsetStartTriggeredHours.setUTCHours(
          offsetStartTriggeredHours.getUTCHours() + attributeOffset
        );
        
        let filter = {
          attributeFreq: attributeId,
          $expr: {
            $switch: {
              branches: [
                // Daily frequency match: only compare date (YYYY-MM-DD)
                {
                  case: { $eq: ["$frequency", "D"] },
                  then: {
                    $eq: [
                      {
                        $dateToString: {
                          format: "%Y-%m-%d",
                          date: { $toDate: "$createdOn" },
                          timezone: "UTC",
                        },
                      },
                      {
                        $dateToString: {
                          format: "%Y-%m-%d",
                          date: startOfTriggeredDate,
                          timezone: "UTC",
                        },
                      },
                    ],
                  },
                },
                // Monthly frequency match: match both month and year
                {
                  case: { $eq: ["$frequency", "M"] },
                  then: {
                    $and: [
                      {
                        $eq: [
                          {
                            $month: {
                              $dateFromString: {
                                dateString: "$createdOn",
                                timezone: "UTC",
                              },
                            },
                          },
                          { $month: { $toDate: startOfTriggeredDate } },
                        ],
                      },
                      {
                        $eq: [
                          {
                            $year: {
                              $dateFromString: {
                                dateString: "$createdOn",
                                timezone: "UTC",
                              },
                            },
                          },
                          { $year: { $toDate: startOfTriggeredDate } },
                        ],
                      },
                    ],
                  },
                },
                // Hour-based frequency match (handles H, 1H, 2H, 3H, etc.)
                {
                  case: {
                    $regexMatch: { input: "$frequency", regex: /^\d*H$/ },
                  },
                  then: {
                    $and: [
                      // First ensure we're on the same day
                      {
                        $eq: [
                          {
                            $dateToString: {
                              format: "%Y-%m-%d",
                              date: { $toDate: "$createdOn" },
                              timezone: "UTC",
                            },
                          },
                          {
                            $dateToString: {
                              format: "%Y-%m-%d",
                              date: startOfTriggeredDate,
                              timezone: "UTC",
                            },
                          },
                        ],
                      },
                      // Then compare hour counters
                      {
                        $eq: [
                          "$counter",
                          {
                            $let: {
                              vars: {
                                hourFreqNumber: {
                                  $convert: {
                                    input: {
                                      $replaceAll: {
                                        input: "$frequency",
                                        find: "H",
                                        replacement: "",
                                      },
                                    },
                                    to: "int",
                                    onError: 1,
                                    onNull: 1,
                                  },
                                },
                                hour: { $hour: { $toDate: "$createdOn" } },
                              },
                              in: {
                                $floor: {
                                  $divide: ["$$hour", "$$hourFreqNumber"],
                                },
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
              default: false,
            },
          },
        };
        attributeQueries.push(filter);
      }


      const attributeDocs =
        attributeQueries.length > 0
          ? await attributeCollectionName
              .find({ $or: attributeQueries })
              .toArray()
          : [];

      const attributeValueMap = new Map(
        attributeDocs.map((doc) => [doc.attributeFreq.toString(), doc.value])
      );
      
      
      const bulkOps = [];

      const outputKeys = Object.keys(
        groupsToReturn[upGrp].calcMapping.outputJsonSchema
      );
      
      const compiledScripts = {};

      for (const outputKey of outputKeys) {
        const jsCode =
          groupsToReturn[upGrp].calcMapping.jsLogic[outputKey];
  
        compiledScripts[outputKey] = new vm.Script(`
        result = (function() {
          ${jsCode};
        })();
      `);
      }
   
      const baseContext = {};

      for (const key of inputKeys) {
        const attrId = output[key].attribute;
        const value = attributeValueMap.get(attrId);

        // if (value === undefined) {
        //   throw new Error(
        //     `Missing or invalid value for attribute ${key} (${attrId})`
        //   );
        // }        

        baseContext[key] = value;
      }

      for (const outputKey of outputKeys) {
        const lastAttributeFreq =
          calcMapping.outputJsonSchema[outputKey].frequency;
        const outputAttrId =
          calcMapping.outputJsonSchema[outputKey].attribute +
          "_" +
          lastAttributeFreq;
        const outputOffsetId = calcMapping.outputJsonSchema[outputKey].offset;

        const context = {
          ...baseContext,
          result: null,
        };
        
        try {
          vm.createContext(context);
          compiledScripts[outputKey].runInContext(context);
          
          // Serialize result safely,

          let safeResult;
          try {
            safeResult = JSON.parse(JSON.stringify(context[outputKey]));
          } catch (e) {
            throw new Error(
              `Result for ${outputKey} is not serializable: ${e.message}`
            );
          }

          // Optional: Validate primitive result types only
          if (
            typeof safeResult !== "string" &&
            typeof safeResult !== "number" &&
            typeof safeResult !== "boolean" &&
            safeResult !== null
          ) {
            throw new Error(
              `Invalid result type for ${outputKey}: must be a primitive value or null`
            );
          }


          results.push({
            attributeFreq: outputAttrId,
            expression:
              groupsToReturn[upGrp].calcMapping.jsLogic[outputKey],
            result: safeResult,
            outputAttr: outputKey
          });

          const offsetStartTriggeredDate = new Date(startOfTriggeredDate);
          offsetStartTriggeredDate.setUTCDate(
            offsetStartTriggeredDate.getUTCDate() + outputOffsetId
          );

          const offsetStartTriggeredMonth = new Date(startOfTriggeredDate);
          offsetStartTriggeredMonth.setUTCMonth(
            offsetStartTriggeredMonth.getUTCMonth() + outputOffsetId
          );

          const offsetStartTriggeredHours = new Date(startOfTriggeredDate);
          offsetStartTriggeredHours.setUTCHours(
            offsetStartTriggeredHours.getUTCHours() + outputOffsetId
          );
          

          bulkOps.push({
            updateOne: {
              filter: {
                attributeFreq: outputAttrId,
                $expr: {
                  $switch: {
                    branches: [
                      // Daily frequency match: only compare date (YYYY-MM-DD)
                      {
                        case: { $eq: ["$frequency", "D"] },
                        then: {
                          $eq: [
                            {
                              $dateToString: {
                                format: "%Y-%m-%d",
                                date: { $toDate: "$createdOn" },
                                timezone: "UTC",
                              },
                            },
                            {
                              $dateToString: {
                                format: "%Y-%m-%d",
                                date: startOfTriggeredDate,
                                timezone: "UTC",
                              },
                            },
                          ],
                        },
                      },
                      // Monthly frequency match: match both month and year
                      {
                        case: { $eq: ["$frequency", "M"] },
                        then: {
                          $and: [
                            {
                              $eq: [
                                {
                                  $month: {
                                    $dateFromString: {
                                      dateString: "$createdOn",
                                      timezone: "UTC",
                                    },
                                  },
                                },
                                {
                                  $month: {
                                    $toDate: startOfTriggeredDate,
                                  },
                                },
                              ],
                            },
                            {
                              $eq: [
                                {
                                  $year: {
                                    $dateFromString: {
                                      dateString: "$createdOn",
                                      timezone: "UTC",
                                    },
                                  },
                                },
                                {
                                  $year: {
                                    $toDate: startOfTriggeredDate,
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      },
                      // Hour-based frequency match (handles H, 1H, 2H, 3H, etc.)
                      {
                        case: {
                          $regexMatch: {
                            input: "$frequency",
                            regex: /^\d*H$/,
                          },
                        },
                        then: {
                          $and: [
                            // First ensure we're on the same day
                            {
                              $eq: [
                                {
                                  $dateToString: {
                                    format: "%Y-%m-%d",
                                    date: { $toDate: "$createdOn" },
                                    timezone: "UTC",
                                  },
                                },
                                {
                                  $dateToString: {
                                    format: "%Y-%m-%d",
                                    date: startOfTriggeredDate,
                                    timezone: "UTC",
                                  },
                                },
                              ],
                            },
                            // Then compare hour counters
                            {
                              $eq: [
                                "$counter",
                                {
                                  $let: {
                                    vars: {
                                      hourFreqNumber: {
                                        $convert: {
                                          input: {
                                            $replaceAll: {
                                              input: "$frequency",
                                              find: "H",
                                              replacement: "",
                                            },
                                          },
                                          to: "int",
                                          onError: 1,
                                          onNull: 1,
                                        },
                                      },
                                      hour: {
                                        $hour: { $toDate: "$createdOn" },
                                      },
                                    },
                                    in: {
                                      $floor: {
                                        $divide: ["$$hour", "$$hourFreqNumber"],
                                      },
                                    },
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      },
                    ],
                    default: false,
                  },
                },
              },
              update: { $set: { value: safeResult } },
            },
          });
        } catch (err) {
          throw new Error(
            `Error evaluating JavaScript for ${outputKey}: ${err.message}`
          );
        }
      }

      if (bulkOps.length > 0) {
        await attributeCollectionName.bulkWrite(bulkOps);
      }
    }

    return results;
  } catch (err) {
    console.error("Error in newPerformOperations:", err);
    return {
      token: "500",
      response: "Calculation failed",
      error: err.message,
    };
  }
}

export default {
  getCalculation,
  segregateOperations,
  detectCyclesInGraph,
  topologicalSort,
  performOperationsOptimized,
  storeTopologicalOrder,
  getStoredTopologicalOrder,
  invalidateTopologicalOrders,
  generateGraphId,
  generateGraphHash,
  newPerformOperations,
};