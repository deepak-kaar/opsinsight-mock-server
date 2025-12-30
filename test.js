import express from 'express';
import { MongoClient } from 'mongodb';

const app = express();
app.use(express.json());

// Store active connections
const connections = new Map();

// Helper function to create MongoDB Atlas URI with runtime credentials
const createMongoUri = (username, password, cluster) => {
  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);
  
  // For Atlas: mongodb+srv://username:password@cluster-url
  return `mongodb+srv://${encodedUser}:${encodedPass}@${cluster}`;
};

// Helper function to get or create connection
const getConnection = async (credentials) => {
  const { username, password, cluster, database } = credentials;
  const connectionKey = `${username}@${cluster}/${database}`;
  
  if (connections.has(connectionKey)) {
    return connections.get(connectionKey);
  }
  
  const uri = createMongoUri(username, password, cluster);
  const client = new MongoClient(uri, {
    retryWrites: true,
    w: 'majority',
    serverSelectionTimeoutMS: 5000
  });
  
  await client.connect();
  console.log(`Connected to MongoDB Atlas: ${connectionKey}`);
  connections.set(connectionKey, client);
  return client;
};

// Endpoint to execute MongoDB query
app.post('/api/query', async (req, res) => {
  try {
    const {
      username,
      password,
      cluster = 'cluster0.bh9lt.mongodb.net',
      database,
      collection,
      operation = 'find',
      query = {},
      options = {},
      data = null
    } = req.body;

    // Validate required fields
    if (!username || !password || !database || !collection) {
      return res.status(400).json({
        error: 'Missing required fields: username, password, database, collection'
      });
    }

    // Get or create connection
    const client = await getConnection({ username, password, cluster, database });
    const db = client.db(database);
    const coll = db.collection(collection);

    let result;

    // Execute operation based on type
    switch (operation.toLowerCase()) {
      case 'find':
        result = await coll.find(query, options).toArray();
        break;
      
      case 'findone':
        result = await coll.findOne(query, options);
        break;
      
      case 'insertone':
        if (!data) {
          return res.status(400).json({ error: 'data is required for insertOne' });
        }
        result = await coll.insertOne(data);
        break;
      
      case 'insertmany':
        if (!Array.isArray(data)) {
          return res.status(400).json({ error: 'data must be an array for insertMany' });
        }
        result = await coll.insertMany(data);
        break;
      
      case 'updateone':
        if (!data) {
          return res.status(400).json({ error: 'data is required for updateOne' });
        }
        result = await coll.updateOne(query, data, options);
        break;
      
      case 'updatemany':
        if (!data) {
          return res.status(400).json({ error: 'data is required for updateMany' });
        }
        result = await coll.updateMany(query, data, options);
        break;
      
      case 'deleteone':
        result = await coll.deleteOne(query, options);
        break;
      
      case 'deletemany':
        result = await coll.deleteMany(query, options);
        break;
      
      case 'count':
        result = await coll.countDocuments(query, options);
        break;
      
      case 'aggregate':
        if (!Array.isArray(query)) {
          return res.status(400).json({ error: 'query must be an array for aggregate' });
        }
        result = await coll.aggregate(query, options).toArray();
        break;
      
      case 'distinct':
        if (!options.field) {
          return res.status(400).json({ error: 'options.field is required for distinct' });
        }
        result = await coll.distinct(options.field, query);
        break;
      
      default:
        return res.status(400).json({ error: `Unsupported operation: ${operation}` });
    }

    res.json({
      success: true,
      operation,
      count: Array.isArray(result) ? result.length : undefined,
      result
    });

  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({
      success: false,
      error: 'Database operation failed',
      message: error.message
    });
  }
});

// Endpoint to list all databases
app.post('/api/listdatabases', async (req, res) => {
  try {
    const { username, password, cluster = 'cluster0.bh9lt.mongodb.net' } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const client = await getConnection({ username, password, cluster, database: 'admin' });
    const adminDb = client.db().admin();
    const result = await adminDb.listDatabases();

    res.json({
      success: true,
      databases: result.databases
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint to list all collections in a database
app.post('/api/listcollections', async (req, res) => {
  try {
    const {
      username,
      password,
      cluster = 'cluster0.bh9lt.mongodb.net',
      database
    } = req.body;

    if (!username || !password || !database) {
      return res.status(400).json({ error: 'username, password, and database are required' });
    }

    const client = await getConnection({ username, password, cluster, database });
    const db = client.db(database);
    const collections = await db.listCollections().toArray();

    res.json({
      success: true,
      database,
      collections: collections.map(c => c.name)
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint to close a specific connection
app.post('/api/disconnect', async (req, res) => {
  try {
    const { username, cluster, database } = req.body;
    const connectionKey = `${username}@${cluster}/${database}`;
    
    if (connections.has(connectionKey)) {
      const client = connections.get(connectionKey);
      await client.close();
      connections.delete(connectionKey);
      res.json({ success: true, message: 'Connection closed' });
    } else {
      res.status(404).json({ error: 'Connection not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeConnections: connections.size
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing all MongoDB connections...');
  for (const [key, client] of connections) {
    await client.close();
    console.log(`Closed connection: ${key}`);
  }
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`MongoDB Atlas API ready`);
});