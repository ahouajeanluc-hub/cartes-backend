const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getDB, mongoDB } = require('../db/mongodb');
const { ObjectId } = require("mongodb");
const { verifyToken } = require("../middleware/auth");

// 🗄️ FONCTIONS DE JOURNALISATION (intégrées directement)
async function logAction(logData) {
  try {
    const db = getDB();
    await db.collection('journal').insertOne({
      ...logData,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Erreur journalisation:', error);
  }
}

// ==================== AUTHENTIFICATION ====================

// Fonction de connexion - MONGODB
async function loginUser(req, res) {
  const { NomUtilisateur, MotDePasse } = req.body;

  try {
    console.log('🔍 [LOGIN] Tentative de connexion:', NomUtilisateur);

    // Recherche de l'utilisateur dans MongoDB
    const utilisateur = await getDB().collection('utilisateurs').findOne({
      NomUtilisateur: NomUtilisateur,
      Actif: true
    });

    console.log('🔍 [LOGIN] Utilisateur trouvé:', utilisateur ? 'OUI' : 'NON');

    if (!utilisateur) {
      console.log('❌ [LOGIN] Utilisateur introuvable');
      return res.status(401).json({ message: "Utilisateur introuvable" });
    }

    // Vérification du mot de passe
    const currentPasswordHash = utilisateur.MotDePasse || utilisateur.password;
    if (!currentPasswordHash) {
      console.log('❌ [LOGIN] Aucun mot de passe défini');
      return res.status(401).json({ message: "Problème de configuration du compte" });
    }

    const isMatch = await bcrypt.compare(MotDePasse, currentPasswordHash);
    console.log('🔍 [LOGIN] Mot de passe valide:', isMatch);

    if (!isMatch) {
      console.log('❌ [LOGIN] Mot de passe incorrect');
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    // Génération du token JWT
    const token = jwt.sign(
      {
        id: utilisateur._id.toString(),
        NomUtilisateur: utilisateur.NomUtilisateur,
        Role: utilisateur.Role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    console.log('✅ [LOGIN] Connexion réussie pour:', utilisateur.NomUtilisateur);

    // Journaliser la connexion
    await logAction({
      utilisateurId: utilisateur._id.toString(),
      nomUtilisateur: utilisateur.NomUtilisateur,
      nomComplet: utilisateur.NomComplet,
      role: utilisateur.Role,
      agence: utilisateur.Agence,
      actionType: "LOGIN",
      tableName: "Utilisateurs",
      recordId: utilisateur._id.toString(),
      details: `Connexion réussie - ${utilisateur.NomUtilisateur}`
    });

    // Retour au frontend
    res.json({
      message: "Connexion réussie",
      token,
      utilisateur: {
        id: utilisateur._id.toString(),
        NomComplet: utilisateur.NomComplet,
        NomUtilisateur: utilisateur.NomUtilisateur,
        Email: utilisateur.Email,
        Agence: utilisateur.Agence,
        Role: utilisateur.Role,
      },
    });

  } catch (error) {
    console.error("❌ [LOGIN] Erreur de connexion :", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
}

// ==================== GESTION DES UTILISATEURS ====================

// Récupérer tous les utilisateurs - MONGODB
async function getAllUsers(req, res) {
  try {
    const utilisateurs = await getDB().collection('utilisateurs')
      .find({})
      .project({
        MotDePasse: 0,
        password: 0
      })
      .sort({ NomComplet: 1 })
      .toArray();

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

    res.json(formattedUsers);

  } catch (error) {
    console.error("Erreur récupération utilisateurs:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
}

// Créer un nouvel utilisateur - MONGODB
async function createUser(req, res) {
  try {
    const { NomUtilisateur, NomComplet, Email, Agence, Role, MotDePasse } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await getDB().collection('utilisateurs').findOne({
      NomUtilisateur: NomUtilisateur
    });

    if (existingUser) {
      return res.status(400).json({ message: "Ce nom d'utilisateur existe déjà" });
    }

    // Hasher le mot de passe
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(MotDePasse, saltRounds);

    // Créer l'utilisateur dans MongoDB
    const newUser = {
      NomUtilisateur,
      NomComplet,
      Email,
      Agence,
      Role,
      MotDePasse: hashedPassword,
      password: hashedPassword,
      DateCreation: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      Actif: true
    };

    const result = await getDB().collection('utilisateurs').insertOne(newUser);
    const newUserId = result.insertedId;

    // Journaliser la création
    await logAction({
      utilisateurId: req.user.id,
      nomUtilisateur: req.user.NomUtilisateur,
      nomComplet: req.user.NomComplet,
      role: req.user.Role,
      agence: req.user.Agence,
      actionType: "CREATE_USER",
      tableName: "Utilisateurs",
      recordId: newUserId.toString(),
      details: `Nouvel utilisateur créé: ${NomComplet} (${Role})`
    });

    res.status(201).json({ 
      message: "Utilisateur créé avec succès", 
      userId: newUserId 
    });

  } catch (error) {
    console.error("Erreur création utilisateur:", error);
    
    if (error.message.includes("duplicate key")) {
      return res.status(400).json({ message: "Ce nom d'utilisateur existe déjà" });
    }
    
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
}

// Modifier un utilisateur - MONGODB
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { NomComplet, Email, Agence, Role, Actif } = req.body;

    // Vérifier que l'utilisateur existe
    const oldUser = await getDB().collection('utilisateurs').findOne(
      { _id: new ObjectId(id) }
    );

    if (!oldUser) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Mettre à jour l'utilisateur
    const updateResult = await getDB().collection('utilisateurs').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          NomComplet,
          Email,
          Agence,
          Role,
          Actif,
          updated_at: new Date()
        } 
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).json({ message: "Aucune modification effectuée" });
    }

    // Journaliser la modification
    await logAction({
      utilisateurId: req.user.id,
      nomUtilisateur: req.user.NomUtilisateur,
      nomComplet: req.user.NomComplet,
      role: req.user.Role,
      agence: req.user.Agence,
      actionType: "UPDATE_USER",
      tableName: "Utilisateurs",
      recordId: id,
      oldValue: JSON.stringify({
        NomComplet: oldUser.NomComplet,
        Email: oldUser.Email,
        Agence: oldUser.Agence,
        Role: oldUser.Role,
        Actif: oldUser.Actif
      }),
      newValue: JSON.stringify({
        NomComplet: NomComplet,
        Email: Email,
        Agence: Agence,
        Role: Role,
        Actif: Actif
      }),
      details: `Utilisateur modifié: ${NomComplet}`
    });

    res.json({ message: "Utilisateur modifié avec succès" });

  } catch (error) {
    console.error("Erreur modification utilisateur:", error);
    
    if (error.message === "Utilisateur non trouvé") {
      return res.status(404).json({ message: error.message });
    }
    
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
}

// Réinitialiser le mot de passe d'un utilisateur - MONGODB
async function resetPassword(req, res) {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // Vérifier que l'utilisateur existe
    const user = await getDB().collection('utilisateurs').findOne(
      { _id: new ObjectId(id) }
    );

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Hasher le nouveau mot de passe
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Mettre à jour le mot de passe
    const updateResult = await getDB().collection('utilisateurs').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          MotDePasse: hashedPassword,
          password: hashedPassword,
          updated_at: new Date()
        } 
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).json({ message: "Échec de la réinitialisation du mot de passe" });
    }

    // Journaliser la réinitialisation
    await logAction({
      utilisateurId: req.user.id,
      nomUtilisateur: req.user.NomUtilisateur,
      nomComplet: req.user.NomComplet,
      role: req.user.Role,
      agence: req.user.Agence,
      actionType: "RESET_PASSWORD",
      tableName: "Utilisateurs",
      recordId: id,
      details: "Mot de passe réinitialisé par l'administrateur"
    });

    res.json({ message: "Mot de passe réinitialisé avec succès" });

  } catch (error) {
    console.error("Erreur réinitialisation mot de passe:", error);
    
    if (error.message === "Utilisateur non trouvé") {
      return res.status(404).json({ message: error.message });
    }
    
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
}

// ==================== PROFIL UTILISATEUR ====================

// Récupérer le profil de l'utilisateur connecté - MONGODB
async function getProfile(req, res) {
  try {
    const userId = req.user.id;

    const user = await getDB().collection('utilisateurs').findOne(
      { _id: new ObjectId(userId) },
      { 
        projection: { 
          MotDePasse: 0,
          password: 0 
        }
      }
    );
    
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    const formattedUser = {
      Id: user._id,
      NomUtilisateur: user.NomUtilisateur,
      NomComplet: user.NomComplet,
      Email: user.Email,
      Agence: user.Agence,
      Role: user.Role
    };

    res.json(formattedUser);

  } catch (error) {
    console.error("Erreur récupération profil:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
}

// Modifier le mot de passe de l'utilisateur connecté - MONGODB
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Récupérer l'utilisateur
    const user = await getDB().collection('utilisateurs').findOne(
      { _id: new ObjectId(userId) }
    );
    
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Vérifier le mot de passe actuel
    const currentPasswordHash = user.MotDePasse || user.password;
    if (!currentPasswordHash) {
      return res.status(400).json({ message: "Aucun mot de passe défini pour cet utilisateur" });
    }

    const isMatch = await bcrypt.compare(currentPassword, currentPasswordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Mot de passe actuel incorrect" });
    }

    // Hasher le nouveau mot de passe
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Mettre à jour le mot de passe
    const updateResult = await getDB().collection('utilisateurs').updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          MotDePasse: hashedPassword,
          password: hashedPassword,
          updated_at: new Date()
        } 
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).json({ message: "Échec de la mise à jour du mot de passe" });
    }

    // Journaliser le changement de mot de passe
    await logAction({
      utilisateurId: user._id.toString(),
      nomUtilisateur: user.NomUtilisateur,
      nomComplet: user.NomComplet,
      role: user.Role,
      agence: user.Agence,
      actionType: "UPDATE_PASSWORD",
      tableName: "Utilisateurs",
      recordId: user._id.toString(),
      details: "Utilisateur a modifié son mot de passe"
    });

    res.json({ message: "Mot de passe modifié avec succès" });

  } catch (error) {
    console.error("Erreur changement mot de passe:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
}

// Vérifier si un nom d'utilisateur existe - MONGODB
async function checkUsername(req, res) {
  try {
    const { username } = req.params;

    const existingUser = await getDB().collection('utilisateurs').findOne({
      NomUtilisateur: username
    });

    res.json({ exists: !!existingUser });

  } catch (error) {
    console.error("Erreur vérification username:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
}

// ==================== ROUTES ====================

// Route publique : connexion
router.post("/login", loginUser);

// Routes protégées pour la gestion des utilisateurs
router.get("/users", verifyToken, getAllUsers);
router.post("/users", verifyToken, createUser);
router.put("/users/:id", verifyToken, updateUser);
router.post("/users/:id/reset-password", verifyToken, resetPassword);
router.get("/check-username/:username", verifyToken, checkUsername);

// Routes pour le profil utilisateur
router.get("/profile", verifyToken, getProfile);
router.post("/change-password", verifyToken, changePassword);

module.exports = router;