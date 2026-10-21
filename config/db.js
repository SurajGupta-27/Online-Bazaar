import mongoose from "mongoose";
import colors from "colors";

mongoose.set("bufferCommands", false);
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URL) {
      console.warn("MONGO_URL is missing. Add it to the root .env file.");
      return false;
    }
    const conn = await mongoose.connect(process.env.MONGO_URL);
    console.log(
      `Connected to MongoDB database ${conn.connection.host}`.bgMagenta.white
    );
    return true;
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`.bgRed.white);
    return false;
  }
};

export default connectDB;