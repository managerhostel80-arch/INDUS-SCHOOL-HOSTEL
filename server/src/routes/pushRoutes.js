const express = require('express');
const pushController = require('../controllers/pushController');

const router = express.Router();

router.get('/public-key', pushController.getPublicKey);
router.post('/subscribe', pushController.subscribe);
router.delete('/subscribe', pushController.unsubscribe);

module.exports = router;
