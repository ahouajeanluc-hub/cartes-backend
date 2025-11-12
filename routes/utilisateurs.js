const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { getDB } = require('../db/mongodb');
const { ObjectId } = require('mongodb');

// ✅ Middleware d'authentification pour toutes les routes
router.use(verifyToken);

// 👥 LISTER TOUS LES UTILISATEURS
async function getAllUsers(req, res) {
  try {
    const db = getDB();
    
    const utilisateurs = await db.collection('utilisateurs')
      .find({})
      .project({
        MotDePasse: 0,
        password: 0 // Exclure les mots de passe
      })
      .sort({ NomComplet: 1 })
      .toArray();

    // Formater la réponse
    const formattedUsers = utilisateurs.map(user => ({
      Id: user._id,
      NomUtilisateur: user.NomUtilisateur,
      NomComplet: user.NomComplet,
      Email: user.Email,
      Agence: user.Agence,
      Role: user.Role,
      DateCreation: user.DateCreation || user.created_at,
      Actif: user.Actif
    }));

    res.json({
      success: true,
      utilisateurs: formattedUsers,
      total: formattedUsers.length
    });

  } catch (error) {
    console.error("Erreur récupération utilisateurs MongoDB:", error);
    res.status(500).json({ 
      success: false,
      error: "Erreur lors de la récupération des utilisateurs",
      details: error.message 
    });
  }
}

// 👤 RÉCUPÉRER UN UTILISATEUR PAR ID
async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const db = getDB();
    
    const user = await db.collection('utilisateurs').findOne(
      { _id: new ObjectId(id) },
      { projection: { MotDePasse: 0, password: 0 } }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé"
      });
    }

    // Formater la réponse
    const formattedUser = {
      Id: user._id,
      NomUtilisateur: user.NomUtilisateur,
      NomComplet: user.NomComplet,
      Email: user.Email,
      Agence: user.Agence,
      Role: user.Role,
      DateCreation: user.DateCreation || user.created_at,
      Actif: user.Actif
    };

    res.json({
      success: true,
      utilisateur: formattedUser
    });

  } catch (error) {
    console.error("Erreur récupération utilisateur MongoDB:", error);
    res.status(500).json({ 
      success: false,
      error: "Erreur lors de la récupération de l'utilisateur",
      details: error.message 
    });
  }
}

// 📊 STATISTIQUES UTILISATEURS
async function getUsersStats(req, res) {
  try {
    const db = getDB();
    
    const stats = await db.collection('utilisateurs').aggregate([
      {
        $group: {
          _id: '$Role',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          role: '$_id',
          count: 1
        }
      }
    ]).toArray();

    const total = await db.collection('utilisateurs').countDocuments();
    const actifs = await db.collection('utilisateurs').countDocuments({ Actif: true });

    res.json({
      success: true,
      total: total,
      actifs: actifs,
      inactifs: total - actifs,
      parRole: stats
    });

  } catch (error) {
    console.error("Erreur statistiques utilisateurs MongoDB:", error);
    res.status(500).json({ 
      success: false,
      error: "Erreur lors du calcul des statistiques utilisateurs",
      details: error.message 
    });
  }
}

// 🩺 HEALTH CHECK
async function healthCheck(req, res) {
  res.json({
    success: true,
    status: "✅ Module utilisateurs opérationnel",
    timestamp: new Date().toISOString(),
    endpoints: [
      "GET /api/utilisateurs",
      "GET /api/utilisateurs/stats",
      "GET /api/utilisateurs/:id",
      "GET /api/utilisateurs/health"
    ]
  });
}

// 🚀 ROUTES PRINCIPALES
router.get('/', getAllUsers);
router.get('/stats', getUsersStats);
router.get('/:id', getUserById);
router.get('/health', healthCheck);

// ❌ ROUTES COMMENTÉES - À IMPLÉMENTER PLUS TARD
// router.post('/', createUser);
// router.put('/:id', updateUser);
// router.put('/:id/reset-password', resetPassword);

module.exports = router;