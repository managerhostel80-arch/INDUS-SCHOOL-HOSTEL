const MaintenanceTeam = require('../models/MaintenanceTeam');

// GET all team members
exports.getTeam = async (req, res) => {
  try {
    const team = await MaintenanceTeam.find().sort({ createdAt: -1 });
    res.json({ success: true, data: team });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ADD a new team member
exports.addMember = async (req, res) => {
  try {
    const newMember = new MaintenanceTeam(req.body);
    const savedMember = await newMember.save();
    res.json({ success: true, data: savedMember });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// UPDATE an existing team member
exports.updateMember = async (req, res) => {
  try {
    const updatedMember = await MaintenanceTeam.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedMember) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }
    res.json({ success: true, data: updatedMember });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE a team member
exports.deleteMember = async (req, res) => {
  try {
    const deletedMember = await MaintenanceTeam.findByIdAndDelete(req.params.id);
    if (!deletedMember) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }
    res.json({ success: true, message: 'Team member deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};