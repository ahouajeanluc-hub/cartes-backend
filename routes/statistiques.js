const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth"); // ✅ AJOUT AUTH
const { getDB } = require('../db/mongodb'); // ✅ MONGODB

// ✅ AJOUT: Middleware d'authentification
router.use(verifyToken);

// 🔹 STATISTIQUES GLOBALES OPTIMISÉES - MONGODB
router.get("/globales", async (req, res) => {
  try {
    console.log("📊 Calcul des statistiques globales MongoDB...");
    
    const db = getDB();
    
    // Compter le total des cartes
    const total = await db.collection('cartes').countDocuments();
    
    // Compter les cartes retirées (DELIVRANCE non vide)
    const retires = await db.collection('cartes').countDocuments({
      DELIVRANCE: { $ne: '', $exists: true, $ne: null }
    });

    const response = {
      total: total,
      retires: retires,
      restants: total - retires
    };

    console.log("✅ Statistiques globales MongoDB:", response);
    res.json(response);
    
  } catch (error) {
    console.error("❌ Erreur statistiques globales MongoDB:", error);
    res.status(500).json({ 
      error: "Erreur lors du calcul des statistiques globales",
      details: error.message 
    });
  }
});

// 🔹 STATISTIQUES PAR SITE OPTIMISÉES - MONGODB
router.get("/sites", async (req, res) => {
  try {
    console.log("🏢 Calcul des statistiques par site MongoDB...");
    
    const db = getDB();
    
    // Agrégation MongoDB pour les stats par site
    const stats = await db.collection('cartes').aggregate([
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

    console.log(`✅ ${stats.length} sites trouvés avec MongoDB`);
    res.json(stats);
    
  } catch (error) {
    console.error("❌ Erreur statistiques sites MongoDB:", error);
    res.status(500).json({ 
      error: "Erreur lors du calcul des statistiques par site",
      details: error.message 
    });
  }
});

// 🔹 STATISTIQUES DÉTAILLÉES (tout en un) - MONGODB
router.get("/detail", async (req, res) => {
  try {
    const db = getDB();
    
    // Exécuter les deux agrégations en parallèle
    const [globalesResult, sitesResult] = await Promise.all([
      // Statistiques globales
      (async () => {
        const total = await db.collection('cartes').countDocuments();
        const retires = await db.collection('cartes').countDocuments({
          DELIVRANCE: { $ne: '', $exists: true, $ne: null }
        });
        return { total, retires };
      })(),
      
      // Statistiques par site
      db.collection('cartes').aggregate([
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
      ]).toArray()
    ]);

    const response = {
      globales: {
        total: globalesResult.total,
        retires: globalesResult.retires,
        restants: globalesResult.total - globalesResult.retires
      },
      sites: sitesResult
    };

    res.json(response);
    
  } catch (error) {
    console.error("❌ Erreur statistiques détail MongoDB:", error);
    res.status(500).json({ 
      error: "Erreur lors du calcul des statistiques détaillées",
      details: error.message 
    });
  }
});

// 🔥 ENDPOINT POUR FORCER LE REFRESH - MONGODB
router.post("/refresh", async (req, res) => {
  try {
    console.log("🔄 Forçage du recalcul des statistiques MongoDB...");
    
    // Les stats MongoDB sont toujours en temps réel
    res.json({ 
      message: "Synchronisation des statistiques MongoDB déclenchée",
      timestamp: new Date().toISOString(),
      database: "MongoDB Atlas"
    });
    
  } catch (error) {
    console.error("❌ Erreur refresh statistiques MongoDB:", error);
    res.status(500).json({ 
      error: "Erreur lors du refresh des statistiques",
      details: error.message 
    });
  }
});

module.exports = router;