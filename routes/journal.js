const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const journalAccess = require('../middleware/journalAccess');
const { getDB, mongoDB } = require('../db/mongodb');
const { ObjectId } = require('mongodb');

// ✅ SEULS LES ADMINISTRATEURS PEUVENT ACCÉDER AU JOURNAL
router.use(verifyToken);
router.use(journalAccess);

// 🗄️ FONCTIONS DE JOURNALISATION (intégrées directement)
async function logAction(logData) {
  try {
    const logEntry = {
      UtilisateurID: logData.utilisateurId || null,
      NomUtilisateur: logData.nomUtilisateur || 'System',
      NomComplet: logData.nomComplet || 'System',
      Role: logData.role || 'System',
      Agence: logData.agence || null,
      DateAction: new Date(),
      Action: logData.action || logData.actionType,
      TableAffectee: logData.tableName || null,
      LigneAffectee: logData.recordId || null,
      IPUtilisateur: logData.ip || null,
      ActionType: logData.actionType,
      TableName: logData.tableName || null,
      RecordId: logData.recordId || null,
      OldValue: logData.oldValue || null,
      NewValue: logData.newValue || null,
      AdresseIP: logData.ip || null,
      UserId: logData.utilisateurId || null,
      ImportBatchID: logData.importBatchID || null,
      DetailsAction: logData.details || null,
      created_at: new Date()
    };

    await getDB().collection('journal').insertOne(logEntry);
  } catch (error) {
    console.error('Erreur journalisation MongoDB:', error);
  }
}

async function logActionMongo(logData, session) {
  try {
    const logEntry = {
      ...logData,
      created_at: new Date()
    };

    await getDB().collection('journal').insertOne(logEntry, { session });
  } catch (error) {
    console.error('Erreur journalisation MongoDB avec session:', error);
  }
}

// 🔧 MÉTHODES UTILITAIRES POUR LES OPÉRATIONS MONGODB
async function executeMongoUpdate(tableName, recordId, oldData, session) {
  // Filtrer les champs - exclure _id et champs système
  const filteredData = { ...oldData };
  delete filteredData._id;
  delete filteredData.created_at;
  delete filteredData.updated_at;

  // Vérifier qu'il reste des champs à mettre à jour
  if (Object.keys(filteredData).length === 0) {
    throw new Error('Aucun champ modifiable à mettre à jour');
  }

  // Ajouter la date de mise à jour
  filteredData.updated_at = new Date();

  const result = await getDB().collection(tableName.toLowerCase()).updateOne(
    { _id: new ObjectId(recordId) },
    { $set: filteredData },
    { session }
  );

  if (result.modifiedCount === 0) {
    throw new Error('Aucun document modifié');
  }

  console.log('🔧 Document MongoDB mis à jour');
}

async function executeMongoInsert(tableName, oldData, session) {
  // Filtrer les champs - _id sera généré automatiquement par MongoDB
  const filteredData = { ...oldData };
  delete filteredData._id;
  delete filteredData.ID; // Supprimer l'ancien ID SQL

  // Ajouter les dates système
  filteredData.created_at = new Date();
  filteredData.updated_at = new Date();

  const result = await getDB().collection(tableName.toLowerCase()).insertOne(
    filteredData,
    { session }
  );

  console.log('🔧 Document MongoDB inséré avec ID:', result.insertedId);
}

async function logUndoActionMongo(user, req, log, newData, oldData, session) {
  const tableName = log.TableName || log.TableAffectee;
  const recordId = log.RecordId || log.LigneAffectee;

  const logEntry = {
    UtilisateurID: user.id,
    NomUtilisateur: user.NomUtilisateur,
    NomComplet: user.NomComplet || user.NomUtilisateur,
    Role: user.Role,
    Agence: user.Agence || '',
    DateAction: new Date(),
    Action: `Annulation de ${log.ActionType}`,
    TableAffectee: tableName,
    LigneAffectee: recordId.toString(),
    IPUtilisateur: req.ip || '',
    ActionType: 'ANNULATION',
    TableName: tableName,
    RecordId: recordId.toString(),
    OldValue: JSON.stringify(newData),
    NewValue: JSON.stringify(oldData),
    AdresseIP: req.ip || '',
    UserId: user.id,
    DetailsAction: `Annulation de: ${log.ActionType}`,
    created_at: new Date()
  };

  await getDB().collection('journal').insertOne(logEntry, { session });
}

