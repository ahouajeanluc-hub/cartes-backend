const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const utilisateursController = require('../Controllers/UtilisateursController');

// ✅ Middleware d'authentification pour toutes les routes
router.use(verifyToken);

// ✅ UNIQUEMENT LES ROUTES QUI EXISTENT DANS LE CONTRÔLEUR
router.get('/', utilisateursController.getAllUsers);
router.get('/stats', utilisateursController.getUsersStats);
router.get('/:id', utilisateursController.getUserById);

// ❌ ROUTES COMMENTÉES - À IMPLÉMENTER PLUS TARD
// router.post('/', utilisateursController.createUser);
// router.put('/:id', utilisateursController.updateUser);
// router.put('/:id/reset-password', utilisateursController.resetPassword);

module.exports = router;