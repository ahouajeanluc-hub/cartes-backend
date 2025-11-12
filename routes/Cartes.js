const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const { getDB, mongoDB } = require('../db/mongodb');
const { ObjectId } = require('mongodb');

// ✅ Middleware d'authentification sur toutes les routes
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

// 🔹 METTRE À JOUR UNE CARTE
async function updateCarte(req, res) {
  const session = mongoDB.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      const carte = req.body;
      const carteId = req.params.id;

      console.log('🔄 updateCarte - Début ID:', carteId);

      // Récupérer l'ancienne valeur avant modification
      const ancienneCarte = await getDB().collection('cartes').findOne(
        { _id: new ObjectId(carteId) },
        { session }
      );

      if (!ancienneCarte) {
        throw new Error("Carte non trouvée");
      }

      // Vérification des rôles insensible à la casse
      const userRole = (req.user.role || "").toLowerCase();
      let canUpdateAll = ["administrateur", "superviseur", "chef d'équipe", "chef d'equipe"]
        .some(role => userRole.includes(role));
      let canUpdateLimited = userRole.includes("opérateur") || userRole.includes("operateur");

      // Construction de l'objet de mise à jour selon rôle
      let updateFields = { updated_at: new Date() };

      if (canUpdateAll) {
        // Toutes les colonnes modifiables
        updateFields["LIEU D'ENROLEMENT"] = carte["LIEU D'ENROLEMENT"] || '';
        updateFields["SITE DE RETRAIT"] = carte["SITE DE RETRAIT"] || '';
        updateFields.RANGEMENT = carte.RANGEMENT || '';
        updateFields.NOM = carte.NOM || '';
        updateFields.PRENOMS = carte.PRENOMS || '';
        updateFields["DATE DE NAISSANCE"] = carte["DATE DE NAISSANCE"] || '';
        updateFields["LIEU NAISSANCE"] = carte["LIEU NAISSANCE"] || '';
        updateFields.CONTACT = carte.CONTACT || '';
        updateFields.DELIVRANCE = carte.DELIVRANCE || '';
        updateFields["CONTACT DE RETRAIT"] = carte["CONTACT DE RETRAIT"] || '';
        updateFields["DATE DE DELIVRANCE"] = carte["DATE DE DELIVRANCE"] || '';
      } else if (canUpdateLimited) {
        // Opérateurs: seulement 3 colonnes modifiables
        updateFields.DELIVRANCE = carte.DELIVRANCE || '';
        updateFields["CONTACT DE RETRAIT"] = carte["CONTACT DE RETRAIT"] || '';
        updateFields["DATE DE DELIVRANCE"] = carte["DATE DE DELIVRANCE"] || '';
      } else {
        throw new Error("Non autorisé");
      }

      // Mise à jour MongoDB
      const result = await getDB().collection('cartes').updateOne(
        { _id: new ObjectId(carteId) },
        { $set: updateFields },
        { session }
      );

      console.log('📊 updateCarte - Lignes affectées:', result.modifiedCount);

      if (result.modifiedCount === 0) {
        throw new Error("Aucune modification effectuée");
      }

      // Récupérer la nouvelle valeur après modification
      const nouvelleCarte = await getDB().collection('cartes').findOne(
        { _id: new ObjectId(carteId) },
        { session }
      );

      // JOURNALISATION
      await logAction({
        utilisateurId: req.user.id,
        nomUtilisateur: req.user.nomUtilisateur,
        nomComplet: req.user.nomComplet,
        role: req.user.role,
        agence: req.user.agence,
        actionType: 'MODIFICATION_CARTE',
        tableName: 'Cartes',
        recordId: carteId.toString(),
        oldValue: JSON.stringify(ancienneCarte),
        newValue: JSON.stringify(nouvelleCarte),
        ip: req.ip,
        details: `Modification carte ID ${carteId} - ${carte.NOM} ${carte.PRENOMS}`
      });

      console.log('✅ updateCarte - Succès ID:', carteId);
      res.json({ 
        success: true, 
        message: "Carte mise à jour ✅",
        carteId: carteId
      });
    });
  } catch (err) {
    console.error('❌ Erreur updateCarte ID:', req.params.id, ':', err.message);
    res.status(500).json({ 
      success: false, 
      message: "Erreur serveur: " + err.message 
    });
  } finally {
    await session.endSession();
  }
}

