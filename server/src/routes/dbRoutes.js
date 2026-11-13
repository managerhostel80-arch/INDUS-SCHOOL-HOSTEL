const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const MaintenanceRequest = require('../models/Request');
const MaintenanceTeam = require('../models/MaintenanceTeam');
const PushSubscription = require('../models/PushSubscription');

const BACKUP_FORMAT = 'indus-hostel-maintenance-backup';
const backupModels = {
  requests: MaintenanceRequest,
  teamMembers: MaintenanceTeam,
  pushSubscriptions: PushSubscription
};

const requireBackupKey = (req, res, next) => {
  const configuredKey = process.env.DB_BACKUP_KEY;
  if (!configuredKey || configuredKey.length < 32) {
    return res.status(503).json({ success: false, error: 'Database backup requires a server key of at least 32 characters.' });
  }

  const suppliedKey = req.get('x-backup-key');
  if (!suppliedKey) {
    return res.status(401).json({ success: false, error: 'A valid backup key is required.' });
  }

  const configuredBuffer = Buffer.from(configuredKey);
  const suppliedBuffer = Buffer.from(suppliedKey);
  if (configuredBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(configuredBuffer, suppliedBuffer)) {
    return res.status(401).json({ success: false, error: 'A valid backup key is required.' });
  }

  return next();
};

const validateBackup = async backup => {
  if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== 1 || !backup.collections) {
    throw new Error('This is not a supported Hostel Maintenance backup.');
  }

  for (const [collectionName, Model] of Object.entries(backupModels)) {
    const records = backup.collections[collectionName];
    if (!Array.isArray(records)) {
      throw new Error(`Backup is missing the "${collectionName}" collection.`);
    }

    const uniqueFields = collectionName === 'requests'
      ? ['_id', 'requestId']
      : collectionName === 'pushSubscriptions'
        ? ['_id', 'endpoint']
        : ['_id'];

    for (const field of uniqueFields) {
      const values = new Set();
      for (const record of records) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          throw new Error(`The "${collectionName}" collection contains an invalid record.`);
        }
        const value = record[field];
        if (value !== undefined && value !== null) {
          const normalizedValue = String(value);
          if (values.has(normalizedValue)) {
            throw new Error(`The "${collectionName}" collection contains duplicate ${field} values.`);
          }
          values.add(normalizedValue);
        }
      }
    }

    for (const record of records) {
      await new Model(record).validate();
    }
  }
};

const replaceCollection = async (Model, records) => {
  await Model.deleteMany({});
  if (records.length > 0) {
    await Model.insertMany(records, { ordered: true });
  }
};

// GET database stats (total requests and team members count)
router.get('/stats', async (req, res) => {
  try {
    const requestsCount = await MaintenanceRequest.countDocuments();
    const teamCount = await MaintenanceTeam.countDocuments();
    
    res.json({
      success: true,
      stats: {
        requests: requestsCount,
        teamMembers: teamCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download a complete JSON backup of the application collections.
router.get('/backup', requireBackupKey, async (req, res) => {
  try {
    const [requests, teamMembers, pushSubscriptions] = await Promise.all([
      MaintenanceRequest.find().lean(),
      MaintenanceTeam.find().lean(),
      PushSubscription.find().lean()
    ]);
    const exportedAt = new Date();
    const filename = `hostel-maintenance-backup-${exportedAt.toISOString().replace(/[:.]/g, '-')}.json`;

    res.set({
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Expose-Headers': 'Content-Disposition'
    });
    res.json({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: exportedAt.toISOString(),
      collections: { requests, teamMembers, pushSubscriptions }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Replace application data with a validated backup.
router.post('/backup/restore', requireBackupKey, async (req, res) => {
  try {
    await validateBackup(req.body);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message || 'This backup is not valid.' });
  }

  const previousData = {};
  try {
    for (const [collectionName, Model] of Object.entries(backupModels)) {
      previousData[collectionName] = await Model.find().lean();
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Could not read the current database before restoring.' });
  }

  try {
    for (const [collectionName, Model] of Object.entries(backupModels)) {
      await replaceCollection(Model, req.body.collections[collectionName]);
    }
  } catch (restoreError) {
    try {
      for (const [collectionName, Model] of Object.entries(backupModels)) {
        await replaceCollection(Model, previousData[collectionName]);
      }
    } catch (rollbackError) {
      console.error('Database restore failed and rollback was incomplete:', rollbackError);
      return res.status(500).json({
        success: false,
        error: 'Restore failed and the previous database could not be fully recovered. Check the server logs immediately.'
      });
    }
    console.error('Database restore failed; the previous data was restored:', restoreError);
    return res.status(500).json({ success: false, error: 'Restore failed. The previous database data was restored.' });
  }

  return res.json({
    success: true,
    message: 'Backup restored successfully.',
    stats: {
      requests: req.body.collections.requests.length,
      teamMembers: req.body.collections.teamMembers.length,
      pushSubscriptions: req.body.collections.pushSubscriptions.length
    }
  });
});

// DELETE / CLEAR all maintenance requests from the database (Danger Zone)
router.delete('/clear-requests', async (req, res) => {
  try {
    await MaintenanceRequest.deleteMany({});
    res.json({ 
      success: true, 
      message: 'All maintenance requests have been permanently cleared from the database.' 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE / CLEAR all push subscriptions (Fixes stale VAPID signature errors)
router.delete('/clear-subscriptions', async (req, res) => {
  try {
    await PushSubscription.deleteMany({});
    res.json({ 
      success: true, 
      message: 'All old push subscriptions have been cleared. You can now re-enable notifications.' 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;