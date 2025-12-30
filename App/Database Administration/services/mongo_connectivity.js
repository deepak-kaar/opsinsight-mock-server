import { MongoClient } from "mongodb";

/**
 * Execute a MongoDB query with provided credentials
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const execute_mongo_query = async function (req, res) {
  let client = null;

  try {
    const { username, password, host, port, database, query, queryType, collection } = req.body;

    // Validate required fields
    if (!username || !password || !host || !database || !query || !queryType || !collection) {
      return res.status(400).json({
        token: "400",
        response: "Missing required fields. Please provide: username, password, host, database, query, queryType, and collection",
      });
    }

    // Construct MongoDB connection URI
    const mongoURI = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port || 27017}/${database}?authSource=${database}`;

    // Create MongoDB client
    client = new MongoClient(mongoURI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    // Connect to MongoDB
    await client.connect();
    console.log("Connected to external MongoDB successfully");

    const db = client.db(database);
    const coll = db.collection(collection);

    let result;
    let parsedQuery;

    // Parse the query if it's a string
    try {
      parsedQuery = typeof query === 'string' ? JSON.parse(query) : query;
    } catch (parseError) {
      return res.status(400).json({
        token: "400",
        response: "Invalid query format. Query must be valid JSON",
        error: parseError.message,
      });
    }

    // Execute query based on queryType
    switch (queryType.toLowerCase()) {
      case 'find':
        const { filter = {}, projection = {}, limit = 0, skip = 0, sort = {} } = parsedQuery;
        result = await coll.find(filter, { projection })
          .skip(skip)
          .limit(limit)
          .sort(sort)
          .toArray();
        break;

      case 'findone':
        const { filter: findOneFilter = {}, projection: findOneProjection = {} } = parsedQuery;
        result = await coll.findOne(findOneFilter, { projection: findOneProjection });
        break;

      case 'aggregate':
        const { pipeline = [] } = parsedQuery;
        result = await coll.aggregate(pipeline).toArray();
        break;

      case 'count':
        const { filter: countFilter = {} } = parsedQuery;
        result = await coll.countDocuments(countFilter);
        break;

      case 'distinct':
        const { field, filter: distinctFilter = {} } = parsedQuery;
        if (!field) {
          return res.status(400).json({
            token: "400",
            response: "Field is required for distinct query",
          });
        }
        result = await coll.distinct(field, distinctFilter);
        break;

      case 'insertone':
        const { document } = parsedQuery;
        if (!document) {
          return res.status(400).json({
            token: "400",
            response: "Document is required for insertOne operation",
          });
        }
        result = await coll.insertOne(document);
        break;

      case 'insertmany':
        const { documents } = parsedQuery;
        if (!documents || !Array.isArray(documents)) {
          return res.status(400).json({
            token: "400",
            response: "Documents array is required for insertMany operation",
          });
        }
        result = await coll.insertMany(documents);
        break;

      case 'updateone':
        const { filter: updateFilter, update } = parsedQuery;
        if (!updateFilter || !update) {
          return res.status(400).json({
            token: "400",
            response: "Filter and update are required for updateOne operation",
          });
        }
        result = await coll.updateOne(updateFilter, update);
        break;

      case 'updatemany':
        const { filter: updateManyFilter, update: updateMany } = parsedQuery;
        if (!updateManyFilter || !updateMany) {
          return res.status(400).json({
            token: "400",
            response: "Filter and update are required for updateMany operation",
          });
        }
        result = await coll.updateMany(updateManyFilter, updateMany);
        break;

      case 'deleteone':
        const { filter: deleteFilter } = parsedQuery;
        if (!deleteFilter) {
          return res.status(400).json({
            token: "400",
            response: "Filter is required for deleteOne operation",
          });
        }
        result = await coll.deleteOne(deleteFilter);
        break;

      case 'deletemany':
        const { filter: deleteManyFilter } = parsedQuery;
        if (!deleteManyFilter) {
          return res.status(400).json({
            token: "400",
            response: "Filter is required for deleteMany operation",
          });
        }
        result = await coll.deleteMany(deleteManyFilter);
        break;

      default:
        return res.status(400).json({
          token: "400",
          response: `Unsupported query type: ${queryType}. Supported types: find, findOne, aggregate, count, distinct, insertOne, insertMany, updateOne, updateMany, deleteOne, deleteMany`,
        });
    }

    return res.status(200).json({
      token: "200",
      response: "Query executed successfully",
      data: result,
      queryType: queryType,
    });

  } catch (err) {
    console.error("Error executing MongoDB query:", err);

    // Handle specific MongoDB errors
    if (err.message.includes('Authentication failed')) {
      return res.status(401).json({
        token: "401",
        response: "Authentication failed. Please check username and password",
        error: err.message,
      });
    }

    if (err.message.includes('ECONNREFUSED')) {
      return res.status(503).json({
        token: "503",
        response: "Unable to connect to MongoDB server. Please check host and port",
        error: err.message,
      });
    }

    return res.status(500).json({
      token: "500",
      response: "Failed to execute MongoDB query",
      error: err.message,
    });
  } finally {
    // Always close the connection
    if (client) {
      try {
        await client.close();
        console.log("MongoDB connection closed");
      } catch (closeErr) {
        console.error("Error closing MongoDB connection:", closeErr);
      }
    }
  }
};

/**
 * Test MongoDB connection with provided credentials
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const test_mongo_connection = async function (req, res) {
  let client = null;

  try {
    const { username, password, host, port, database } = req.body;

    // Validate required fields
    if (!username || !password || !host || !database) {
      return res.status(400).json({
        token: "400",
        response: "Missing required fields. Please provide: username, password, host, and database",
      });
    }

    // Construct MongoDB connection URI
    const mongoURI = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port || 27017}/${database}?authSource=${database}`;

    // Create MongoDB client
    client = new MongoClient(mongoURI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    // Connect to MongoDB
    await client.connect();

    // Test the connection by running a simple command
    const db = client.db(database);
    await db.admin().ping();

    return res.status(200).json({
      token: "200",
      response: "MongoDB connection successful",
      database: database,
      host: host,
      port: port || 27017,
    });

  } catch (err) {
    console.error("Error testing MongoDB connection:", err);

    // Handle specific MongoDB errors
    if (err.message.includes('Authentication failed')) {
      return res.status(401).json({
        token: "401",
        response: "Authentication failed. Please check username and password",
        error: err.message,
      });
    }

    if (err.message.includes('ECONNREFUSED')) {
      return res.status(503).json({
        token: "503",
        response: "Unable to connect to MongoDB server. Please check host and port",
        error: err.message,
      });
    }

    return res.status(500).json({
      token: "500",
      response: "MongoDB connection test failed",
      error: err.message,
    });
  } finally {
    // Always close the connection
    if (client) {
      try {
        await client.close();
        console.log("MongoDB test connection closed");
      } catch (closeErr) {
        console.error("Error closing MongoDB connection:", closeErr);
      }
    }
  }
};

export default { execute_mongo_query, test_mongo_connection };
