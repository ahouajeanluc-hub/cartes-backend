const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const { getDB } = require('../db/mongodb');

router.use(verifyToken);

// 🔹 STATISTIQUES GLOBALES - VERSION CORRIGÉE
router.get("/globales", async (req, res) => {
  try {
    console.log("📊 Calcul des statistiques globales MongoDB...");
    
    const db = getDB();
    
    const result = await db.collection('cartes').aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          retires: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $ne: ["$DELIVRANCE", null] },
                    { $ne: ["$DELIVRANCE", ""] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]).toArray();

    const stats = result[0] || { total: 0, retires: 0 };
    const response = {
      success: true,
      total: stats.total,
      retires: stats.retires,
      restants: stats.total - stats.retires,
      tauxRetrait: stats.total > 0 ? Math.round((stats.retires / stats.total) * 100) : 0
    };

    console.log("✅ Statistiques globales:", response);
    res.json(response);
    
  } catch (error) {
    console.error("❌ Erreur statistiques globales:", error);
    res.status(500).json({ 
      success: false,
      error: "Erreur lors du calcul des statistiques globales",
      details: error.message 
    });
  }
});

// 🔹 STATISTIQUES PAR SITE - VERSION CORRIGÉE
router.get("/sites", async (req, res) => {
  try {
    console.log("🏢 Calcul des statistiques par site...");
    
    const db = getDB();
    
    const stats = await db.collection('cartes').aggregate([
      {
        $match: {
          "SITE DE RETRAIT": { 
            $ne: null, 
            $ne: "",
            $exists: true 
          }
        }
      },
      {
        $group: {
          _id: "$SITE DE RETRAIT",
          total: { $sum: 1 },
          retires: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $ne: ["$DELIVRANCE", null] },
                    { $ne: ["$DELIVRANCE", ""] }
                  ]
                },
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
          restants: { $subtract: ["$total", "$retires"] },
          tauxRetrait: {
            $cond: [
              { $eq: ["$total", 0] },
              0,
              { $round: [{ $multiply: [{ $divide: ["$retires", "$total"] }, 100] }, 2] }
            ]
          }
        }
      },
      { $sort: { total: -1 } }
    ]).toArray();

    console.log(`✅ ${stats.length} sites trouvés`);
    res.json({
      success: true,
      sites: stats
    });
    
  } catch (error) {
    console.error("❌ Erreur statistiques sites:", error);
    res.status(500).json({ 
      success: false,
      error: "Erreur lors du calcul des statistiques par site",
      details: error.message 
    });
  }
});

// 🔹 STATISTIQUES DÉTAILLÉES
router.get("/detail", async (req, res) => {
  try {
    const db = getDB();
    
    const [globalesResult, sitesResult] = await Promise.all([
      db.collection('cartes').aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            retires: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      { $ne: ["$DELIVRANCE", null] },
                      { $ne: ["$DELIVRANCE", ""] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]).toArray(),
      
      db.collection('cartes').aggregate([
        {
          $match: {
            "SITE DE RETRAIT": { 
              $ne: null, 
              $ne: "",
              $exists: true 
            }
          }
        },
        {
          $group: {
            _id: "$SITE DE RETRAIT",
            total: { $sum: 1 },
            retires: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      { $ne: ["$DELIVRANCE", null] },
                      { $ne: ["$DELIVRANCE", ""] }
                    ]
                  },
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

    const globales = globalesResult[0] || { total: 0, retires: 0 };

    const response = {
      success: true,
      globales: {
        total: globales.total,
        retires: globales.retires,
        restants: globales.total - globales.retires,
        tauxRetrait: globales.total > 0 ? Math.round((globales.retires / globales.total) * 100) : 0
      },
      sites: sitesResult,
      timestamp: new Date().toISOString()
    };

    res.json(response);
    
  } catch (error) {
    console.error("❌ Erreur statistiques détail:", error);
    res.status(500).json({ 
      success: false,
      error: "Erreur lors du calcul des statistiques détaillées",
      details: error.message 
    });
  }
});

// 🔄 FORCER LE REFRESH
router.post("/refresh", async (req, res) => {
  try {
    console.log("🔄 Refresh des statistiques...");
    
    res.json({ 
      success: true,
      message: "Synchronisation des statistiques déclenchée",
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Erreur refresh:", error);
    res.status(500).json({ 
      success: false,
      error: "Erreur lors du refresh",
      details: error.message 
    });
  }
});

module.exports = router;