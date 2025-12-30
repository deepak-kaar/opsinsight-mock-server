import cron from "node-cron";
import { connectToMongoDB } from "../../../config/connection.js";

cron.schedule("0 * * * *", async () => {
  try {
    const db = await connectToMongoDB();
    const col = db.collection(process.env.ACCOUNT_ENABLER);

    const now = new Date();

    // Find expired and active enablers
    const expired = await col.find({
      isActive: true,
      expiresAt: { $exists: true, $lte: now }
    }).toArray();

    if (expired.length > 0) {
      await col.updateMany(
        { _id: { $in: expired.map(r => r._id) } },
        {
          $set: {
            isActive: false,
            expiredAt: now
          }
        }
      );
    }

    console.log(`[Scheduler] Disabled ${expired.length} expired enablers at ${now.toISOString()}`);

  } catch (err) {
    console.error("[Scheduler Error]", err);
  }
});
