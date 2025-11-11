require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connexion DB d'abord
const { connectDB } = require('./db/mongodb.js');

async function startServer() {
    try {
        console.log('🔗 Connexion à MongoDB...');
        await connectDB();
        console.log('✅ MongoDB connecté');

        // ✅ ROUTES AVEC EXACTE CASSE
        const cartesRoutes = require('./routes/Cartes');          // ✅ Cartes.js
        const importExportRoutes = require('./routes/ImportExport'); // ✅ ImportExport.js  
        const authRoutes = require('./routes/authRoutes');        // ✅ authRoutes.js
        const utilisateursRoutes = require('./routes/utilisateurs'); // ✅ utilisateurs.js
        const inventaireRoutes = require('./routes/Inventaire');  // ✅ Inventaire.js
        const journalRoutes = require('./routes/journal');        // ✅ journal.js
        const logRoutes = require('./routes/log');               // ✅ log.js
        const profilsRoutes = require('./routes/profils');       // ✅ profils.js
        const statistiqueRoutes = require('./routes/statistiques'); // ✅ CORRIGÉ : statistiques.js

        app.use('/api/cartes', cartesRoutes);
        app.use('/api/import', importExportRoutes);
        app.use('/api/auth', authRoutes);
        app.use('/api/utilisateurs', utilisateursRoutes);
        app.use('/api/inventaire', inventaireRoutes);
        app.use('/api/journal', journalRoutes);
        app.use('/api/log', logRoutes);
        app.use('/api/profils', profilsRoutes);
        app.use('/api/statistique', statistiqueRoutes);

        // Routes de test
        app.get('/api/health', (req, res) => {
            res.json({ 
                success: true, 
                message: '✅ Backend opérationnel - Prêt pour Render',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development'
            });
        });

        app.get('/api/deploy-test', async (req, res) => {
            try {
                const { getDB } = require('./db/mongodb.js');
                const db = getDB();
                
                const usersCount = await db.collection('utilisateurs').countDocuments();
                const cardsCount = await db.collection('cartes').countDocuments();
                
                res.json({
                    success: true,
                    status: '✅ PRÊT POUR DÉPLOIEMENT',
                    mongodb: 'connecté',
                    database: 'gestioncartes',
                    collections: {
                        utilisateurs: usersCount,
                        cartes: cardsCount
                    },
                    endpoints: [
                        '/api/health',
                        '/api/auth/login', 
                        '/api/cartes',
                        '/api/utilisateurs',
                        '/api/import',
                        '/api/inventaire',
                        '/api/journal',
                        '/api/log', 
                        '/api/profils',
                        '/api/statistique'
                    ]
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Route racine
        app.get('/', (req, res) => {
            res.json({
                success: true,
                message: '🚀 API Gestion Cartes Cocody - Backend Opérationnel',
                version: '2.0.0',
                timestamp: new Date().toISOString(),
                documentation: '/api/health pour les tests'
            });
        });

        // Gestion des routes non trouvées
        app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Route non trouvée',
                availableRoutes: [
                    '/api/health',
                    '/api/deploy-test',
                    '/api/auth/login',
                    '/api/cartes',
                    '/api/utilisateurs',
                    '/api/import',
                    '/api/inventaire',
                    '/api/journal',
                    '/api/log',
                    '/api/profils',
                    '/api/statistique'
                ]
            });
        });

        // Gestion des erreurs globales
        app.use((error, req, res, next) => {
            console.error('❌ Erreur globale:', error);
            res.status(500).json({
                success: false,
                error: 'Erreur interne du serveur',
                message: error.message
            });
        });

        // Démarrer le serveur
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🎉 SERVEUR DÉMARRÉ - PRÊT POUR RENDER !`);
            console.log(`📍 Port: ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`\n📡 TESTEZ AVEC:`);
            console.log(`   curl http://localhost:${PORT}/api/health`);
            console.log(`   curl http://localhost:${PORT}/api/deploy-test`);
            console.log(`\n🚀 TOUT EST FONCTIONNEL - DÉPLOIEMENT IMMÉDIAT !`);
            console.log(`\n🔗 ENDPOINTS DISPONIBLES:`);
            console.log(`   ✅ /api/health - Health check`);
            console.log(`   ✅ /api/auth/* - Authentification`);
            console.log(`   ✅ /api/cartes/* - Gestion des cartes`);
            console.log(`   ✅ /api/utilisateurs/* - Gestion utilisateurs`);
            console.log(`   ✅ /api/import/* - Import/Export`);
            console.log(`   ✅ /api/inventaire/* - Recherche inventaire`);
            console.log(`   ✅ /api/journal/* - Journalisation`);
            console.log(`   ✅ /api/log/* - Logs système`);
            console.log(`   ✅ /api/profils/* - Profils utilisateurs`);
            console.log(`   ✅ /api/statistique/* - Statistiques`);
        });

    } catch (error) {
        console.error('❌ Erreur démarrage serveur:', error);
        process.exit(1);
    }
}

startServer();