const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const cartesController = require("../Controllers/cartesController"); // ✅ MongoDB

// ✅ Middleware d'authentification sur toutes les routes
router.use(verifyToken);

// ✅ ROUTES GET
router.get("/", cartesController.getAllCartes);
router.get("/all", cartesController.getAllCartes);
router.get("/statistiques/total", cartesController.getStatistiques);
router.get("/:id", cartesController.getCarteById);

// ✅ ROUTE PUT BATCH - MONGODB
router.put("/batch", async (req, res) => {
  try {
    const { cartes, role } = req.body;

    if (!Array.isArray(cartes) || cartes.length === 0) {
      return res.status(400).json({ success: false, error: "Aucune carte reçue" });
    }

    if (!role) {
      return res.status(403).json({ success: false, error: "Rôle manquant" });
    }

    // Normalisation du rôle
    const roleNormalise = (role || "").toLowerCase().trim();
    if (roleNormalise === "operateur" || roleNormalise === "opérateur") {
      return res.status(403).json({
        success: false,
        error: "Opérateurs non autorisés à modifier les cartes",
      });
    }

    const { getDB } = require('../db/mongodb');
    const db = getDB();
    const session = db.client().startSession();
    
    let cartesModifiees = 0;

    try {
      await session.withTransaction(async () => {
        // Filtrer les cartes valides
        const cartesValides = cartes.filter((carte) => {
          if (!carte.ID && !carte._id) {
            console.warn("⚠️ Carte sans ID ignorée:", carte.NOM);
            return false;
          }

          // Support à la fois ID (ancien) et _id (MongoDB)
          const carteId = carte._id || carte.ID;
          const idValide = carteId && carteId.toString().length > 0;

          if (!idValide) {
            console.warn("⚠️ Carte ignorée (ID invalide):", {
              id: carteId,
              nom: carte.NOM,
            });
          }
          return idValide;
        });

        console.log(`📥 ${cartesValides.length}/${cartes.length} cartes valides à traiter`);

        for (const carte of cartesValides) {
          const { ObjectId } = require("mongodb");
          const carteId = carte._id ? new ObjectId(carte._id) : new ObjectId(carte.ID);

          // Construction de l'objet de mise à jour
          const updateData = {
            "LIEU D'ENROLEMENT": carte["LIEU D'ENROLEMENT"] || '',
            "SITE DE RETRAIT": carte["SITE DE RETRAIT"] || '',
            "RANGEMENT": carte.RANGEMENT || '',
            "NOM": carte.NOM || '',
            "PRENOMS": carte.PRENOMS || '',
            "DATE DE NAISSANCE": carte["DATE DE NAISSANCE"] || '',
            "LIEU NAISSANCE": carte["LIEU NAISSANCE"] || '',
            "CONTACT": carte.CONTACT || '',
            "DELIVRANCE": carte.DELIVRANCE || '',
            "CONTACT DE RETRAIT": carte["CONTACT DE RETRAIT"] || '',
            "DATE DE DELIVRANCE": carte["DATE DE DELIVRANCE"] || '',
            updated_at: new Date()
          };

          const result = await db.collection('cartes').updateOne(
            { _id: carteId },
            { $set: updateData },
            { session }
          );

          if (result.modifiedCount > 0) {
            cartesModifiees++;
            
            // ✅ JOURNALISATION MONGODB
            await ajouterAuJournalMongo(
              req.user,
              `Modification carte ID ${carteId}: ${carte.NOM} ${carte.PRENOMS}`,
              session
            );
          }
        }
      });

      console.log("✅ Mise à jour terminée:", {
        modifiees: cartesModifiees,
        ignorees: cartes.length - cartesValides.length,
        total: cartes.length,
      });

      res.json({
        success: true,
        message: `${cartesModifiees} cartes mises à jour avec succès`,
        details: {
          modifiees: cartesModifiees,
          ignorees: cartes.length - cartesValides.length,
          total: cartes.length,
        },
      });

    } catch (error) {
      console.error("❌ Erreur transaction MongoDB:", error);
      throw error;
    } finally {
      await session.endSession();
    }

  } catch (error) {
    console.error("❌ Erreur PUT /cartes/batch:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour des cartes: " + error.message,
    });
  }
});

// ✅ AUTRES ROUTES CRUD
router.post("/", cartesController.createCarte);
router.put("/:id", cartesController.updateCarte);
router.delete("/:id", cartesController.deleteCarte);

// ✅ FONCTION DE JOURNALISATION MONGODB
const ajouterAuJournalMongo = async (utilisateur, action, session = null) => {
  try {
    const { getDB } = require('../db/mongodb');
    const db = getDB();

    const logEntry = {
      UtilisateurID: utilisateur.id,
      NomUtilisateur: utilisateur.NomUtilisateur,
      NomComplet: utilisateur.NomComplet,
      Role: utilisateur.Role,
      Action: action,
      DateAction: new Date(),
      ActionType: 'MODIFICATION_CARTE',
      TableName: 'Cartes',
      TableAffectee: 'Cartes',
      AdresseIP: 'System',
      DetailsAction: action,
      created_at: new Date()
    };

    if (session) {
      await db.collection('journal').insertOne(logEntry, { session });
    } else {
      await db.collection('journal').insertOne(logEntry);
    }
    
    console.log('📝 Journalisation MongoDB réussie');
    
  } catch (error) {
    // ✅ NE BLOQUE PAS L'APPLICATION
    console.warn('⚠️ Journalisation MongoDB ignorée:', error.message);
  }
};

module.exports = router;