// 📊 RÉCUPÉRER TOUS LES LOGS AVEC PAGINATION ET FILTRES
async function getJournal(req, res) {
  try {
    const {
      page = 1,
      pageSize = 50,
      dateDebut,
      dateFin,
      utilisateur,
      actionType,
      tableName
    } = req.query;

    // Construction de la query MongoDB
    let query = {};
    
    // Appliquer les filtres
    if (dateDebut || dateFin) {
      query.DateAction = {};
      if (dateDebut) {
        query.DateAction.$gte = new Date(dateDebut);
      }
      if (dateFin) {
        query.DateAction.$lte = new Date(dateFin + 'T23:59:59.999Z');
      }
    }

    if (utilisateur) {
      query.NomUtilisateur = { $regex: utilisateur, $options: 'i' };
    }

    if (actionType) {
      query.ActionType = actionType;
    }

    if (tableName) {
      query.$or = [
        { TableName: tableName },
        { TableAffectee: tableName }
      ];
    }

    // Pagination
    const skip = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    // Exécuter les requêtes en parallèle
    const [logs, total] = await Promise.all([
      getDB().collection('journal')
        .find(query)
        .sort({ DateAction: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      getDB().collection('journal').countDocuments(query)
    ]);

    res.json({
      logs: logs,
      pagination: {
        page: parseInt(page),
        pageSize: limit,
        total: total,
        totalPages: Math.ceil(total / pageSize)
      }
    });

  } catch (error) {
    console.error('Erreur journal:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du journal' });
  }
}

// 🔄 ANNULER UNE IMPORTATION
async function annulerImportation(req, res) {
  const session = mongoDB.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      const { importBatchID } = req.body;
      const utilisateurId = req.user.id;
      const nomUtilisateur = req.user.NomUtilisateur;
      const nomComplet = req.user.NomComplet;
      const role = req.user.Role;
      const agence = req.user.Agence;

      // 1. Compter le nombre de cartes à supprimer
      const count = await getDB().collection('cartes').countDocuments(
        { importBatchID: importBatchID },
        { session }
      );

      if (count === 0) {
        throw new Error('Aucune carte trouvée pour ce batch d\'importation');
      }

      // 2. Journaliser l'action avant suppression
      await logActionMongo({
        UtilisateurID: utilisateurId,
        NomUtilisateur: nomUtilisateur,
        NomComplet: nomComplet,
        Role: role,
        Agence: agence,
        DateAction: new Date(),
        Action: `Annulation importation batch ${importBatchID}`,
        TableAffectee: 'Cartes',
        LigneAffectee: `Batch: ${importBatchID}`,
        IPUtilisateur: req.ip,
        ActionType: 'ANNULATION_IMPORT',
        TableName: 'Cartes',
        RecordId: importBatchID,
        AdresseIP: req.ip,
        UserId: utilisateurId,
        ImportBatchID: importBatchID,
        DetailsAction: `Annulation de l'importation - ${count} cartes supprimées`
      }, session);

      // 3. Supprimer les cartes de ce batch
      const deleteResult = await getDB().collection('cartes').deleteMany(
        { importBatchID: importBatchID },
        { session }
      );

      res.json({
        success: true,
        message: `Importation annulée avec succès - ${deleteResult.deletedCount} cartes supprimées`,
        count: deleteResult.deletedCount
      });
    });
  } catch (error) {
    console.error('Erreur annulation import:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation de l\'importation' });
  } finally {
    await session.endSession();
  }
}

