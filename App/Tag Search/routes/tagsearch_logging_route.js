import express from "express";
import tagSearchController from "../services/tagsearch.js";

const router = express.Router();

// Logging endpoints for tag utilization
router.get("/category/:category", getCategory);
router.get("/logger/summary", getSummary);

// ================= GET LOGS BY CATEGORY ==================
async function getCategory(req, res) {
    try {
        const { category } = req.params;

        const valid = [
            "ApplicationLogs",
            "AuditTrail",
            "SecurityEvents",
            "ErrorLogs",
            "PerformanceMetrics"
        ];

        if (!valid.includes(category)) {
            return res.status(400).json({
                message: "Invalid or missing category name"
            });
        }

        // Import connection from config
        const { connectToMongoDB } = await import("../../../config/connection.js");
        const db = await connectToMongoDB();

        // Filter logs by TAG_SEARCH module
        const data = await db.collection(category)
            .find({ module: "TAG_SEARCH" })
            .sort({ timestamp: -1 })
            .toArray();

        res.json({ data });

    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to fetch logs");
    }
}

// ================= SUMMARY ==================
async function getSummary(req, res) {
    try {
        // Import connection from config
        const { connectToMongoDB } = await import("../../../config/connection.js");
        const db = await connectToMongoDB();

        // Get logs filtered by TAG_SEARCH module
        const logs = db.collection("ApplicationLogs");

        const total = await logs.countDocuments({ module: "TAG_SEARCH" });
        console.log("Total tag searches",total)
        const errors = await db.collection("ErrorLogs").countDocuments({ module: "TAG_SEARCH" });
        const security = await db.collection("SecurityEvents").countDocuments({ module: "TAG_SEARCH" });
        const audit = await db.collection("AuditTrail").countDocuments({ module: "TAG_SEARCH" });

        // --- Top Users Aggregation ---
        const topUsersAgg = await logs.aggregate([
            { $match: { module: "TAG_SEARCH" } },
            {
                $group: {
                    _id: "$user.username",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]).toArray();

        const topUsers = {
            labels: topUsersAgg.map(u => u._id || "Unknown"),
            values: topUsersAgg.map(u => u.count)
        };

        // --- Logs Over Time (Daily) ---
        const timelineAgg = await logs.aggregate([
            { $match: { module: "TAG_SEARCH" } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]).toArray();

        const timeline = {
            labels: timelineAgg.map(t => t._id),
            values: timelineAgg.map(t => t.count)
        };

        res.json({
            total,
            errors,
            security,
            audit,
            chartData: {
                pie: [total, audit, errors, security],
                topUsers,
                timeline
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to fetch summary");
    }
}

export default router;
