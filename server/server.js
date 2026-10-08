const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./src/config/db'); // Database connection config

// Import Routes
const requestRoutes = require('./src/routes/requestRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const dbRoutes = require('./src/routes/dbRoutes'); // Optional: for DB stats and clearing
const pushRoutes = require('./src/routes/pushRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Serve uploaded static files publicly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
connectDB();

// Basic Test Route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Indus Hostel Maintenance API' });
});

// API Routes
app.use('/api/requests', requestRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/db', dbRoutes); // Optional database management route
app.use('/api/push', pushRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});