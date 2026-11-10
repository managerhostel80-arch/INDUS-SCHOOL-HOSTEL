const mongoose = require('mongoose');

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hostel-maintenance');
  console.log(`MongoDB Connected: ${conn.connection.host}`);
};

module.exports = connectDB;