// 🔹 OBTENIR TOUTES LES CARTES
async function getAllCartes(req, res) {
  try {
    const { page = 1, limit = 100, search = '' } = req.query;
    const skip = (page - 1) * limit;

    // Construction de la query de recherche
    let query = {};
    if (search) {
      query = {
        $or: [
          { NOM: { $regex: search, $options: 'i' } },
          { PRENOMS: { $regex: search, $options: 'i' } },
          { CONTACT: { $regex: search, $options: 'i' } },
          { "SITE DE RETRAIT": { $regex: search, $options: 'i' } }
        ]
      };
    }

    const [cartes, total] = await Promise.all([
      getDB().collection('cartes')
        .find(query)
        .sort({ _id: 1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray(),
      getDB().collection('cartes').countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      cartes: cartes,
      total: total,
      page: parseInt(page),
      totalPages: totalPages,
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('❌ Erreur getAllCartes:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
}

// 🔹 OBTENIR UNE CARTE PAR ID
async function getCarteById(req, res) {
  try {
    const carte = await getDB().collection('cartes').findOne(
      { _id: new ObjectId(req.params.id) }
    );

    if (!carte) {
      return res.status(404).json({ 
        success: false,
        message: 'Carte non trouvée' 
      });
    }

    res.json({
      success: true,
      carte: carte
    });
  } catch (err) {
    console.error('❌ Erreur getCarteById:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
}

// 🔹 CRÉER UNE NOUVELLE CARTE
async function createCarte(req, res) {
  const session = mongoDB.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      const carte = req.body;

      const nouvelleCarte = {
        "LIEU D'ENROLEMENT": carte["LIEU D'ENROLEMENT"] || '',
        "SITE DE RETRAIT": carte["SITE DE RETRAIT"] || '',
        RANGEMENT: carte.RANGEMENT || '',
        NOM: carte.NOM || '',
        PRENOMS: carte.PRENOMS || '',
        "DATE DE NAISSANCE": carte["DATE DE NAISSANCE"] || '',
        "LIEU NAISSANCE": carte["LIEU NAISSANCE"] || '',
        CONTACT: carte.CONTACT || '',
        DELIVRANCE: carte.DELIVRANCE || '',
        "CONTACT DE RETRAIT": carte["CONTACT DE RETRAIT"] || '',
        "DATE DE DELIVRANCE": carte["DATE DE DELIVRANCE"] || '',
        created_at: new Date(),
        updated_at: new Date()
      };

      const result = await getDB().collection('cartes').insertOne(
        nouvelleCarte,
        { session }
      );

      const newId = result.insertedId;

      // JOURNALISATION
      await logAction({
        utilisateurId: req.user.id,
        nomUtilisateur: req.user.nomUtilisateur,
        nomComplet: req.user.nomComplet,
        role: req.user.role,
        agence: req.user.agence,
        actionType: 'CREATION_CARTE',
        tableName: 'Cartes',
        recordId: newId.toString(),
        oldValue: null,
        newValue: JSON.stringify(nouvelleCarte),
        ip: req.ip,
        details: `Création nouvelle carte - ${carte.NOM} ${carte.PRENOMS}`
      });

      console.log('✅ createCarte - Succès ID:', newId);
      res.json({ 
        success: true, 
        message: "Carte créée avec succès ✅",
        id: newId
      });
    });
  } catch (err) {
    console.error('❌ Erreur createCarte:', err.message);
    res.status(500).json({ 
      success: false, 
      message: "Erreur serveur: " + err.message 
    });
  } finally {
    await session.endSession();
  }
}

// 🔹 SUPPRIMER UNE CARTE
async function deleteCarte(req, res) {
  const session = mongoDB.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      const carteId = req.params.id;

      // Récupérer la carte avant suppression pour la journalisation
      const ancienneCarte = await getDB().collection('cartes').findOne(
        { _id: new ObjectId(carteId) },
        { session }
      );

      if (!ancienneCarte) {
        throw new Error("Carte non trouvée");
      }

      const result = await getDB().collection('cartes').deleteOne(
        { _id: new ObjectId(carteId) },
        { session }
      );

      if (result.deletedCount === 0) {
        throw new Error("Aucune carte supprimée");
      }

      // JOURNALISATION
      await logAction({
        utilisateurId: req.user.id,
        nomUtilisateur: req.user.nomUtilisateur,
        nomComplet: req.user.nomComplet,
        role: req.user.role,
        agence: req.user.agence,
        actionType: 'SUPPRESSION_CARTE',
        tableName: 'Cartes',
        recordId: carteId.toString(),
        oldValue: JSON.stringify(ancienneCarte),
        newValue: null,
        ip: req.ip,
        details: `Suppression carte ID ${carteId} - ${ancienneCarte.NOM} ${ancienneCarte.PRENOMS}`
      });

      console.log('✅ deleteCarte - Succès ID:', carteId);
      res.json({ 
        success: true, 
        message: "Carte supprimée avec succès ✅"
      });
    });
  } catch (err) {
    console.error('❌ Erreur deleteCarte ID:', req.params.id, ':', err.message);
    res.status(500).json({ 
      success: false, 
      message: "Erreur serveur: " + err.message 
    });
  } finally {
    await session.endSession();
  }
}

// 🔹 OBTENIR LES STATISTIQUES
async function getStatistiques(req, res) {
  try {
    // Total des cartes
    const total = await getDB().collection('cartes').countDocuments();

    // Cartes retirées (avec DELIVRANCE non vide)
    const retires = await getDB().collection('cartes').countDocuments({
      DELIVRANCE: { $ne: '', $exists: true, $ne: null }
    });

    const restants = total - retires;

    // Statistiques par site - Utilisation d'aggregation MongoDB
    const sitesStats = await getDB().collection('cartes').aggregate([
      {
        $match: {
          "SITE DE RETRAIT": { $ne: '', $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: "$SITE DE RETRAIT",
          total: { $sum: 1 },
          retires: {
            $sum: {
              $cond: [
                { $and: [
                  { $ne: ["$DELIVRANCE", ""] },
                  { $ne: ["$DELIVRANCE", null] }
                ]},
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          site: "$_id",
          total: 1,
          retires: 1,
          restants: { $subtract: ["$total", "$retires"] }
        }
      },
      { $sort: { total: -1 } }
    ]).toArray();

    // Formatage des statistiques par site
    const parSite = {};
    sitesStats.forEach(site => {
      parSite[site.site] = {
        total: site.total,
        retires: site.retires,
        restants: site.restants
      };
    });

    res.json({
      success: true,
      total: total,
      retires: retires,
      disponibles: restants,
      parSite: parSite
    });

  } catch (err) {
    console.error('❌ Erreur getStatistiques:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
}

// 🔹 ROUTE PUT BATCH - MONGODB
async function updateCartesBatch(req, res) {
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
            
            // ✅ JOURNALISATION
            await logAction({
              utilisateurId: req.user.id,
              nomUtilisateur: req.user.NomUtilisateur,
              nomComplet: req.user.NomComplet,
              role: req.user.Role,
              actionType: 'MODIFICATION_CARTE',
              tableName: 'Cartes',
              recordId: carteId.toString(),
              ip: req.ip,
              details: `Modification batch carte ID ${carteId}: ${carte.NOM} ${carte.PRENOMS}`
            });
          }
        }
      });

      console.log("✅ Mise à jour batch terminée:", {
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
}

// 🚀 ROUTES PRINCIPALES
router.get("/", getAllCartes);
router.get("/all", getAllCartes);
router.get("/statistiques/total", getStatistiques);
router.get("/:id", getCarteById);
router.post("/", createCarte);
router.put("/:id", updateCarte);
router.delete("/:id", deleteCarte);
router.put("/batch", updateCartesBatch);

module.exports = router;