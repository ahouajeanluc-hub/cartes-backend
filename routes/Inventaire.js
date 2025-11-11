const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const inventaireController = require('../Controllers/inventaire'); // ✅ CORRIGÉ : inventaire.js

// ✅ AJOUT: Middleware d'authentification
router.use(verifyToken);

// 🔍 Route de recherche multicritères
router.get('/recherche', inventaireController.rechercheCartes);

// 🔍 Route de recherche avancée (POST pour les critères complexes)
router.post('/recherche-avancee', inventaireController.rechercheAvancee);

// 📊 Route pour les statistiques de l'inventaire
router.get('/statistiques', async (req, res) => {
    try {
        const { getDB } = require('../db/mongodb');
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
});

// 📋 Route pour obtenir tous les sites de retrait distincts
router.get('/sites', async (req, res) => {
    try {
        const { getDB } = require('../db/mongodb');
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
});

// 🔄 Route pour synchroniser/rafraîchir l'inventaire
router.post('/synchroniser', async (req, res) => {
    try {
        const { getDB } = require('../db/mongodb');
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
});

// 📍 Route pour obtenir les lieux d'enrôlement distincts
router.get('/lieux-enrolement', async (req, res) => {
    try {
        const { getDB } = require('../db/mongodb');
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
});

// 🎯 Route de santé de l'inventaire
router.get('/health', async (req, res) => {
    try {
        const { getDB, isDBConnected } = require('../db/mongodb');
        
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
});

module.exports = router;