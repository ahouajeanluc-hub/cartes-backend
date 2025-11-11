const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const logController = require('../Controllers/logController'); // ✅ CORRIGÉ : logController.js

// ✅ Middleware d'authentification
router.use(verifyToken);

// 📝 Routes pour les logs
router.get('/', logController.getAllLogs);
router.post('/', logController.createLog);
router.get('/utilisateur/:utilisateur', logController.getLogsByUser);
router.get('/periode', logController.getLogsByPeriod);
router.delete('/nettoyer', logController.cleanOldLogs);

// 🩺 Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        status: '✅ Module logs opérationnel',
        timestamp: new Date().toISOString(),
        endpoints: [
            'GET /api/log',
            'POST /api/log', 
            'GET /api/log/utilisateur/:utilisateur',
            'GET /api/log/periode',
            'DELETE /api/log/nettoyer',
            'GET /api/log/health'
        ]
    });
});

module.exports = router;