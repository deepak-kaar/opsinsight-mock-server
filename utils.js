import { connectToMongoDB } from './config/connection.js';
import { jwtVerify } from "jose";
import dotenv from 'dotenv';
dotenv.config();
const secret = new TextEncoder().encode(process.JWT_SECRET);

    const getNextSequenceValue= async function (collectionName) {
        try {
            const db = await connectToMongoDB();
            const sequenceDocument = await db.collection("counter").findOneAndUpdate(
                { _id: collectionName + ' Counter' },
                { $inc: { seq: 1 } },
                { returnDocument: 'after', upsert: true }
            );
            return sequenceDocument.seq;
        } catch (err) {
            console.error('Error getting next sequence value:', err);
            throw err;
        }
    };

    const decodeToken= async function (token) {
        if (token) {
            try {
                const decode = await jwtVerify(token, secret);
                return decode
            } catch (err) {
                return err;
            }
        }
    };


export default {getNextSequenceValue, decodeToken};
