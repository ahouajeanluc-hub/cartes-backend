const express = require('express');
const router = express.Router();
const journalController = require('../Controllers/journalController'); // ✅ MongoDB
const { verifyToken } = require('../middleware/auth');
const journalAccess = require('../middleware/journalAccess');

// ✅ SEULS LES ADMINISTRATEURS PEUVENT ACCÉDER AU JOURNAL
router.use(verifyToken);
router.use(journalAccess);

// ✅ ROUTES OPTIMISÉES - Appel direct des méthodes
router.get('/', journalController.getJournal);
router.get('/imports', journalController.getImports);
router.post('/annuler-import', journalController.annulerImportation);
router.get('/stats', journalController.getStats);
router.post('/undo/:id', journalController.undoAction);

module.exports = router;