import { connectToMongoDB } from "../config/connection.js";

export const storeAggregate = async (req, res) => {
  try {
    const db = await connectToMongoDB();
    const collection = db.collection("Aggregate_test");

    const { entity, frequency, isoDate, summary } = req.body;

    // Form fields exactly as required
    const _id = `${entity}::${frequency}::${isoDate}`;
    const entity_id = `${entity}::${frequency}`;

    const document = {
      _id: _id,
      type: "AGGREGATE",
      entity_id: entity_id,
      frequency: frequency,
      date: new Date(`${isoDate}T00:00:00Z`),
      summary: summary
    };

    await collection.insertOne(document);

    res.status(201).json({
      message: "Stored successfully",
      data: document
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Insert failed" });
  }
};

export default storeAggregate;
