const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');
const mongoose = require('mongoose');
const stream = require('stream');
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

// ==========================================
// GOOGLE DRIVE BACKUP & RESTORE SYSTEM
// ==========================================
const getDriveClient = () => {
  let client_email, private_key;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    try {
      const cleanBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.trim();
      const decodedJson = Buffer.from(cleanBase64, 'base64').toString('utf-8');
      const credentials = JSON.parse(decodedJson);
      client_email = credentials.client_email;
      private_key = credentials.private_key;
    } catch (e) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid Base64-encoded service-account JSON.');
    }
  } 
  
  if (!client_email || !private_key) {
    client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    private_key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  }

  if (!client_email || !private_key || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('Google Drive backup is not configured on the server.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });

  return google.drive({ version: 'v3', auth });
};

// 1. Export / Backup Database to Google Drive
app.post('/api/backup/export-gdrive', async (req, res) => {
  try {
    const key = req.headers['x-backup-key'];
    if (key !== process.env.DB_BACKUP_KEY) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid DB_BACKUP_KEY' });
    }

    const drive = getDriveClient();
    const collections = await mongoose.connection.db.collections();
    const backupData = {};
    for (let collection of collections) {
      backupData[collection.collectionName] = await collection.find({}).toArray();
    }

    const jsonString = JSON.stringify(backupData, null, 2);
    const fileName = `hostel360-backup-${Date.now()}.json`;

    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(jsonString, 'utf-8'));

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: 'application/json',
        body: bufferStream,
      },
    });

    res.status(200).json({ success: true, message: 'Backed up to Google Drive successfully!', fileId: response.data.id });
  } catch (error) {
    console.error('Drive export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. List Backups from Google Drive Folder
app.get('/api/backup/list-gdrive', async (req, res) => {
  try {
    const key = req.headers['x-backup-key'];
    if (key !== process.env.DB_BACKUP_KEY) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid DB_BACKUP_KEY' });
    }

    const drive = getDriveClient();
    const response = await drive.files.list({
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType='application/json' and trashed=false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
    });

    res.status(200).json({ success: true, files: response.data.files });
  } catch (error) {
    console.error('Drive list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Import / Restore Database from Google Drive File
app.post('/api/backup/import-gdrive', async (req, res) => {
  try {
    const key = req.headers['x-backup-key'];
    if (key !== process.env.DB_BACKUP_KEY) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid DB_BACKUP_KEY' });
    }

    const { fileId } = req.body;
    if (!fileId) {
      return res.status(400).json({ success: false, error: 'File ID is required' });
    }

    const drive = getDriveClient();
    const fileResponse = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'json' }
    );

    const backupData = fileResponse.data;

    for (const [collectionName, documents] of Object.entries(backupData)) {
      const collection = mongoose.connection.db.collection(collectionName);
      await collection.deleteMany({});
      if (documents.length > 0) {
        await collection.insertMany(documents);
      }
    }

    res.status(200).json({ success: true, message: 'Database successfully restored from Google Drive!' });
  } catch (error) {
    console.error('Drive import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
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