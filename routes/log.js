const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth'); // ✅ AJOUT AUTH
const logController = require('../Controllers/LogController'); // ✅ CORRECTION MAJUSCULE

// ✅ AJOUT: Middleware d'authentification
router.use(verifyToken);

router.get('/', logController.getAllLogs);
router.post('/', logController.createLog);

module.exports = router;