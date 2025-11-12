const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { getDB, isDBConnected } = require('../db/mongodb');

// ✅ Middleware d'authentification
router.use(verifyToken);

// 🔍 RECHERCHE MULTICRITÈRES AVEC PAGINATION - VERSION MONGODB
async function rechercheCartes(req, res) {
  try {
    const {
      nom,
      prenom, 
      contact,
      siteRetrait,
      lieuNaissance, 
      dateNaissance,
      rangement,
      page = 1,
      limit = 50
    } = req.query;

    console.log('📦 Critères reçus MongoDB:', req.query);

    // ✅ CALCUL PAGINATION
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // ✅ CONSTRUIRE LA REQUÊTE MONGODB
    let query = {};

    // 🔤 NOM (recherche partielle insensible à la casse)
    if (nom && nom.trim() !== '') {
      query.NOM = { $regex: nom.trim(), $options: 'i' };
    }

    // 🔤 PRÉNOM (recherche partielle insensible à la casse)  
    if (prenom && prenom.trim() !== '') {
      query.PRENOMS = { $regex: prenom.trim(), $options: 'i' };
    }

    // 📞 CONTACT (recherche partielle)
    if (contact && contact.trim() !== '') {
      query.CONTACT = { $regex: contact.trim(), $options: 'i' };
    }

    // 🏢 SITE DE RETRAIT (recherche partielle insensible à la casse)
    if (siteRetrait && siteRetrait.trim() !== '') {
      query["SITE DE RETRAIT"] = { $regex: siteRetrait.trim(), $options: 'i' };
    }

    // 🗺️ LIEU DE NAISSANCE (recherche partielle insensible à la casse)
    if (lieuNaissance && lieuNaissance.trim() !== '') {
      query["LIEU NAISSANCE"] = { $regex: lieuNaissance.trim(), $options: 'i' };
    }

    // 🎂 DATE DE NAISSANCE (exacte)
    if (dateNaissance && dateNaissance.trim() !== '') {
      query["DATE DE NAISSANCE"] = dateNaissance.trim();
    }

    // 📦 RANGEMENT (recherche partielle insensible à la casse)
    if (rangement && rangement.trim() !== '') {
      query.RANGEMENT = { $regex: rangement.trim(), $options: 'i' };
    }

    console.log('📋 Requête MongoDB:', JSON.stringify(query, null, 2));

    // 🗄️ EXÉCUTER LES REQUÊTES MONGODB
    const db = getDB();
    
    // Exécuter les requêtes en parallèle pour meilleures performances
    const [cartes, total] = await Promise.all([
      // Requête pour les données avec pagination
      db.collection('cartes')
        .find(query)
        .sort({ "SITE DE RETRAIT": 1, "NOM": 1 }) // Tri par site puis nom
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      
      // Requête pour le total
      db.collection('cartes').countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limitNum);

    console.log(`✅ ${cartes.length} cartes trouvées sur ${total} total`);
    
    // Debug: vérifier que les IDs sont présents
    if (cartes.length > 0) {
      console.log(`🔍 Premier résultat avec _id: ${cartes[0]._id}`);
      console.log(`🔍 Dernier résultat avec _id: ${cartes[cartes.length - 1]._id}`);
    }

    // Formater la réponse pour inclure à la fois _id (MongoDB) et ID (compatibilité)
    const cartesFormatees = cartes.map(carte => ({
      ...carte,
      ID: carte._id.toString() // ✅ Compatibilité avec l'existant
    }));

    res.json({
      success: true,
      cartes: cartesFormatees,
      total: total,
      page: pageNum,
      totalPages: totalPages,
      limit: limitNum
    });

  } catch (error) {
    console.error('❌ Erreur recherche MongoDB:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recherche dans la base de données',
      details: error.message
    });
  }
}

// ✅ RECHERCHE AVANCÉE AVEC AGRÉGATION
async function rechercheAvancee(req, res) {
  try {
    const { criteres, page = 1, limit = 50 } = req.body;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const db = getDB();

    // Pipeline d'agrégation pour recherches complexes
    const pipeline = [
      { $match: criteres },
      { 
        $project: {
          "LIEU D'ENROLEMENT": 1,
          "SITE DE RETRAIT": 1,
          "RANGEMENT": 1,
          "NOM": 1,
          "PRENOMS": 1,
          "DATE DE NAISSANCE": 1,
          "LIEU NAISSANCE": 1,
          "CONTACT": 1,
          "DELIVRANCE": 1,
          "CONTACT DE RETRAIT": 1,
          "DATE DE DELIVRANCE": 1,
          "ID": "$_id" // ✅ Compatibilité
        }
      },
      { $sort: { "SITE DE RETRAIT": 1, "NOM": 1 } },
      { $skip: skip },
      { $limit: limitNum }
    ];

    const [cartes, total] = await Promise.all([
      db.collection('cartes').aggregate(pipeline).toArray(),
      db.collection('cartes').countDocuments(criteres)
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      cartes: cartes,
      total: total,
      page: pageNum,
      totalPages: totalPages,
      limit: limitNum
    });

  } catch (error) {
    console.error('❌ Erreur recherche avancée MongoDB:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recherche avancée',
      details: error.message
    });
  }
}

