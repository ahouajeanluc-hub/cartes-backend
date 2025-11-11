const { getDB } = require('../db/mongodb');

const StatistiquesController = {
  // 📊 STATISTIQUES GLOBALES
  getStatistiquesGlobales: async (req, res) => {
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
        success: true,
        total: total,
        retires: retires,
        restants: total - retires,
        tauxRetrait: total > 0 ? Math.round((retires / total) * 100) : 0
      };

      console.log("✅ Statistiques globales MongoDB:", response);
      res.json(response);
      
    } catch (error) {
      console.error("❌ Erreur statistiques globales MongoDB:", error);
      res.status(500).json({ 
        success: false,
        error: "Erreur lors du calcul des statistiques globales",
        details: error.message 
      });
    }
  },

  // 🏢 STATISTIQUES PAR SITE
  getStatistiquesSites: async (req, res) => {
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

      console.log(`✅ ${stats.length} sites trouvés avec MongoDB`);
      res.json({
        success: true,
        sites: stats
      });
      
    } catch (error) {
      console.error("❌ Erreur statistiques sites MongoDB:", error);
      res.status(500).json({ 
        success: false,
        error: "Erreur lors du calcul des statistiques par site",
        details: error.message 
      });
    }
  },

  // 📈 STATISTIQUES DÉTAILLÉES (tout en un)
  getStatistiquesDetail: async (req, res) => {
    try {
      const db = getDB();
      
      // Exécuter les agrégations en parallèle
      const [globalesResult, sitesResult, evolutionMensuelle] = await Promise.all([
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
        ]).toArray(),

        // Évolution mensuelle (si created_at existe)
        db.collection('cartes').aggregate([
          {
            $match: {
              created_at: { $exists: true }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: "$created_at" },
                month: { $month: "$created_at" }
              },
              count: { $sum: 1 }
            }
          },
          {
            $sort: { "_id.year": 1, "_id.month": 1 }
          },
          {
            $limit: 12
          }
        ]).toArray()
      ]);

      const response = {
        success: true,
        globales: {
          total: globalesResult.total,
          retires: globalesResult.retires,
          restants: globalesResult.total - globalesResult.retires,
          tauxRetrait: globalesResult.total > 0 ? 
            Math.round((globalesResult.retires / globalesResult.total) * 100) : 0
        },
        sites: sitesResult,
        evolution: evolutionMensuelle,
        timestamp: new Date().toISOString()
      };

      res.json(response);
      
    } catch (error) {
      console.error("❌ Erreur statistiques détail MongoDB:", error);
      res.status(500).json({ 
        success: false,
        error: "Erreur lors du calcul des statistiques détaillées",
        details: error.message 
      });
    }
  },

  // 🔄 FORCER LE RECALCUL
  refreshStatistiques: async (req, res) => {
    try {
      console.log("🔄 Forçage du recalcul des statistiques MongoDB...");
      
      // Les stats MongoDB sont toujours en temps réel
      // Cette fonction peut être utilisée pour vider un cache si nécessaire
      
      res.json({ 
        success: true,
        message: "Synchronisation des statistiques MongoDB déclenchée",
        timestamp: new Date().toISOString(),
        database: "MongoDB Atlas"
      });
      
    } catch (error) {
      console.error("❌ Erreur refresh statistiques MongoDB:", error);
      res.status(500).json({ 
        success: false,
        error: "Erreur lors du refresh des statistiques",
        details: error.message 
      });
    }
  }
};

module.exports = StatistiquesController;