const express = require('express');
const router = express.Router();
const MaintenanceRequest = require('../models/Request');
const MaintenanceTeam = require('../models/MaintenanceTeam');
const PushSubscription = require('../models/PushSubscription');

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