// 📊 STATISTIQUES DE L'INVENTAIRE
async function getStatistiques(req, res) {
  try {
    const db = getDB();
    
    // Total des cartes
    const total = await db.collection('cartes').countDocuments();
    
    // Cartes retirées
    const retires = await db.collection('cartes').countDocuments({
      DELIVRANCE: { $ne: '', $exists: true, $ne: null }
    });
    
    // Statistiques par site
    const statsSites = await db.collection('cartes').aggregate([
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

    res.json({
      success: true,
      globales: {
        total: total,
        retires: retires,
        restants: total - retires,
        tauxRetrait: total > 0 ? Math.round((retires / total) * 100) : 0
      },
      parSite: statsSites,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erreur statistiques inventaire:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du calcul des statistiques',
      details: error.message
    });
  }
}

// 📋 OBTENIR TOUS LES SITES DE RETRAIT DISTINCTS
async function getSites(req, res) {
  try {
    const db = getDB();
    
    const sites = await db.collection('cartes').distinct("SITE DE RETRAIT", {
      "SITE DE RETRAIT": { $ne: '', $exists: true, $ne: null }
    });
    
    res.json({
      success: true,
      sites: sites.sort(),
      total: sites.length
    });

  } catch (error) {
    console.error('❌ Erreur récupération sites:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des sites',
      details: error.message
    });
  }
}

// 🔄 SYNCHRONISER/RAFRAÎCHIR L'INVENTAIRE
async function synchroniserInventaire(req, res) {
  try {
    const db = getDB();
    
    // Compter à nouveau toutes les cartes
    const total = await db.collection('cartes').countDocuments();
    const retires = await db.collection('cartes').countDocuments({
      DELIVRANCE: { $ne: '', $exists: true, $ne: null }
    });

    res.json({
      success: true,
      message: 'Inventaire synchronisé avec succès',
      statistiques: {
        total: total,
        retires: retires,
        restants: total - retires,
        tauxRetrait: total > 0 ? Math.round((retires / total) * 100) : 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erreur synchronisation inventaire:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la synchronisation',
      details: error.message
    });
  }
}

// 📍 OBTENIR LES LIEUX D'ENRÔLEMENT DISTINCTS
async function getLieuxEnrolement(req, res) {
  try {
    const db = getDB();
    
    const lieux = await db.collection('cartes').distinct("LIEU D'ENROLEMENT", {
      "LIEU D'ENROLEMENT": { $ne: '', $exists: true, $ne: null }
    });
    
    res.json({
      success: true,
      lieux: lieux.sort(),
      total: lieux.length
    });

  } catch (error) {
    console.error('❌ Erreur récupération lieux enrôlement:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des lieux d\'enrôlement',
      details: error.message
    });
  }
}

// 🎯 SANTÉ DE L'INVENTAIRE
async function healthCheck(req, res) {
  try {
    res.json({
      success: true,
      status: '✅ Inventaire opérationnel',
      mongodb: isDBConnected() ? '✅ Connecté' : '❌ Déconnecté',
      routes: [
        'GET /api/inventaire/recherche',
        'POST /api/inventaire/recherche-avancee', 
        'GET /api/inventaire/statistiques',
        'GET /api/inventaire/sites',
        'POST /api/inventaire/synchroniser',
        'GET /api/inventaire/lieux-enrolement',
        'GET /api/inventaire/health'
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erreur health check inventaire:', error);
    res.status(500).json({
      success: false,
      status: '❌ Inventaire en erreur',
      error: error.message
    });
  }
}

// 🚀 ROUTES PRINCIPALES
router.get('/recherche', rechercheCartes);
router.post('/recherche-avancee', rechercheAvancee);
router.get('/statistiques', getStatistiques);
router.get('/sites', getSites);
router.post('/synchroniser', synchroniserInventaire);
router.get('/lieux-enrolement', getLieuxEnrolement);
router.get('/health', healthCheck);

module.exports = router;