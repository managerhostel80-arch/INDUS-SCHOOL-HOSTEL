const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const upload = require('../middleware/upload');

// GET all requests
router.get('/', requestController.getRequests);

// POST create request
router.post('/', upload.single('photo'), requestController.createRequest);

// PATCH update status/details
router.patch('/:id', upload.single('completionPhoto'), requestController.updateRequestStatus);

// DELETE requests with a specific status
router.delete('/status/:status', requestController.deleteRequestsByStatus);

// DELETE clear all requests
router.delete('/clear-requests', requestController.clearAllRequests);

module.exports = router;