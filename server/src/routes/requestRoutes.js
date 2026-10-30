const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const { upload, requirePersistentPhotoStorage } = require('../middleware/upload');

// GET all requests & dashboard stats
router.get('/', requestController.getRequests);

// POST create request
router.post('/', requirePersistentPhotoStorage, upload.single('photo'), requestController.createRequest);

// PATCH update status/details
router.patch('/:id', requirePersistentPhotoStorage, upload.single('completionPhoto'), requestController.updateRequestStatus);

// DELETE requests with a specific status
router.delete('/status/:status', requestController.deleteRequestsByStatus);

// DELETE clear all requests
router.delete('/clear-requests', requestController.clearAllRequests);

// MUST export router directly, NOT as an object
module.exports = router;