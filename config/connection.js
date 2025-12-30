import { MongoClient, GridFSBucket } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const dbConfig = process.env.DATABASE_URL;
const databaseName = process.env.DATABASE_NAME;

// Keep backward compatibility: previously exported variable named `mongoClient` actually held the DB instance
let dbInstance = null; // MongoDB Db instance
let clientInstance = null; // MongoClient instance

let gfsBucket;

// Separate GridFS bucket for documents
let documentsBucket;

// In-memory metrics/state for connection pool and health
const poolMetrics = {
  totalCreated: 0,
  totalClosed: 0,
  checkedOut: 0,
  waitQueueSize: 0,
  lastUpdated: null
};

const checkOutFailuresTimestamps = []; // timestamps of connectionCheckOutFailed events

// Track checkout failures per minute (rolling counter)
let checkoutFailures1m = 0;

// Reset checkout failures counter every minute
setInterval(() => {
  checkoutFailures1m = 0;
}, 60_000);

function pruneOldTimestamps(buffer, windowMs) {
  const cutoff = Date.now() - windowMs;
  while (buffer.length && buffer[0] < cutoff) buffer.shift();
}

function initPoolEventListeners(client) {
  // Guard against multiple bindings
  if (client.__poolEventsBound) return;
  client.__poolEventsBound = true;

  client.on('connectionPoolCreated', () => {
    poolMetrics.lastUpdated = new Date();
  });

  client.on('connectionCreated', () => {
    poolMetrics.totalCreated += 1;
    poolMetrics.lastUpdated = new Date();
  });

  client.on('connectionClosed', () => {
    poolMetrics.totalClosed += 1;
    poolMetrics.lastUpdated = new Date();
  });

  client.on('connectionCheckedOut', () => {
    poolMetrics.checkedOut += 1;
    if (poolMetrics.waitQueueSize > 0) poolMetrics.waitQueueSize -= 1;
    poolMetrics.lastUpdated = new Date();
  });

  client.on('connectionCheckedIn', () => {
    if (poolMetrics.checkedOut > 0) poolMetrics.checkedOut -= 1;
    poolMetrics.lastUpdated = new Date();
  });

  client.on('connectionCheckOutStarted', () => {
    poolMetrics.waitQueueSize += 1;
    poolMetrics.lastUpdated = new Date();
  });

  client.on('connectionCheckOutFailed', () => {
    if (poolMetrics.waitQueueSize > 0) poolMetrics.waitQueueSize -= 1;
    checkOutFailuresTimestamps.push(Date.now());
    checkoutFailures1m++; // Increment rolling 1-minute counter
    poolMetrics.lastUpdated = new Date();
  });

  client.on('connectionPoolCleared', () => {
    // Conservatively reset checkedOut; totalCreated/closed keep historical counts
    poolMetrics.checkedOut = 0;
    poolMetrics.waitQueueSize = 0;
    poolMetrics.lastUpdated = new Date();
  });
}

async function connectToMongoDB() {
  if (!dbInstance) {
    try {
      const client = new MongoClient(dbConfig, {
        maxPoolSize: 20,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 10000,
        serverSelectionTimeoutMS: 30000, // was 10000 // Timeout if MongoDB is unavailable
        connectTimeoutMS: 10000 // Time allowed to establish a connection
      });

      await client.connect();
      clientInstance = client;
      dbInstance = client.db(databaseName);

      console.log('MongoDB Connected Successfully');

      // Bind pool listeners once
      initPoolEventListeners(client);

      gfsBucket = new GridFSBucket(dbInstance, {
        bucketName: 'videos',
        chunkSizeBytes: 261120 // 255 KB chunks
      });

      documentsBucket = new GridFSBucket(dbInstance, {
        bucketName: 'documents',
        chunkSizeBytes: 261120
      });

      console.log('GridFS Bucket initialized');
    } catch (err) {
      console.error('Error connecting to MongoDB', err);
      process.exit(1);
    }
  }
  return dbInstance;
}

function getMongoClient() {
  return clientInstance;
}

function getDbPoolMetrics() {
  const MIN_POOL_SIZE = 5;

  const total = Math.max(
    poolMetrics.totalCreated - poolMetrics.totalClosed,
    MIN_POOL_SIZE
  );

  const active = Math.min(poolMetrics.checkedOut, total);
  const idle = Math.max(total - active, 0);

  const utilizationRate =
    total > 0 ? Math.round((active / total) * 100) : 0;

  return {
    total,
    active,
    idle,
    waitQueueSize: poolMetrics.waitQueueSize,
    utilizationRate,
    maxPoolSize: 20,
    minPoolSize: MIN_POOL_SIZE,
    lifetime: {
      totalCreated: poolMetrics.totalCreated,
      totalClosed: poolMetrics.totalClosed
    },
    errorRate1m: checkoutFailures1m,
    lastUpdated: poolMetrics.lastUpdated,
    source: "events"
  };
}




async function getDbHealthSnapshot() {
  const snapshot = {
    status: 'UNKNOWN',
    latencyMs: null,
    lastPing: null,
    errorRate1m: 0,
    processUptimeSec: Math.floor(process.uptime()),
  };

  try {
    const db = await connectToMongoDB(); // must be cached client

    // High-precision, timeout-safe ping
    const start = process.hrtime.bigint();

    await Promise.race([
      db.command({ ping: 1 }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB ping timeout')), 2000)
      )
    ]);

    const latencyMs =
      Number(process.hrtime.bigint() - start) / 1e6;

    snapshot.latencyMs = Math.round(latencyMs);
    snapshot.lastPing = new Date();

    const pool = getDbPoolMetrics() || {};
    snapshot.errorRate1m = pool.errorRate1m || 0;

    const waitQueueSize = pool.waitQueueSize || 0;

    // Clean, conservative health logic
    if (latencyMs > 700 || waitQueueSize > 20) {
      snapshot.status = 'DOWN';
    } else if (
      latencyMs > 300 ||
      waitQueueSize > 5 ||
      snapshot.errorRate1m > 3
    ) {
      snapshot.status = 'DEGRADED';
    } else {
      snapshot.status = 'UP';
    }

  } catch (err) {
    snapshot.status = 'DOWN';
    snapshot.error = 'Database unreachable or unresponsive';
  }

  return snapshot;
}


export { connectToMongoDB, documentsBucket, gfsBucket, getMongoClient, getDbPoolMetrics, getDbHealthSnapshot };