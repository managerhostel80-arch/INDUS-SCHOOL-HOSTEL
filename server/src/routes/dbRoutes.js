const express = require('express');
const crypto = require('crypto');
const { Readable } = require('stream');
const { google } = require('googleapis');
const router = express.Router();
const MaintenanceRequest = require('../models/Request');
const MaintenanceTeam = require('../models/MaintenanceTeam');
const PushSubscription = require('../models/PushSubscription');

const BACKUP_FORMAT = 'indus-hostel-maintenance-backup';
const DRIVE_BACKUP_PREFIX = 'hostel-maintenance-backup-';
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;
const backupModels = {
  requests: MaintenanceRequest,
  teamMembers: MaintenanceTeam,
  pushSubscriptions: PushSubscription
};

const normalizePrivateKey = value => value
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/\\n/g, '\n')
  .replace(/\r\n?/g, '\n');

const validatePrivateKey = value => {
  try {
    crypto.createPrivateKey(value);
  } catch {
    throw new Error('The Google service-account private key is not valid PEM. Set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 to the exact service-account JSON (raw JSON or Base64), or configure GOOGLE_PRIVATE_KEY with the complete private key including its BEGIN/END lines. Replace the old key and redeploy the server.');
  }
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

const createBackup = async () => {
  const [requests, teamMembers, pushSubscriptions] = await Promise.all([
    MaintenanceRequest.find().lean(),
    MaintenanceTeam.find().lean(),
    PushSubscription.find().lean()
  ]);
  const exportedAt = new Date();
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    collections: { requests, teamMembers, pushSubscriptions }
  };
};

const parseServiceAccountCredentials = value => {
  const credentialsValue = value.trim();
  let credentials;

  if (credentialsValue.startsWith('{')) {
    try {
      credentials = JSON.parse(credentialsValue);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 must contain valid service-account JSON or its Base64-encoded form.');
    }
  } else {
    const base64Value = credentialsValue.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Value) || base64Value.replace(/=+$/, '').length % 4 === 1) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 must contain valid service-account JSON or its Base64-encoded form.');
    }

    const decodedValue = Buffer.from(base64Value, 'base64');
    const canonicalBase64 = decodedValue.toString('base64').replace(/=+$/, '');
    if (canonicalBase64 !== base64Value.replace(/=+$/, '')) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 must contain valid service-account JSON or its Base64-encoded form.');
    }

    try {
      credentials = JSON.parse(decodedValue.toString('utf8'));
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 must contain valid service-account JSON or its Base64-encoded form.');
    }
  }

  if (
    !credentials ||
    typeof credentials !== 'object' ||
    typeof credentials.client_email !== 'string' ||
    typeof credentials.private_key !== 'string'
  ) {
    throw new Error('The Google Drive service-account JSON must include client_email and private_key.');
  }
  return {
    ...credentials,
    private_key: normalizePrivateKey(credentials.private_key)
  };
};

const getGoogleDrive = () => {
  const encodedCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const serviceAccountPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  const hasJsonCredentials = Boolean(encodedCredentials);
  const hasSeparateCredentials = Boolean(serviceAccountEmail && serviceAccountPrivateKey);

  if (!folderId) {
    throw new Error('Google Drive is missing the GOOGLE_DRIVE_FOLDER_ID setting on the server.');
  }
  if (!hasJsonCredentials && !hasSeparateCredentials) {
    throw new Error('Google Drive is missing service-account credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 or both GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY on the server.');
  }

  let credentials;
  if (hasJsonCredentials) {
    try {
      credentials = parseServiceAccountCredentials(encodedCredentials);
      validatePrivateKey(credentials.private_key);
    } catch (error) {
      if (!hasSeparateCredentials) throw error;
      credentials = {
        client_email: serviceAccountEmail,
        private_key: normalizePrivateKey(serviceAccountPrivateKey)
      };
    }
  } else {
    credentials = {
      client_email: serviceAccountEmail,
      private_key: normalizePrivateKey(serviceAccountPrivateKey)
    };
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('The Google Drive service-account credentials are incomplete. Check the email and private key in the server environment.');
  }
  if (!hasJsonCredentials) validatePrivateKey(credentials.private_key);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return { drive: google.drive({ version: 'v3', auth }), folderId };
};

const replaceCollection = async (Model, records) => {
  await Model.deleteMany({});
  if (records.length > 0) {
    await Model.insertMany(records, { ordered: true });
  }
};

