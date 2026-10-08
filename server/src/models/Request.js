const mongoose = require('mongoose');

const maintenanceRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  location: { type: String, required: true },
  problemDescription: { type: String, required: true },
  reportedByName: { type: String, default: '' },
  reportedByMobile: { type: String, default: '' },
  reportedAt: { type: Date }, 
  urgencyLevel: {
    type: String,
    enum: ['Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  assignedName: { type: String, default: '' },
  assignedMobile: { type: String, default: '' },
  status: { type: String, enum: ['New', 'Accepted', 'In Progress', 'Completed'], default: 'New' },
  photo: { type: String, default: '' },
  completionPhoto: { type: String, default: '' },
  remarks: { type: String, default: '' },
  completedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('MaintenanceRequest', maintenanceRequestSchema);