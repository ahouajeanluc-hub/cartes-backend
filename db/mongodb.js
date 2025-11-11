const { MongoClient } = require('mongodb');

class MongoDB {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
        this.connectionPromise = null;
    }

    async connect() {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = new Promise(async (resolve, reject) => {
            try {
                if (this.isConnected) {
                    resolve(this.db);
                    return;
                }

                console.log('🔄 Connexion à MongoDB Atlas...');
                
                const options = {
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                    maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE) || 10,
                    serverSelectionTimeoutMS: 10000,
                    socketTimeoutMS: 45000,
                    ssl: true,
                    authSource: 'admin'
                };

                this.client = new MongoClient(process.env.MONGODB_URI, options);
                
                await this.client.connect();
                this.db = this.client.db(process.env.DB_NAME);
                this.isConnected = true;
                
                console.log('✅ Connecté à MongoDB Atlas avec succès');
                console.log(`📁 Base de données: ${process.env.DB_NAME}`);
                
                resolve(this.db);
            } catch (error) {
                console.error('❌ Erreur de connexion à MongoDB Atlas:', error.message);
                this.connectionPromise = null;
                reject(error);
            }
        });

        return this.connectionPromise;
    }

    getDB() {
        if (!this.isConnected || !this.db) {
            throw new Error('❌ Database non connectée. Appelez connect() d\'abord.');
        }
        return this.db;
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.isConnected = false;
            this.db = null;
            this.client = null;
            this.connectionPromise = null;
            console.log('🔌 Déconnecté de MongoDB Atlas');
        }
    }

    async healthCheck() {
        try {
            if (!this.isConnected) {
                return { ok: false, error: 'Non connecté' };
            }
            await this.db.command({ ping: 1 });
            return { 
                ok: true, 
                database: process.env.DB_NAME,
                message: 'MongoDB Atlas opérationnel'
            };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    async collectionExists(collectionName) {
        try {
            const db = this.getDB();
            const collections = await db.listCollections({ name: collectionName }).toArray();
            return collections.length > 0;
        } catch (error) {
            console.error('Erreur vérification collection:', error);
            return false;
        }
    }

    async createCollectionIfNotExists(collectionName, options = {}) {
        try {
            const exists = await this.collectionExists(collectionName);
            if (!exists) {
                const db = this.getDB();
                await db.createCollection(collectionName, options);
                console.log(`✅ Collection créée: ${collectionName}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`❌ Erreur création collection ${collectionName}:`, error);
            throw error;
        }
    }
}

const mongoDB = new MongoDB();

module.exports = { 
    mongoDB,
    getDB: () => mongoDB.getDB(),
    connectDB: () => mongoDB.connect(),
    disconnectDB: () => mongoDB.disconnect(),
    healthCheck: () => mongoDB.healthCheck()
};