const restoreDatabaseBackup = async backup => {
  try {
    await validateBackup(backup);
  } catch (err) {
    return { status: 400, body: { success: false, error: err.message || 'This backup is not valid.' } };
  }

  const previousData = {};
  try {
    for (const [collectionName, Model] of Object.entries(backupModels)) {
      previousData[collectionName] = await Model.find().lean();
    }
  } catch {
    return { status: 500, body: { success: false, error: 'Could not read the current database before restoring.' } };
  }

  try {
    for (const [collectionName, Model] of Object.entries(backupModels)) {
      await replaceCollection(Model, backup.collections[collectionName]);
    }
  } catch (restoreError) {
    try {
      for (const [collectionName, Model] of Object.entries(backupModels)) {
        await replaceCollection(Model, previousData[collectionName]);
      }
    } catch (rollbackError) {
      console.error('Database restore failed and rollback was incomplete:', rollbackError);
      return {
        status: 500,
        body: {
          success: false,
          error: 'Restore failed and the previous database could not be fully recovered. Check the server logs immediately.'
        }
      };
    }
    console.error('Database restore failed; the previous data was restored:', restoreError);
    return { status: 500, body: { success: false, error: 'Restore failed. The previous database data was restored.' } };
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Backup restored successfully.',
      stats: {
        requests: backup.collections.requests.length,
        teamMembers: backup.collections.teamMembers.length,
        pushSubscriptions: backup.collections.pushSubscriptions.length
      }
    }
  };
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
    const backup = await createBackup();
    const exportedAt = new Date();
    const filename = `hostel-maintenance-backup-${exportedAt.toISOString().replace(/[:.]/g, '-')}.json`;

    res.set({
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Expose-Headers': 'Content-Disposition'
    });
    res.json(backup);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Replace application data with a validated backup.
router.post('/backup/restore', requireBackupKey, async (req, res) => {
  const result = await restoreDatabaseBackup(req.body);
  return res.status(result.status).json(result.body);
});

router.post('/backup/drive', requireBackupKey, async (req, res) => {
  try {
    const { drive, folderId } = getGoogleDrive();
    const backup = await createBackup();
    const exportedAt = new Date();
    const filename = `${DRIVE_BACKUP_PREFIX}${exportedAt.toISOString().replace(/[:.]/g, '-')}.json`;
    const created = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: 'application/json',
        parents: [folderId]
      },
      media: {
        mimeType: 'application/json',
        body: Readable.from(Buffer.from(JSON.stringify(backup)))
      },
      fields: 'id,name,createdTime',
      supportsAllDrives: true
    });
    return res.json({ success: true, backup: created.data });
  } catch (err) {
    console.error('Google Drive backup upload failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Could not upload the backup to Google Drive.' });
  }
});

router.get('/backup/drive', requireBackupKey, async (req, res) => {
  try {
    const { drive, folderId } = getGoogleDrive();
    const folder = await drive.files.get({
      fileId: folderId,
      fields: 'id,driveId,mimeType,trashed',
      supportsAllDrives: true
    });
    if (folder.data.trashed || folder.data.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error('The configured Google Drive backup folder does not exist or is not accessible.');
    }

    const escapedFolderId = folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const result = await drive.files.list({
      q: `'${escapedFolderId}' in parents and name contains '${DRIVE_BACKUP_PREFIX}' and mimeType = 'application/json' and trashed = false`,
      fields: 'files(id,name,createdTime,size)',
      orderBy: 'createdTime desc',
      pageSize: 100,
      ...(folder.data.driveId ? { corpora: 'drive', driveId: folder.data.driveId } : {}),
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    return res.json({ success: true, backups: result.data.files || [] });
  } catch (err) {
    console.error('Google Drive backup listing failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Could not list Google Drive backups.' });
  }
});

router.post('/backup/drive/restore', requireBackupKey, async (req, res) => {
  try {
    const { fileId } = req.body || {};
    if (typeof fileId !== 'string' || !fileId.trim()) {
      return res.status(400).json({ success: false, error: 'Select a Google Drive backup to restore.' });
    }

    const { drive, folderId } = getGoogleDrive();
    const metadata = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,parents,trashed,size',
      supportsAllDrives: true
    });
    const file = metadata.data;
    if (
      file.trashed ||
      file.mimeType !== 'application/json' ||
      !file.name.startsWith(DRIVE_BACKUP_PREFIX) ||
      !(file.parents || []).includes(folderId)
    ) {
      return res.status(400).json({ success: false, error: 'The selected file is not a valid backup in the configured Drive folder.' });
    }
    if (Number(file.size) > MAX_BACKUP_SIZE) {
      return res.status(413).json({ success: false, error: 'The selected backup exceeds the 50 MB restore limit.' });
    }

    const download = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    const contents = Buffer.from(download.data);
    if (contents.length > MAX_BACKUP_SIZE) {
      return res.status(413).json({ success: false, error: 'The selected backup exceeds the 50 MB restore limit.' });
    }

    let backup;
    try {
      backup = JSON.parse(contents.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, error: 'The selected Google Drive file is not valid JSON.' });
    }
    const result = await restoreDatabaseBackup(backup);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Google Drive backup restore failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Could not restore the Google Drive backup.' });
  }
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