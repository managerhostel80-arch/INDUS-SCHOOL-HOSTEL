const mongoose = require('mongoose');

const MaintenanceTeamSchema = new mongoose.Schema({
  category: { 
    type: String, 
    required: true, 
    enum: ['Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'] 
  },
  personName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  mobileNumber: { 
    type: String, 
    required: true, 
    trim: true 
  },
  active: { 
    type: Boolean, 
    default: true 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('MaintenanceTeam', MaintenanceTeamSchema);