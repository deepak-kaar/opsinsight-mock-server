import { connectToMongoDB } from '../../../config/connection.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const post_flag = async function (req, res, next) {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.FLAG_COLLECTION;

        const newObjectId = new ObjectId();

        const flagName = req.body.flagName;
        const existingName = await db.collection(collectionName).findOne({ flagName });

        if (existingName) {
            return res.status(400).json({
                token: '400',
                response: 'Name with the provided flagName already exists'
            });
        }

        const flagSchema = {
            _id: newObjectId,
            flagId: newObjectId.toHexString(),
            flagName: req.body.flagName,
            flagDesc: req.body.flagDesc,
            flagSeverity: req.body.flagSeverity,
            flagVariables: req.body.flagVariables,
            flagExpressions: req.body.flagExpressions,
            flagLevel: req.body.flagLevel,
            flagOrgLevel: req.body.flagOrgLevel,
            flagLevelName: req.body.flagLevelName,
            createdOn: new Date()
        };

        const result = await db.collection(collectionName).insertOne(flagSchema);
        return res.json({ token: '200', response: 'Successfully created in database', Flag: flagSchema });
    } catch (err) {
        console.error('Error creating entity:', err);
        return res.status(500).json({ token: '500', response: 'Failed to create entity', error: err.message });
    }
};

const validate_Flag = async function (req, res, next) {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.FLAG_COLLECTION;
        const attributeCollectionName = process.env.ATTRIBUTE_COLLECTION;
        const eventCollectionName = process.env.EVENT_COLLECTION;
        const sensorCollectionName = process.env.SENSOR_COLLECTION;

        const { flagId } = req.body;

        // Fetch the flag details from the database
        const payload = await db.collection(collectionName).findOne({ flagId: flagId });

        if (!payload) {
            console.log("Flag not found:", flagId);
            return res.status(404).json({ token: '404', response: 'Flag not found' });
        }

        // Operator map for condition evaluation
        const operatorMap = {
            greaterThan: (a, b) => a > b,
            lessThan: (a, b) => a < b,
            greaterThanOrEqual: (a, b) => a >= b,
            lessThanOrEqual: (a, b) => a <= b,
            equalTo: (a, b) => a === b,
            notEqualTo: (a, b) => a !== b,
        };

        // Fetch attribute values for flag variables
        const variableMap = {};
        for (const variable of payload.flagVariables) {
            const attribute = await db.collection(attributeCollectionName).findOne({ attributeId: variable.attribute });
            if (!attribute) {
                console.error(`Attribute not found for variable: ${variable.variableName}`);
                return res.status(404).json({ token: '404', response: `Attribute not found for variable: ${variable.variableName}` });
            }

            if (!attribute.sensorDetails) {
                return res.status(404).json({ token: '404', response: `sesnor not found for attribute: ${attribute.attributeId}` });
            }
            const sensorId = attribute.sensorDetails.sensorId;

            const sensorDocument = await db.collection(sensorCollectionName).findOne({ sensorId: sensorId });
            const sensorValue = parseInt(sensorDocument.currentValue);

            variableMap[variable.variableName] = sensorValue;
            // variableMap[variable.variableName] = attribute.value;
        }

        // Function to validate an individual condition
        function validateCondition(condition, variableMap) {
            const { variable, operator, valueType, valueOrVariable } = condition;

            var thresholdValue = valueOrVariable;

            if (valueType == "variable") {
                thresholdValue = variableMap[valueOrVariable];
            }

            comparisonValue = variableMap[variable];
            if (comparisonValue === undefined) {
                console.error(`Comparison value not found for variable: ${variable}`);
                return false;
            }
            return operatorMap[operator](comparisonValue, thresholdValue);
        }

        function performBooleanOperation(arr) {
            let result;
            let currentOperation = null;
            for (let i = 0; i < arr.length; i++) {
                const currentValue = arr[i];
                if (currentValue === '') continue;
                if (currentValue === true || currentValue === false) {
                    if (result === undefined) {
                        result = currentValue;
                    } else {
                        if (currentOperation === 'OR') {
                            result = result || currentValue;
                        } else if (currentOperation === 'AND') {
                            result = result && currentValue;
                        }
                    }
                } else if (currentValue === 'OR' || currentValue === 'AND') {
                    currentOperation = currentValue;
                }
            }
            return result;
        }

        // Function to evaluate conditions within an expression
        function evaluateConditions(conditions) {
            if (!conditions || conditions.length === 0) return true;
            let result = [];

            for (let i = 0; i < conditions.length; i++) {
                const isConditionMet = validateCondition(conditions[i], variableMap);
                result.push(isConditionMet, conditions[i].conditionalOperator);
            }
            const conditionResult = performBooleanOperation(result);
            // console.log(result);         
            return conditionResult;
        }

        // Function to evaluate a single expression
        function evaluateExpression(expression) {
            const { conditions } = expression;
            return evaluateConditions(conditions);
        }

        const expressionResultArray = [];

        for (let i = 0; i < payload.flagExpressions.length; i++) {
            const expression = payload.flagExpressions[i];
            const expressionResult = evaluateExpression(expression);
            expressionResultArray.push(expressionResult, expression.expressionOperator);
        }

        const flagResult = performBooleanOperation(expressionResultArray);
        // console.log(expressionResultArray);
        // Return the result based on overall flag evaluation
        if (flagResult) {
            const updateResult = await db
                .collection(eventCollectionName)
                .updateMany(
                    { flagID: flagId },
                    { $set: { event_status: 'ongoing_event' } }
                );
            return res.json({
                token: '200',
                response: 'Flag conditions met',
                flagSeverity: payload.flagSeverity,
                updateResult
            });
        } else {
            return res.json({
                token: '200',
                response: 'Flag conditions not met',
                flagSeverity: "No Flag"
            });
        }
    } catch (err) {
        console.error('Error validating flag:', err);
        return res.status(500).json({
            token: '500',
            response: 'Failed to validate flag',
            error: err.message,
        });
    }
};