// 📥 RÉCUPÉRER LES IMPORTS GROUPÉS POUR L'ANNULATION
async function getImports(req, res) {
  try {
    const imports = await getDB().collection('journal').aggregate([
      {
        $match: {
          ActionType: 'IMPORT_CARTE',
          ImportBatchID: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$ImportBatchID',
          nombreCartes: { $sum: 1 },
          dateImport: { $min: '$DateAction' },
          NomUtilisateur: { $first: '$NomUtilisateur' },
          NomComplet: { $first: '$NomComplet' },
          Agence: { $first: '$Agence' }
        }
      },
      {
        $project: {
          ImportBatchID: '$_id',
          nombreCartes: 1,
          dateImport: 1,
          NomUtilisateur: 1,
          NomComplet: 1,
          Agence: 1
        }
      },
      { $sort: { dateImport: -1 } }
    ]).toArray();

    res.json(imports);
  } catch (error) {
    console.error('Erreur récupération imports:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des imports' });
  }
}

// ↩️ ANNULER UNE ACTION (MODIFICATION/CRÉATION/SUPPRESSION)
async function undoAction(req, res) {
  const { id } = req.params;
  const user = req.user;

  const session = mongoDB.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      console.log(`🔄 Tentative d'annulation (JournalID: ${id})`);

      // 🔍 1. On récupère le log correspondant
      const log = await getDB().collection('journal').findOne(
        { _id: new ObjectId(id) },
        { session }
      );

      if (!log) {
        throw new Error('Entrée de journal non trouvée.');
      }

      const oldData = log.OldValue ? JSON.parse(log.OldValue) : null;
      const newData = log.NewValue ? JSON.parse(log.NewValue) : null;
      const tableName = log.TableName || log.TableAffectee;
      const recordId = log.RecordId || log.LigneAffectee;

      if (!oldData && !newData) {
        throw new Error('Aucune donnée à restaurer.');
      }

      console.log(`🕓 Action: ${log.ActionType}, Table: ${tableName}, ID: ${recordId}`);

      // 🔄 2. Exécuter l'annulation selon le type d'action
      if (log.ActionType === 'MODIFICATION_CARTE') {
        await executeMongoUpdate(tableName, recordId, oldData, session);
      } else if (log.ActionType === 'CREATION_CARTE') {
        await getDB().collection(tableName.toLowerCase()).deleteOne(
          { _id: new ObjectId(recordId) },
          { session }
        );
      } else if (log.ActionType === 'SUPPRESSION_CARTE') {
        await executeMongoInsert(tableName, oldData, session);
      } else {
        throw new Error(`Type d'action non supporté: ${log.ActionType}`);
      }

      // 🧾 3. Journaliser cette restauration
      await logUndoActionMongo(user, req, log, newData, oldData, session);

      console.log('✅ Action annulée avec succès');
      res.json({ 
        success: true, 
        message: '✅ Action annulée avec succès.' 
      });
    });
  } catch (err) {
    console.error('❌ Erreur annulation:', err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur serveur pendant l\'annulation.',
      details: err.message 
    });
  } finally {
    await session.endSession();
  }
}

// 📈 STATISTIQUES D'ACTIVITÉ
async function getStats(req, res) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await getDB().collection('journal').aggregate([
      {
        $match: {
          DateAction: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$ActionType',
          count: { $sum: 1 },
          derniereAction: { $max: '$DateAction' }
        }
      },
      {
        $project: {
          ActionType: '$_id',
          count: 1,
          derniereAction: 1
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    res.json(stats);
  } catch (error) {
    console.error('Erreur stats:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
}

// 🚀 ROUTES PRINCIPALES
router.get('/', getJournal);
router.get('/imports', getImports);
router.post('/annuler-import', annulerImportation);
router.get('/stats', getStats);
router.post('/undo/:id', undoAction);

module.exports = router;