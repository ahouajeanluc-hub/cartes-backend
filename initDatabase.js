require('dotenv').config();
const { connectDB, getDB } = require('./db/mongodb');

async function initializeDatabase() {
    try {
        console.log('🔄 Initialisation de la base de données...');
        
        await connectDB();
        const db = getDB();
        
        // Créer les collections nécessaires
        const collections = ['utilisateurs', 'cartes', 'journal', 'logs'];
        
        console.log('📦 Création des collections...');
        for (const collectionName of collections) {
            try {
                await db.createCollection(collectionName);
                console.log(`✅ Collection créée: ${collectionName}`);
            } catch (error) {
                if (error.codeName === 'NamespaceExists') {
                    console.log(`ℹ️ Collection existe déjà: ${collectionName}`);
                } else {
                    console.error(`❌ Erreur création ${collectionName}:`, error.message);
                }
            }
        }
        
        // Créer des indexes pour les performances
        console.log('⚡ Création des indexes...');
        try {
            await db.collection('utilisateurs').createIndex({ NomUtilisateur: 1 }, { unique: true });
            console.log('✅ Index créé: utilisateurs(NomUtilisateur)');
        } catch (error) {
            console.log('ℹ️ Index utilisateurs existe déjà');
        }
        
        try {
            await db.collection('cartes').createIndex({ NOM: 1, PRENOMS: 1 });
            console.log('✅ Index créé: cartes(NOM, PRENOMS)');
        } catch (error) {
            console.log('ℹ️ Index cartes existe déjà');
        }
        
        try {
            await db.collection('journal').createIndex({ DateAction: -1 });
            console.log('✅ Index créé: journal(DateAction)');
        } catch (error) {
            console.log('ℹ️ Index journal existe déjà');
        }
        
        console.log('🎉 Base de données initialisée avec succès !');
        console.log('📊 Collections disponibles:');
        const allCollections = await db.listCollections().toArray();
        allCollections.forEach(collection => {
            console.log(`   - ${collection.name}`);
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erreur initialisation:', error.message);
        process.exit(1);
    }
}

initializeDatabase();