const get_flag = async function (req, res, next) {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.FLAG_COLLECTION;
        const appId = req.body.appId;
        const orgId = req.body.orgId;
        let filters = {}
        filters = {
            ...(appId && { flagLevelName: appId }),
            ...(orgId && { flagOrgLevel: orgId }),
            ...(!appId && !orgId && { flagLevel: 'Opsinsight' })
        };
        const projection = { flagId: 1, flagName: 1, flagDesc: 1, flagSeverity: 1, _id: 0 };
        const result = await db.collection(collectionName).find(filters, { projection }).toArray();
        if (result) {
            return res.json({ token: '200', flag: result });
        } else {
            return res.status(204).json({ error: 'flag not found' });
        }
    } catch (err) {
        console.error('Error fetching data from MongoDB:', err);
        return res.status(500).json({ error: 'Error fetching data from MongoDB', details: err.message });
    }
};

const get_template_ID = async function (req, res, next) {
    try {
        const db = await connectToMongoDB();
        const CollectionName = process.env.FLAG_COLLECTION;

        const flagId = req.params.id;

        if (!ObjectId.isValid(flagId)) {
            return res.status(204).json({ error: 'Invalid flagId' });
        }

        const flagJson = await db.collection(CollectionName).find({ flagId: flagId }).toArray();

        if (flagJson.length > 0) {
            return res.status(200).json({
                token: '200',
                response: 'Successfully fetched flagJson',
                flagJson
            });
        } else {
            return res.status(204).json({ error: 'No template found for this template Id' });
        }
    } catch (err) {
        console.error('Error fetching flagJson:', err);
        return res.status(500).json({
            error: 'Error fetching flagJson',
            details: err.message
        });
    }
};

const update_flag = async function (req, res, next) {
    try {
        const { flagId, flagName, flagDesc, flagSeverity, flagVariables, flagExpressions } = req.body;

        if (!flagId || flagId.trim() === "") {
            return res.status(204).json({
                token: '204',
                response: 'FlagID is required and cannot be empty'
            });
        }

        const db = await connectToMongoDB();
        const flagCollectionName = process.env.FLAG_COLLECTION;

        const existingFlag = await db.collection(flagCollectionName).findOne({ flagId });

        if (!existingFlag) {
            return res.status(204).json({
                token: '204',
                response: 'Flag not found with the provided flagId'
            });
        }

        const updatedFlagDetails = {
            flagName,
            flagDesc,
            flagSeverity,
            flagVariables,
            flagExpressions
        };

        const flagUpdateResult = await db.collection(flagCollectionName).updateOne(
            { flagId },
            { $set: updatedFlagDetails }
        );

        return res.json({
            token: '200',
            response: 'Successfully updated Flags in database',
            // flagUpdateResult
        });
    } catch (err) {
        console.error('Error updating in Flag:', err);
        return res.status(500).json({
            token: '500',
            response: 'Failed to flag',
            error: err.message
        });
    }
};

const delete_flag = async function (req, res, next) {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.FLAG_COLLECTION;

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ token: "400", response: "Invalid ID format" });
        }

        const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
            return res.json({ token: "200", id, response: "flag deleted successfully" });
        } else {
            return res.status(404).json({ token: "404", response: "flag not found" });
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
export default { post_flag, validate_Flag, get_flag, get_template_ID, update_flag, delete_flag }


