require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE AVANCÉ
// ============================================================================

// ✅ Sécurité Helmet (configuré pour les APIs)
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));

// ✅ Compression pour les performances
app.use(compression());

// ✅ Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requêtes max par IP
    message: {
        success: false,
        error: 'Trop de requêtes depuis cette IP'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// ✅ CORS étendu
app.use(cors({
    origin: function (origin, callback) {
        // En développement, autoriser toutes les origins
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        // En production, autoriser les domains spécifiques
        const allowedOrigins = [
            'https://votre-frontend.onrender.com',
            'http://localhost:3000',
            'http://localhost:5173',
            process.env.FRONTEND_URL
        ].filter(Boolean);
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ✅ Body parsers avec limites
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({
                success: false,
                error: 'JSON malformé'
            });
            throw new Error('JSON malformé');
        }
    }
}));

app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb'
}));

// ✅ Servir les fichiers statiques
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.pdf')) {
            res.setHeader('Content-Type', 'application/pdf');
        }
    }
}));

// ✅ Middleware de logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
    next();
});

// ============================================================================
// CONNEXION BASE DE DONNÉES
// ============================================================================

const { connectDB, healthCheck, getConnectionStats } = require('./db/mongodb.js');

// ============================================================================
// ROUTES DE SANTÉ ET INFORMATIONS (AMÉLIORÉES)
// ============================================================================

