import { ObjectId } from 'mongodb';

const validators = {
  objectId: (value) => {
    if (!(value instanceof ObjectId)) {
      throw new Error("Field '_id' must be a valid ObjectId instance");
    }
    return value;
  },
  string: (value) => {
    if (typeof value !== 'string') throw new Error("must be a string");
    return value.trim();
  },
  number: (value) => {
    if (typeof value !== 'number') throw new Error("must be a number");
    return value;
  },
  bool: (value) => {
    if (typeof value !== 'boolean') throw new Error("must be a boolean");
    return value;
  },
};








export function  constructPayload (schema, body,col) {
    

    if(col=="DataSource")
    {
       const new_id=new ObjectId()
        body._id=new_id
        body.dataSourceId=new_id.toHexString();
        console.log("New DataSource ID assigned:", body.dataSourceId);
        console.log("New _id assigned:", body._id);
    }


  const payload = {};
  const errors = [];

  // 1️⃣ Required field validation
  for (const field of schema.requiredFields || []) {
    if (!(field in body)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // 2️⃣ Validate known fields dynamically
  for (const [field, type] of Object.entries(schema.validate || {})) {
    const value = body[field];

    if (value === undefined || value === null) continue;

    const validator = validators[type];
    if (!validator) {
      errors.push(`Unknown validator for field: ${field}`);
      continue;
    }

    try {
      payload[field] = validator(value);
    } catch (err) {
      errors.push(`Field '${field}' ${err.message}`);
    }
  }

  // 3️⃣ Apply default values
  for (const [key, val] of Object.entries(schema.defaultValues || {})) {
    if (payload[key] === undefined) payload[key] = val;
  }

  // 4️⃣ Merge additional custom (non-schema) fields safely
 // 4️⃣ Merge additional custom (non-schema) fields safely
if (body && typeof body === "object") {
  for (const [key, val] of Object.entries(body)) {
    if (!(key in (schema.validate || {}))) {
      payload[key] = val;
    }
  }
}


  return { payload, errors };
};


