const { MongoClient } = require('mongodb');

// Configuration URGENCE pour Render + Atlas
const client = new MongoClient(process.env.MONGODB_URI, {
    // ✅ Paramètres TLS URGENCE
    tls: true,
    tlsAllowInvalidCertificates: true, // ⚠️ Temporairement true
    tlsAllowInvalidHostnames: true,    // ⚠️ Temporairement true
    
    // ✅ Pool de connexions
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    
    // ✅ Timeouts
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 15000,
    
    // ✅ Retry policies
    retryWrites: true,
    retryReads: true
});

let db;
let isConnected = false;

async function connectDB() {
    try {
        if (isConnected && db) {
            return db;
        }
        
        console.log('🔄 Connexion à MongoDB Atlas...');
        console.log('📍 URI:', process.env.MONGODB_URI ? '✓ Définie' : '✗ Non définie');
        console.log('🔧 TLS Config:', {
            tls: true,
            tlsAllowInvalidCertificates: true,
            tlsAllowInvalidHostnames: true
        });
        
        await client.connect();
        
        // Test de connexion
        await client.db().command({ ping: 1 });
        
        db = client.db(process.env.DB_NAME || 'gestioncartes');
        isConnected = true;
        
        console.log('✅ CONNEXION RÉUSSIE À MONGODB ATLAS !');
        console.log('📁 Base de données:', db.databaseName);
        
        return db;
    } catch (error) {
        console.error('❌ Erreur de connexion à MongoDB Atlas:', error.message);
        console.error('💡 Code erreur:', error.code);
        console.error('💡 Nom erreur:', error.name);
        
        isConnected = false;
        throw error;
    }
}

function getDB() {
    if (!db || !isConnected) {
        throw new Error('❌ Database non connectée. Appelez connectDB() d\'abord.');
    }
    return db;
}

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

function isDBConnected() {
    return isConnected;
}

module.exports = {
    connectDB,
    getDB,
    closeDB,
    isDBConnected
};