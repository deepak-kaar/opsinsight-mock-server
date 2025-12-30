import { connectToMongoDB } from "../../../config/connection.js";

async function getUserRole(req, res) {
  try {
    const db = await connectToMongoDB();
    const { user } = req.query;

    if (!user) {
      return res.status(400).json({
        token: "400",
        response: "User parameter is required"
      });
    }

    const collection = db.collection("Acc_Enabler_Test_User");
    const userRecord = await collection.findOne({ user });

    if (!userRecord) {
      return res.status(404).json({
        token: "404",
        response: "User not found"
      });
    }

    return res.status(200).json({
      token: "200",
      response: "User role fetched successfully",
      data: {
        user: userRecord.user,
        role: userRecord.role
      }
    });

  } catch (error) {
    return res.status(500).json({
      token: "500",
      response: "Failed to fetch user role",
      error: error.message
    });
  }
}

export default { getUserRole };