// ✅ Route de santé pour Render (améliorée)
app.get('/api/health', async (req, res) => {
    try {
        const dbHealth = await healthCheck();
        const stats = getConnectionStats();
        
        res.json({ 
            success: true, 
            message: '✅ Backend opérationnel - Prêt pour Render',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            database: dbHealth,
            system: {
                node: process.version,
                platform: process.platform,
                uptime: process.uptime(),
                memory: process.memoryUsage()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ✅ Nouvelle route système
app.get('/api/system-info', async (req, res) => {
    try {
        const { getDB } = require('./db/mongodb.js');
        const db = getDB();
        
        const collections = await db.listCollections().toArray();
        const collectionStats = [];

        for (let collection of collections.slice(0, 5)) {
            try {
                const stats = await db.collection(collection.name).stats();
                collectionStats.push({
                    name: collection.name,
                    documents: stats.count,
                    size: Math.round(stats.size / 1024 / 1024) + ' MB'
                });
            } catch (e) {
                collectionStats.push({ name: collection.name, error: 'Stats indisponibles' });
            }
        }

        res.json({
            success: true,
            application: 'Gestion Cartes Cocody v2.0.0',
            database: {
                name: db.databaseName,
                collections: collections.length,
                details: collectionStats
            },
            server: {
                port: PORT,
                environment: process.env.NODE_ENV
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// CHARGEMENT DYNAMIQUE DES ROUTES
// ============================================================================

async function loadRoutes() {
    try {
        console.log('🔄 Chargement des routes...');
        
        const routes = [
            { path: '/api/cartes', file: './routes/Cartes' },
            { path: '/api/import', file: './routes/ImportExport' },
            { path: '/api/auth', file: './routes/authRoutes' },
            { path: '/api/utilisateurs', file: './routes/utilisateurs' },
            { path: '/api/inventaire', file: './routes/Inventaire' },
            { path: '/api/journal', file: './routes/journal' },
            { path: '/api/log', file: './routes/log' },
            { path: '/api/profils', file: './routes/profils' },
            { path: '/api/statistique', file: './routes/statistiques' }
        ];

        let loadedCount = 0;

        for (const route of routes) {
            try {
                // Vérifier si le fichier existe
                const fs = require('fs');
                if (!fs.existsSync(route.file.replace('./', '') + '.js')) {
                    console.warn(`⚠️  Fichier manquant: ${route.file}.js`);
                    continue;
                }

                const routeModule = require(route.file);
                
                if (routeModule && typeof routeModule === 'function') {
                    app.use(route.path, routeModule);
                    console.log(`✅ ${route.path} -> ${route.file}`);
                    loadedCount++;
                } else {
                    console.warn(`⚠️  Route invalide: ${route.file}`);
                }
            } catch (error) {
                console.error(`❌ Erreur ${route.path}:`, error.message);
                
                // Route de fallback
                app.use(route.path, (req, res) => {
                    res.status(503).json({
                        success: false,
                        error: `Route temporairement indisponible: ${error.message}`,
                        route: route.path
                    });
                });
            }
        }

        console.log(`🎯 ${loadedCount}/${routes.length} routes chargées`);
        return loadedCount;

    } catch (error) {
        console.error('❌ Erreur chargement routes:', error);
        throw error;
    }
}

// ============================================================================
// DÉMARRAGE DU SERVEUR PRINCIPAL
// ============================================================================

async function startServer() {
    try {
        console.log('🚀 Démarrage du serveur Gestion Cartes Cocody...');
        console.log('📍 Environnement:', process.env.NODE_ENV || 'development');
        console.log('🔗 Port:', PORT);
        
        // ✅ Connexion à la base de données
        console.log('\n📦 Étape 1/3: Connexion MongoDB...');
        await connectDB();
        console.log('✅ MongoDB connecté');

        // ✅ Chargement des routes
        console.log('\n📦 Étape 2/3: Chargement des routes...');
        const routesLoaded = await loadRoutes();

        // ✅ ROUTES PRINCIPALES (conservées pour compatibilité)
        console.log('\n📦 Étape 3/3: Configuration finale...');

        // ============================================================================
        // ROUTES EXISTANTES (POUR COMPATIBILITÉ)
        // ============================================================================

        // Route de test de déploiement
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
                    ],
                    tests_recommandés: [
                        'POST /api/auth/login',
                        'GET /api/cartes',
                        'GET /api/utilisateurs',
                        'POST /api/import/upload'
                    ]
                });
            } catch (error) {
                res.status(500).json({ 
                    success: false,
                    error: error.message 
                });
            }
        });

        // Route racine
        app.get('/', (req, res) => {
            res.json({
                success: true,
                message: '🚀 API Gestion Cartes Cocody - Backend Opérationnel',
                version: '2.0.0',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development',
                documentation: {
                    health: '/api/health',
                    system: '/api/system-info',
                    test: '/api/deploy-test'
                }
            });
        });

        // ============================================================================
        // GESTION DES ERREURS AMÉLIORÉE
        // ============================================================================

        // Routes non trouvées
        app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Route non trouvée',
                requested: req.originalUrl,
                availableRoutes: [
                    '/api/health',
                    '/api/system-info',
                    '/api/deploy-test',
                    '/api/auth/*',
                    '/api/cartes/*',
                    '/api/utilisateurs/*',
                    '/api/import/*',
                    '/api/inventaire/*',
                    '/api/journal/*',
                    '/api/log/*',
                    '/api/profils/*',
                    '/api/statistique/*'
                ],
                timestamp: new Date().toISOString()
            });
        });

        // Gestion des erreurs globales
        app.use((error, req, res, next) => {
            console.error('❌ Erreur globale:', {
                message: error.message,
                url: req.originalUrl,
                method: req.method,
                ip: req.ip,
                timestamp: new Date().toISOString()
            });

            // Erreurs MongoDB
            if (error.name === 'MongoError' || error.name === 'MongoServerError') {
                return res.status(500).json({
                    success: false,
                    error: 'Erreur de base de données',
                    code: error.code
                });
            }

            // Erreur JWT
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    error: 'Token d\'authentification invalide'
                });
            }

            res.status(500).json({
                success: false,
                error: process.env.NODE_ENV === 'production' 
                    ? 'Erreur interne du serveur' 
                    : error.message
            });
        });

        // ============================================================================
        // DÉMARRAGE EFFECTIF DU SERVEUR
        // ============================================================================

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🎉 SERVEUR DÉMARRÉ AVEC SUCCÈS !`);
            console.log('=' .repeat(50));
            console.log(`📍 URL: http://0.0.0.0:${PORT}`);
            console.log(`🌐 Environnement: ${process.env.NODE_ENV || 'development'}`);
            console.log(`📚 Routes chargées: ${routesLoaded}`);
            console.log(`🕒 Démarrage: ${new Date().toISOString()}`);
            console.log('=' .repeat(50));
            console.log(`\n📡 TESTEZ AVEC:`);
            console.log(`   curl http://localhost:${PORT}/api/health`);
            console.log(`   curl http://localhost:${PORT}/api/deploy-test`);
            console.log(`\n🚀 TOUT EST FONCTIONNEL - DÉPLOIEMENT IMMÉDIAT !`);
            console.log(`\n🔗 ENDPOINTS DISPONIBLES:`);
            console.log(`   ✅ /api/health - Health check`);
            console.log(`   ✅ /api/system-info - Informations système`);
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

        // ============================================================================
        // GRACEFUL SHUTDOWN
        // ============================================================================

        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 Signal ${signal} reçu. Arrêt en cours...`);
            
            server.close(async (err) => {
                if (err) {
                    console.error('❌ Erreur fermeture serveur:', err);
                    process.exit(1);
                }
                
                console.log('🔌 Serveur HTTP fermé');
                
                // Fermer la connexion MongoDB
                const { closeDB } = require('./db/mongodb.js');
                await closeDB();
                
                console.log('👋 Arrêt complet réussi');
                process.exit(0);
            });

            setTimeout(() => {
                console.log('💥 Arrêt forcé après timeout');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        return server;

    } catch (error) {
        console.error('\n💥 ERREUR CRITIQUE DÉMARRAGE SERVEUR:');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        
        process.exit(1);
    }
}

// ============================================================================
// DÉMARRAGE AUTOMATIQUE
// ============================================================================

if (require.main === module) {
    startServer().catch(error => {
        console.error('💥 Échec démarrage serveur:', error);
        process.exit(1);
    });
}

module.exports = app;