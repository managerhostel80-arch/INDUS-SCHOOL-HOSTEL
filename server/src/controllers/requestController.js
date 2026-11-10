const MaintenanceRequest = require('../models/Request');
const pushNotifications = require('../services/pushNotifications');
let smsNotifications;
try {
  smsNotifications = require('../services/smsNotifications');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  console.error('SMS notification service is unavailable; continuing without SMS alerts:', error.message);
}

const getUploadedFileUrl = (file) => (
  file?.path?.startsWith('http') ? file.path : file ? `/uploads/${file.filename}` : ''
);

// Get all maintenance requests and dashboard stats
exports.getRequests = async (req, res) => {
  try {
    const requests = await MaintenanceRequest.find().sort({ createdAt: -1 });
    
    const stats = {
      new: requests.filter(r => r.status === 'New').length,
      accepted: requests.filter(r => r.status === 'Accepted').length,
      inProgress: requests.filter(r => r.status === 'In Progress').length,
      completed: requests.filter(r => r.status === 'Completed').length
    };

    res.json({ success: true, data: requests, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Create a new maintenance request (with Push Broadcast to all registered devices)
exports.createRequest = async (req, res) => {
  try {
    const { 
      category, 
      location, 
      problemDescription, 
      reportedByName, 
      reportedByMobile, 
      reportedAt, 
      urgencyLevel 
    } = req.body;

    if (!['Medium', 'High', 'Urgent'].includes(urgencyLevel)) {
      return res.status(400).json({ success: false, error: 'A valid urgency level is required.' });
    }
    
    const files = req.files || {};
    const photo = getUploadedFileUrl(files.photo?.[0]);
    const video = getUploadedFileUrl(files.video?.[0]);
    const count = await MaintenanceRequest.countDocuments();
    const requestId = `MNT-${String(count + 1).padStart(5, '0')}`;

    const newRequest = new MaintenanceRequest({
      requestId,
      category,
      location,
      problemDescription,
      reportedByName: reportedByName || '',
      reportedByMobile: reportedByMobile || '',
      reportedAt: reportedAt ? new Date(reportedAt) : new Date(),
      urgencyLevel,
      photo,
      video,
      status: 'New'
    });

    const savedRequest = await newRequest.save();
    setImmediate(async () => {
      const notifications = [
        ['push', () => pushNotifications.notifyNewRequest(savedRequest)]
      ];
      if (smsNotifications) {
        notifications.push(['SMS', () => smsNotifications.notifyNewRequest(savedRequest)]);
      }

      const notificationResults = await Promise.allSettled([
        ...notifications.map(([, notify]) => notify())
      ]);

      notificationResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          const [notificationType] = notifications[index];
          console.error(`Unable to send ${notificationType} notifications:`, result.reason);
        }
      });
    });

    res.status(201).json({ success: true, data: savedRequest });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update request status, technician details, and completion remarks
exports.updateRequestStatus = async (req, res) => {
  try {
    const { status, assignedName, assignedMobile, remarks } = req.body;
    const updateData = {};

    if (status) updateData.status = status;
    if (assignedName) updateData.assignedName = assignedName;
    if (assignedMobile) updateData.assignedMobile = assignedMobile;
    if (remarks) updateData.remarks = remarks;
    const files = req.files || {};
    if (files.photo?.[0]) {
      updateData.photo = getUploadedFileUrl(files.photo[0]);
    }
    if (files.video?.[0]) {
      updateData.video = getUploadedFileUrl(files.video[0]);
    }
    if (files.completionPhoto?.[0]) {
      updateData.completionPhoto = getUploadedFileUrl(files.completionPhoto[0]);
    }
    if (files.progressVideo?.[0]) {
      updateData.progressVideo = getUploadedFileUrl(files.progressVideo[0]);
    }
    if (files.completionVideo?.[0]) {
      updateData.completionVideo = getUploadedFileUrl(files.completionVideo[0]);
    }
    if (status === 'Completed') {
      if (!files.completionPhoto?.[0] || !files.completionVideo?.[0]) {
        return res.status(400).json({
          success: false,
          error: 'A completion photo and video are required to mark this request as completed.'
        });
      }
      updateData.completedAt = new Date();
    }

    const updatedRequest = await MaintenanceRequest.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    res.json({ success: true, data: updatedRequest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.uploadProgressVideo = async (req, res) => {
  try {
    const video = req.files?.progressVideo?.[0];
    if (!video) {
      return res.status(400).json({ success: false, error: 'Select a work-in-progress video to upload.' });
    }

    const updatedRequest = await MaintenanceRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'In Progress' },
      { progressVideo: getUploadedFileUrl(video) },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ success: false, error: 'In-progress request not found.' });
    }

    res.json({ success: true, data: updatedRequest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Clear all requests from database
exports.clearAllRequests = async (req, res) => {
  try {
    await MaintenanceRequest.deleteMany({});
    res.json({ success: true, message: 'All maintenance requests cleared successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Delete maintenance requests with a specific status
exports.deleteRequestsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['New', 'Accepted', 'In Progress', 'Completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid request status.' });
    }

    const result = await MaintenanceRequest.deleteMany({ status });
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} ${status} request(s) deleted successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};