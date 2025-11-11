const { MongoClient, ServerApiVersion } = require('mongodb');

// Configuration MongoDB avec SSL
const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    ssl: true, // ✅ CORRECTION SSL POUR RENDER
    tlsAllowInvalidCertificates: false,
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000
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
        
        await client.connect();
        
        // Test de la connexion
        await client.db("admin").command({ ping: 1 });
        
        db = client.db(process.env.DB_NAME || 'gestioncartes');
        isConnected = true;
        
        console.log('✅ Connecté à MongoDB Atlas avec succès');
        console.log('📁 Base de données:', db.databaseName);
        
        return db;
    } catch (error) {
        console.error('❌ Erreur de connexion à MongoDB Atlas:', error.message);
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
 * Ferme la connexion à la base de données
 */
async function closeDB() {
    try {
        if (client) {
            await client.close();
            console.log('🔌 Connexion MongoDB fermée');
            db = null;
            isConnected = false;
        }
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

/**
 * Gestionnaire pour les arrêts propres
 */
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

// Export des fonctions
module.exports = {
    connectDB,
    getDB,
    closeDB,
    isDBConnected,
    mongoDB: { client }
};