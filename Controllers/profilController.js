const bcrypt = require("bcrypt");
const { getDB, mongoDB } = require('../db/mongodb'); // ✅ IMPORT CORRIGÉ
const journalController = require("./journalController");
const { ObjectId } = require("mongodb");

exports.getProfile = async (req, res) => {
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
};

exports.changePassword = async (req, res) => {
  // ✅ CORRECTION : Session MongoDB correcte
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

      // ✅ JOURNALISATION avec le système existant
      await journalController.logAction({
        utilisateurId: user._id.toString(),
        nomUtilisateur: user.NomUtilisateur,
        nomComplet: user.NomComplet,
        role: user.Role,
        agence: user.Agence,
        action: "Changement de mot de passe",
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
};

// 🔄 MÉTHODE SUPPLEMENTAIRE : Mettre à jour le profil
exports.updateProfile = async (req, res) => {
  // ✅ CORRECTION : Session MongoDB correcte
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
      await journalController.logAction({
        utilisateurId: userId,
        nomUtilisateur: oldUser.NomUtilisateur,
        nomComplet: oldUser.NomComplet,
        role: oldUser.Role,
        agence: oldUser.Agence,
        action: "Mise à jour du profil",
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
};

// 🔄 MÉTHODE SUPPLEMENTAIRE : Vérifier si l'email existe
exports.checkEmail = async (req, res) => {
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
};