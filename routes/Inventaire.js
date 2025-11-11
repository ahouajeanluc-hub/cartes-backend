const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth'); // ✅ AJOUT AUTH
const inventaireController = require('../Controllers/InventaireController'); // ✅ CORRECTION MAJUSCULE

// ✅ AJOUT: Middleware d'authentification
router.use(verifyToken);

// 🔍 Route de recherche multicritères
router.get('/recherche', inventaireController.rechercheCartes);

module.exports = router;