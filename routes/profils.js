const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const { getDB, mongoDB } = require('../db/mongodb');
const { ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");

// Toutes les routes sont protégées par le token
router.use(verifyToken);

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

// 👤 RÉCUPÉRER LES INFOS DU PROFIL
async function getProfile(req, res) {
  try {
    const userId = req.user.id;

    const user = await getDB().collection('utilisateurs').findOne(
      { _id: new ObjectId(userId) },
      { projection: { 
        MotDePasse: 0,
        password: 0 
      }}
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

// 🔐 MODIFIER LE MOT DE PASSE
async function changePassword(req, res) {
  const session = mongoDB.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      // Récupérer l'utilisateur
      const user = await getDB().collection('utilisateurs').findOne(
        { _id: new ObjectId(userId) },
        { session }
      );
      
      if (!user) {
        throw new Error("Utilisateur non trouvé");
      }

      // Vérifier le mot de passe actuel
      const currentPasswordHash = user.MotDePasse || user.password;
      if (!currentPasswordHash) {
        throw new Error("Aucun mot de passe défini pour cet utilisateur");
      }

      const isMatch = await bcrypt.compare(currentPassword, currentPasswordHash);
      if (!isMatch) {
        throw new Error("Mot de passe actuel incorrect");
      }

      // Hasher le nouveau mot de passe
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Mettre à jour le mot de passe dans MongoDB
      const updateResult = await getDB().collection('utilisateurs').updateOne(
        { _id: new ObjectId(userId) },
        { 
          $set: { 
            MotDePasse: hashedPassword,
            password: hashedPassword,
            updated_at: new Date()
          } 
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error("Échec de la mise à jour du mot de passe");
      }

      // ✅ JOURNALISATION
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
    });
  } catch (error) {
    console.error("Erreur changement mot de passe:", error);
    
    if (error.message === "Mot de passe actuel incorrect") {
      return res.status(401).json({ message: error.message });
    }
    if (error.message === "Utilisateur non trouvé") {
      return res.status(404).json({ message: error.message });
    }
    
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  } finally {
    await session.endSession();
  }
}

// ✏️ METTRE À JOUR LE PROFIL
async function updateProfile(req, res) {
  const session = mongoDB.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      const { NomComplet, Email, Agence } = req.body;
      const userId = req.user.id;

      // Récupérer l'ancien profil
      const oldUser = await getDB().collection('utilisateurs').findOne(
        { _id: new ObjectId(userId) },
        { session }
      );
      
      if (!oldUser) {
        throw new Error("Utilisateur non trouvé");
      }

      // Mettre à jour le profil
      const updateData = { 
        updated_at: new Date()
      };

      if (NomComplet) updateData.NomComplet = NomComplet;
      if (Email) updateData.Email = Email;
      if (Agence) updateData.Agence = Agence;

      const updateResult = await getDB().collection('utilisateurs').updateOne(
        { _id: new ObjectId(userId) },
        { $set: updateData },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error("Aucune modification effectuée");
      }

      // Récupérer le nouveau profil
      const newUser = await getDB().collection('utilisateurs').findOne(
        { _id: new ObjectId(userId) },
        { session }
      );

      // ✅ JOURNALISATION
      await logAction({
        utilisateurId: userId,
        nomUtilisateur: oldUser.NomUtilisateur,
        nomComplet: oldUser.NomComplet,
        role: oldUser.Role,
        agence: oldUser.Agence,
        actionType: "UPDATE_PROFILE",
        tableName: "Utilisateurs",
        recordId: userId,
        oldValue: JSON.stringify({
          NomComplet: oldUser.NomComplet,
          Email: oldUser.Email,
          Agence: oldUser.Agence
        }),
        newValue: JSON.stringify({
          NomComplet: newUser.NomComplet,
          Email: newUser.Email,
          Agence: newUser.Agence
        }),
        details: "Utilisateur a modifié son profil"
      });

      res.json({ 
        message: "Profil mis à jour avec succès",
        user: {
          Id: newUser._id,
          NomUtilisateur: newUser.NomUtilisateur,
          NomComplet: newUser.NomComplet,
          Email: newUser.Email,
          Agence: newUser.Agence,
          Role: newUser.Role
        }
      });
    });
  } catch (error) {
    console.error("Erreur mise à jour profil:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  } finally {
    await session.endSession();
  }
}

// 📧 VÉRIFIER SI L'EMAIL EXISTE
async function checkEmail(req, res) {
  try {
    const { email } = req.query;
    const userId = req.user.id;

    if (!email) {
      return res.status(400).json({ message: "Email requis" });
    }

    const existingUser = await getDB().collection('utilisateurs').findOne({
      Email: email,
      _id: { $ne: new ObjectId(userId) } // Exclure l'utilisateur actuel
    });

    res.json({
      exists: !!existingUser,
      message: existingUser ? "Cet email est déjà utilisé" : "Email disponible"
    });

  } catch (error) {
    console.error("Erreur vérification email:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
}

// 🩺 HEALTH CHECK
async function healthCheck(req, res) {
  res.json({
    success: true,
    status: "✅ Module profils opérationnel",
    timestamp: new Date().toISOString(),
    endpoints: [
      "GET /api/profils",
      "PUT /api/profils/password",
      "PUT /api/profils",
      "GET /api/profils/check-email",
      "GET /api/profils/health"
    ]
  });
}

// 🚀 ROUTES PRINCIPALES
router.get("/", getProfile);
router.put("/password", changePassword);
router.put("/", updateProfile);
router.get("/check-email", checkEmail);
router.get("/health", healthCheck);

module.exports = router;