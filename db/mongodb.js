const { MongoClient } = require('mongodb');

// Configuration optimisée pour Render + Atlas
const client = new MongoClient(process.env.MONGODB_URI, {
    // ✅ Paramètres TLS corrigés
    tls: true,
    tlsAllowInvalidCertificates: false,
    
    // ✅ Pool de connexions
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    
    // ✅ Timeouts
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 10000,
    
    // ✅ Retry policies
    retryWrites: true,
    retryReads: true
});

let db;
let isConnected = false;

/**
 * Connexion à MongoDB Atlas
 */
async function connectDB() {
    try {
        if (isConnected && db) {
            return db;
        }
        
        console.log('🔄 Connexion à MongoDB Atlas...');
        console.log('📍 URI:', process.env.MONGODB_URI ? '✓ Définie' : '✗ Non définie');
        
        await client.connect();
        
        // Test de connexion
        await client.db().command({ ping: 1 });
        
        db = client.db(process.env.DB_NAME || 'gestioncartes');
        isConnected = true;
        
        console.log('✅ Connecté à MongoDB Atlas avec succès');
        console.log('📁 Base de données:', db.databaseName);
        
        return db;
    } catch (error) {
        console.error('❌ Erreur de connexion à MongoDB Atlas:', error.message);
        console.error('💡 Détails:', {
            name: error.name,
            code: error.code
        });
        
        isConnected = false;
        throw error;
    }
}

/**
 * Récupère l'instance de la base de données
 */
function getDB() {
    if (!db || !isConnected) {
        throw new Error('❌ Database non connectée. Appelez connectDB() d\'abord.');
    }
    return db;
}

/**
 * Ferme la connexion
 */
async function closeDB() {
    try {
        await client.close();
        console.log('🔌 Connexion MongoDB fermée');
        db = null;
        isConnected = false;
    } catch (error) {
        console.error('❌ Erreur fermeture MongoDB:', error.message);
    }
}

/**
 * Vérifie si la base de données est connectée
 */
function isDBConnected() {
    return isConnected;
}

// Gestionnaire pour les arrêts propres
process.on('SIGINT', async () => {
    console.log('\n🛑 Arrêt du serveur...');
    await closeDB();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Arrêt du serveur (SIGTERM)...');
    await closeDB();
    process.exit(0);
});

module.exports = {
    connectDB,
    getDB,
    closeDB,
    isDBConnected
};