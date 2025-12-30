import { connectToMongoDB } from '../../../config/connection.js';
import dotenv from 'dotenv';

dotenv.config();

const post_report = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.REPORT_COLLECTION;

        const ReportSchema = {
            reportId: req.body.reportId,
            container: req.body.container
        };

        const result = await db.collection(collectionName).insertOne(ReportSchema);
        return res.json({ token: '200', Users: ReportSchema });
    } catch (err) {
        return next(err);
    }
};

const get_report = async (req, res, next) => {
    try {
        const db = await connectToMongoDB();
        const collectionName = process.env.REPORT_COLLECTION;

        const result = await db.collection(collectionName).find({}).toArray();
        return res.json({ token: '200', Reports: result });
    } catch (err) {
        return next(err);
    }
};

const delete_report = async function (req, res, next) {
    try {
      const db = await connectToMongoDB();
      const collectionName = process.env.REPORT_COLLECTION;
  
      const id = req.params.id;
  
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ token: "400", response: "Invalid ID format" });
      }
  
      const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });
  
      if (result.deletedCount === 1) {
        return res.json({ token: "200", id, response: "Report deleted successfully" });
      } else {
        return res.status(404).json({ token: "404", response: "Report not found" });
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
export default { post_report, get_report, delete_report }; // Use default export
