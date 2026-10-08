const MaintenanceRequest = require('../models/Request');
const pushNotifications = require('../services/pushNotifications');

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

// Create a new maintenance request
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
    
    const photo = req.file ? `/uploads/${req.file.filename}` : '';
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
      status: 'New'
    });

    const savedRequest = await newRequest.save();
    res.status(201).json({ success: true, data: savedRequest });
    pushNotifications.notifyNewRequest(savedRequest).catch(err => {
      console.error('Unable to send new complaint push notifications:', err);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update request status, technician details, and completion remarks
exports.updateRequestStatus = async (req, res) => {
  try {
    const { status, assignedName, assignedMobile, remarks } = req.body;
    const updateData = { status };

    if (assignedName) updateData.assignedName = assignedName;
    if (assignedMobile) updateData.assignedMobile = assignedMobile;
    if (remarks) updateData.remarks = remarks;
    if (req.file) {
      updateData.completionPhoto = `/uploads/${req.file.filename}`;
    }
    if (status === 'Completed') {
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