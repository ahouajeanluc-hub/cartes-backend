const { MongoClient, ServerApiVersion } = require('mongodb');

// Configuration optimisée pour Production + Performance
const client = new MongoClient(process.env.MONGODB_URI, {
    // ✅ Configuration MongoDB Driver moderne
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    
    // ✅ Paramètres de sécurité TLS
    tls: true,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false,
    
    // ✅ Pool de connexions optimisé
    maxPoolSize: 15,
    minPoolSize: 3,
    maxIdleTimeMS: 30000,
    waitQueueTimeoutMS: 10000,
    
    // ✅ Timeouts optimisés
    connectTimeoutMS: 15000,
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 15000,
    heartbeatFrequencyMS: 10000,
    
    // ✅ Politiques de retry intelligentes
    retryWrites: true,
    retryReads: true,
    maxStalenessSeconds: 90,
    
    // ✅ Compression pour performance
    compressors: ['snappy', 'zlib'],
    zlibCompressionLevel: 3,
    
    // ✅ Monitoring
    monitorCommands: false // Désactivé en production pour les perfs
});

let db;
let isConnected = false;

/**
 * Valide l'URI MongoDB
 */
function validateMongoURI() {
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
        throw new Error('❌ MONGODB_URI non définie');
    }
    
    // Masquer l'URI dans les logs pour la sécurité
    const safeURI = uri.replace(/mongodb\+srv:\/\/([^:]+):([^@]+)@/, 'mongodb+srv://$1:****@');
    console.log('🔗 URI MongoDB:', safeURI);
    
    return true;
}

/**
 * Teste la connexion avec ping
 */
async function testConnection() {
    try {
        const adminDb = client.db().admin();
        const pingResult = await adminDb.command({ ping: 1 });
        
        if (pingResult.ok === 1) {
            console.log('✅ Test de connexion MongoDB: SUCCÈS');
            return true;
        } else {
            throw new Error('Échec du test ping');
        }
    } catch (error) {
        console.error('❌ Test de connexion échoué:', error.message);
        throw error;
    }
}

/**
 * Récupère les informations du cluster
 */
async function getClusterInfo() {
    try {
        const adminDb = client.db().admin();
        const serverInfo = await adminDb.command({ buildInfo: 1 });
        
        console.log('📊 Informations MongoDB:');
        console.log('   • Version:', serverInfo.version);
        console.log('   • MongoDB Atlas: ✓ Connecté');
        
        return serverInfo;
    } catch (error) {
        console.log('ℹ️  Informations limitées:', error.message);
        return null;
    }
}

/**
 * Établit la connexion à MongoDB
 */
async function connectDB() {
    try {
        // Vérifier si déjà connecté
        if (isConnected && db) {
            return db;
        }
        
        console.log('🔄 Connexion à MongoDB Atlas...');
        
        // Validation de l'URI
        validateMongoURI();
        
        console.log('📍 Base de données:', process.env.DB_NAME || 'gestioncartes');
        console.log('🌐 Environnement:', process.env.NODE_ENV || 'development');
        
        // Établir la connexion
        console.log('⏳ Connexion en cours...');
        await client.connect();
        
        // Tests de connexion
        await testConnection();
        await getClusterInfo();
        
        // Sélection de la base de données
        db = client.db(process.env.DB_NAME || 'gestioncartes');
        isConnected = true;
        
        console.log('🎉 CONNEXION MONGODB ATLAS RÉUSSIE !');
        console.log('📁 Base de données active:', db.databaseName);
        
        // Vérifier les collections existantes
        try {
            const collections = await db.listCollections().toArray();
            console.log(`📚 Collections (${collections.length}):`, 
                collections.map(c => c.name).join(', '));
        } catch (colError) {
            console.log('ℹ️  Impossible de lister les collections:', colError.message);
        }
        
        return db;
        
    } catch (error) {
        console.error('\n❌ ERREUR CONNEXION MONGODB:');
        
        // Gestion d'erreurs détaillée
        if (error.code === 8000 || error.message.includes('authentication failed')) {
            console.error('🔐 ERREUR AUTHENTIFICATION:');
            console.error('   • Vérifiez le nom d\'utilisateur/mot de passe');
            console.error('   • Vérifiez MongoDB Atlas → Database Access');
        }
        else if (error.code === 'ETIMEOUT') {
            console.error('⏰ TIMEOUT CONNEXION:');
            console.error('   • Vérifiez votre connexion Internet');
            console.error('   • Problème d\'opérateur mobile détecté');
        }
        else {
            console.error('💡 Erreur technique:', error.message);
        }
        
        isConnected = false;
        throw error;
    }
}

/**
 * Récupère l'instance de base de données
 */
function getDB() {
    if (!db || !isConnected) {
        throw new Error('❌ Database non connectée. Appelez connectDB() d\'abord.');
    }
    return db;
}

/**
 * Ferme la connexion à MongoDB - VERSION CORRIGÉE
 */
async function closeDB() {
    try {
        if (client && typeof client.close === 'function' && isConnected) {
            await client.close();
            console.log('🔌 Connexion MongoDB fermée proprement');
        }
        db = null;
        isConnected = false;
    } catch (error) {
        console.warn('⚠️ Avertissement fermeture MongoDB:', error.message);
        // Ne pas throw pour éviter les crashs
    }
}

/**
 * Vérifie l'état de la connexion
 */
function isDBConnected() {
    return isConnected;
}

/**
 * Récupère les statistiques de connexion
 */
function getConnectionStats() {
    return {
        isConnected,
        databaseName: db ? db.databaseName : null,
        maxPoolSize: client.s.options.maxPoolSize,
        currentTime: new Date().toISOString()
    };
}

// ✅ Export pour les sessions
const mongoDB = { 
    client,
    getConnectionStats,
    ObjectId: require('mongodb').ObjectId
};

// ============================================================================
// GESTIONNAIRES D'ÉVÉNEMENTS POUR UN ARRÊT PROPRE - VERSION CORRIGÉE
// ============================================================================

process.on('SIGINT', async () => {
    console.log('\n🛑 Arrêt du serveur (SIGINT)...');
    await closeDB();
    console.log('👋 Arrêt complet');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Arrêt du serveur (SIGTERM)...');
    await closeDB();
    console.log('👋 Arrêt complet');
    process.exit(0);
});

process.on('uncaughtException', async (error) => {
    console.error('\n💥 Exception non capturée:', error);
    await closeDB();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n⚠️  Rejet non géré:', reason);
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    connectDB,
    getDB,
    closeDB,
    isDBConnected,
    getConnectionStats,
    mongoDB,
    
    // Export des méthodes utilitaires
    isValidObjectId: (id) => {
        try {
            return new mongoDB.ObjectId(id).toString() === id;
        } catch {
            return false;
        }
    },
    
    // Méthode de santé pour les checks
    healthCheck: async () => {
        try {
            if (!isConnected) return { status: 'disconnected', error: 'Not connected to MongoDB' };
            
            const db = getDB();
            await db.command({ ping: 1 });
            
            return {
                status: 'connected',
                database: db.databaseName,
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development'
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
};