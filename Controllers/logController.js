const { getDB } = require('../db/mongodb');

exports.getAllLogs = async (req, res) => {
    try {
        const db = getDB();
        
        // Vérifier si la collection logs existe, sinon utiliser journal
        const collections = await db.listCollections({ name: 'logs' }).toArray();
        const collectionName = collections.length > 0 ? 'logs' : 'journal';
        
        const logs = await db.collection(collectionName)
            .find({})
            .sort({ DateHeure: -1, created_at: -1 }) // Support ancien et nouveau format
            .toArray();
            
        res.json(logs);
    } catch (err) {
        console.error('❌ Erreur récupération logs MongoDB:', err);
        res.status(500).json({ 
            success: false,
            error: 'Erreur lors de la récupération des logs',
            details: err.message 
        });
    }
};

exports.createLog = async (req, res) => {
    try {
        const { Utilisateur, Action, Niveau = 'INFO', Details } = req.body;
        const db = getDB();
        
        // Vérifier si la collection logs existe, sinon utiliser journal
        const collections = await db.listCollections({ name: 'logs' }).toArray();
        const collectionName = collections.length > 0 ? 'logs' : 'journal';
        
        const logEntry = {
            Utilisateur: Utilisateur,
            Action: Action,
            Niveau: Niveau,
            Details: Details || Action,
            DateHeure: new Date(),
            created_at: new Date(),
            IP: req.ip || 'Inconnue',
            UserAgent: req.get('User-Agent') || 'Inconnu'
        };

        await db.collection(collectionName).insertOne(logEntry);
        
        console.log(`📝 Log créé: ${Utilisateur} - ${Action}`);
        
        res.json({ 
            success: true,
            message: 'Log ajouté avec succès !',
            logId: logEntry._id 
        });
    } catch (err) {
        console.error('❌ Erreur création log MongoDB:', err);
        res.status(500).json({ 
            success: false,
            error: 'Erreur lors de la création du log',
            details: err.message 
        });
    }
};

// ✅ NOUVELLE MÉTHODE : Récupérer les logs par utilisateur
exports.getLogsByUser = async (req, res) => {
    try {
        const { utilisateur } = req.params;
        const { page = 1, limit = 50 } = req.query;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const db = getDB();
        
        const collections = await db.listCollections({ name: 'logs' }).toArray();
        const collectionName = collections.length > 0 ? 'logs' : 'journal';
        
        const [logs, total] = await Promise.all([
            db.collection(collectionName)
                .find({ 
                    $or: [
                        { Utilisateur: utilisateur },
                        { NomUtilisateur: utilisateur }
                    ]
                })
                .sort({ DateHeure: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .toArray(),
            db.collection(collectionName).countDocuments({
                $or: [
                    { Utilisateur: utilisateur },
                    { NomUtilisateur: utilisateur }
                ]
            })
        ]);

        res.json({
            success: true,
            logs: logs,
            total: total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            limit: parseInt(limit)
        });
    } catch (err) {
        console.error('❌ Erreur logs par utilisateur MongoDB:', err);
        res.status(500).json({ 
            success: false,
            error: 'Erreur lors de la récupération des logs utilisateur',
            details: err.message 
        });
    }
};

// ✅ NOUVELLE MÉTHODE : Récupérer les logs par période
exports.getLogsByPeriod = async (req, res) => {
    try {
        const { dateDebut, dateFin } = req.query;
        const db = getDB();
        
        const collections = await db.listCollections({ name: 'logs' }).toArray();
        const collectionName = collections.length > 0 ? 'logs' : 'journal';
        
        let query = {};
        
        if (dateDebut || dateFin) {
            query.DateHeure = {};
            if (dateDebut) query.DateHeure.$gte = new Date(dateDebut);
            if (dateFin) query.DateHeure.$lte = new Date(dateFin + 'T23:59:59.999Z');
        }

        const logs = await db.collection(collectionName)
            .find(query)
            .sort({ DateHeure: -1 })
            .toArray();

        res.json({
            success: true,
            logs: logs,
            total: logs.length,
            periode: {
                debut: dateDebut,
                fin: dateFin
            }
        });
    } catch (err) {
        console.error('❌ Erreur logs par période MongoDB:', err);
        res.status(500).json({ 
            success: false,
            error: 'Erreur lors de la récupération des logs par période',
            details: err.message 
        });
    }
};

// ✅ NOUVELLE MÉTHODE : Supprimer les logs anciens (maintenance)
exports.cleanOldLogs = async (req, res) => {
    try {
        const { jours = 90 } = req.body; // Par défaut, supprimer les logs de plus de 90 jours
        
        const dateLimite = new Date();
        dateLimite.setDate(dateLimite.getDate() - parseInt(jours));
        
        const db = getDB();
        const collections = await db.listCollections({ name: 'logs' }).toArray();
        const collectionName = collections.length > 0 ? 'logs' : 'journal';
        
        const result = await db.collection(collectionName).deleteMany({
            DateHeure: { $lt: dateLimite }
        });

        console.log(`🧹 ${result.deletedCount} logs anciens supprimés (avant ${dateLimite.toISOString()})`);

        res.json({
            success: true,
            message: `${result.deletedCount} logs anciens supprimés`,
            deletedCount: result.deletedCount,
            dateLimite: dateLimite.toISOString()
        });
    } catch (err) {
        console.error('❌ Erreur nettoyage logs MongoDB:', err);
        res.status(500).json({ 
            success: false,
            error: 'Erreur lors du nettoyage des logs',
            details: err.message 
        });
    }
};