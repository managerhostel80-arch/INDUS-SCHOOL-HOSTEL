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
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Serve uploaded static files publicly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Basic Test Route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Indus Hostel Maintenance API' });
});

// Safety helper to ensure Express always receives a valid middleware function
const getRouter = (routeModule, name) => {
  if (typeof routeModule === 'function') return routeModule;
  if (routeModule && typeof routeModule.router === 'function') return routeModule.router;
  throw new Error(`CRITICAL: Route module '${name}' did not export a valid router function. Check module.exports in that file.`);
};

// API Routes (Safely wrapped)
app.use('/api/requests', getRouter(requestRoutes, 'requestRoutes'));
app.use('/api/team', getRouter(teamRoutes, 'teamRoutes'));
app.use('/api/db', getRouter(dbRoutes, 'dbRoutes'));
app.use('/api/push', getRouter(pushRoutes, 'pushRoutes'));

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl}. Make sure the latest backend version is deployed.`
  });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.stack);
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
  connectDB().catch(error => {
    console.error('MongoDB connection failed; database-backed requests may fail:', error.message);
  });
});