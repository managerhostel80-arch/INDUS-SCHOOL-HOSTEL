const express = require('express');
const router = express.Router();
const { 
  getTeam, 
  addMember, 
  updateMember, 
  deleteMember 
} = require('../controllers/teamController');

// GET all team members
router.get('/', getTeam);

// POST create a new team member
router.post('/', addMember);

// PATCH update an existing team member by ID
router.patch('/:id', updateMember);

// DELETE remove a team member by ID
router.delete('/:id', deleteMember);

module.exports = router;