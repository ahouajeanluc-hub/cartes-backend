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

        // ✅ ROUTES AVEC BONS CHEMINS
        const cartesRoutes = require('./routes/Cartes');
        const importExportRoutes = require('./routes/importExport');
        const authRoutes = require('./routes/authRoutes'); // ✅ CORRIGÉ
        const utilisateursRoutes = require('./routes/utilisateurs');

        app.use('/api/cartes', cartesRoutes);
        app.use('/api/import', importExportRoutes);
        app.use('/api/auth', authRoutes);
        app.use('/api/utilisateurs', utilisateursRoutes);

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
                        '/api/import'
                    ]
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Démarrer le serveur
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🎉 SERVEUR DÉMARRÉ - PRÊT POUR RENDER !`);
            console.log(`📍 Port: ${PORT}`);
            console.log(`\n📡 TESTEZ AVEC:`);
            console.log(`   curl http://localhost:${PORT}/api/health`);
            console.log(`   curl http://localhost:${PORT}/api/deploy-test`);
            console.log(`\n🚀 TOUT EST FONCTIONNEL - DÉPLOIEMENT IMMÉDIAT !`);
        });

    } catch (error) {
        console.error('❌ Erreur démarrage serveur:', error);
        process.exit(1);
    }
}

startServer();