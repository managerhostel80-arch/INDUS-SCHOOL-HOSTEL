const Request = require('../models/Request');
const PushSubscription = require('../models/PushSubscription');
const webpush = require('web-push');

// @desc    Get all maintenance requests
// @route   GET /api/requests
exports.getRequests = async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Create a new maintenance request (with Push Broadcast)
// @route   POST /api/requests
exports.createRequest = async (req, res) => {
  try {
    const { category, location, description, hostelName, roomNumber, studentName, studentPhone } = req.body;
    
    const photo = req.file ? `/uploads/${req.file.filename}` : '';

    const newRequest = new Request({
      category,
      location,
      description,
      hostelName,
      roomNumber,
      studentName,
      studentPhone,
      photo,
      status: 'Work in Progress' // Default status based on your workflow
    });

    const savedRequest = await newRequest.save();

    // --- BROADCAST PUSH NOTIFICATION TO ALL REGISTERED DEVICES ---
    try {
      const subscriptions = await PushSubscription.find({});
      if (subscriptions.length > 0) {
        const payload = JSON.stringify({
          title: 'New Maintenance Request',
          body: `Category: ${category} | Location: ${location}`,
          url: '/'
        });

        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(sub, payload);
          } catch (err) {
            // Remove expired or invalid subscriptions
            if (err.statusCode === 410 || err.statusCode === 404) {
              await PushSubscription.deleteOne({ endpoint: sub.endpoint });
            }
            console.error('Push delivery error for device:', err.message);
          }
        }
        console.log(`Push notifications broadcasted to ${subscriptions.length} devices.`);
      }
    } catch (pushErr) {
      console.error('Error broadcasting push notification:', pushErr);
    }
    // -------------------------------------------------------------

    res.status(201).json({ success: true, data: savedRequest });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update request status
// @route   PATCH /api/requests/:id
exports.updateRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const updateData = { status };

    if (req.file) {
      updateData.completionPhoto = `/uploads/${req.file.filename}`;
    }

    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    res.status(200).json({ success: true, data: updatedRequest });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Delete requests by status
// @route   DELETE /api/requests/status/:status
exports.deleteRequestsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    await Request.deleteMany({ status });
    res.status(200).json({ success: true, message: `Deleted all ${status} requests` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Clear all requests
// @route   DELETE /api/requests/clear-requests
exports.clearAllRequests = async (req, res) => {
  try {
    await Request.deleteMany({});
    res.status(200).json({ success: true, message: 'All requests cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};