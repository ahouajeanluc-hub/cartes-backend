const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/auth');
const importExportAccess = require('../middleware/importExportAccess');
const adminOnly = require('../middleware/adminOnly');
const { getDB, mongoDB } = require('../db/mongodb');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ObjectId } = require('mongodb');

// 🔧 CONFIGURATION CENTRALISÉE
const CONFIG = {
  maxErrorDisplay: 10,
  dateFormat: 'YYYY-MM-DD',
  phoneFormat: '@',
  maxFileSize: 10 * 1024 * 1024,
  uploadDir: 'uploads/',
  batchSize: 100,
  
  columns: [
    { key: "LIEU D'ENROLEMENT", required: false, type: 'string', maxLength: 255 },
    { key: "SITE DE RETRAIT", required: false, type: 'string', maxLength: 255 },
    { key: "RANGEMENT", required: false, type: 'string', maxLength: 100 },
    { key: "NOM", required: true, type: 'string', maxLength: 255 },
    { key: "PRENOMS", required: true, type: 'string', maxLength: 255 },
    { key: "DATE DE NAISSANCE", required: false, type: 'date', maxLength: 10 },
    { key: "LIEU NAISSANCE", required: false, type: 'string', maxLength: 255 },
    { key: "CONTACT", required: false, type: 'string', maxLength: 20 },
    { key: "DELIVRANCE", required: false, type: 'string', maxLength: 255 },
    { key: "CONTACT DE RETRAIT", required: false, type: 'string', maxLength: 255 },
    { key: "DATE DE DELIVRANCE", required: false, type: 'date', maxLength: 10 }
  ],
  requiredHeaders: ['NOM', 'PRENOMS']
};

// Configuration Multer pour upload Excel
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `import-${uniqueSuffix}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimetype === 'application/vnd.ms-excel' ||
    file.originalname.match(/\.(xlsx|xls)$/)
  ) {
    cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers Excel (.xlsx, .xls) sont autorisés'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter, 
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ✅ APPLIQUER L'AUTHENTIFICATION ET LES PERMISSIONS
router.use(verifyToken);
router.use(importExportAccess);

// 🛠️ CLASSES UTILITAIRES
class ImportResult {
  constructor(importBatchID) {
    this.imported = 0;
    this.duplicates = 0;
    this.errors = 0;
    this.totalProcessed = 0;
    this.errorDetails = [];
    this.importBatchID = importBatchID;
    this.startTime = new Date();
  }

  addError(error) {
    this.errors++;
    this.errorDetails.push(error);
  }

  getStats() {
    const duration = new Date() - this.startTime;
    return {
      imported: this.imported,
      duplicates: this.duplicates,
      errors: this.errors,
      totalProcessed: this.totalProcessed,
      successRate: this.totalProcessed > 0 ? Math.round((this.imported / this.totalProcessed) * 100) : 0,
      importBatchID: this.importBatchID,
      duration: `${Math.round(duration / 1000)}s`
    };
  }
}

class DataValidator {
  static validateRow(rowData, rowNumber) {
    const errors = [];

    if (!rowData.NOM || rowData.NOM.toString().trim() === '') {
      errors.push(`Ligne ${rowNumber}: Le champ NOM est obligatoire`);
    }
    
    if (!rowData.PRENOMS || rowData.PRENOMS.toString().trim() === '') {
      errors.push(`Ligne ${rowNumber}: Le champ PRENOMS est obligatoire`);
    }

    return errors;
  }

  static validateHeaders(headers) {
    const missingHeaders = CONFIG.requiredHeaders.filter(header => 
      !headers.some(h => h.toUpperCase() === header.toUpperCase())
    );
    return missingHeaders;
  }
}

class DataCleaner {
  static cleanValue(value, columnType) {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    let cleaned = value.toString().trim();

    if (cleaned.toUpperCase() === 'NULL') {
      return '';
    }

    if (columnType === 'date' && cleaned) {
      return this.cleanDate(cleaned);
    }

    return cleaned;
  }

  static cleanDate(dateString) {
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (error) {
      // Silently fail for invalid dates
    }
    return '';
  }

  static formatPhone(value) {
    if (!value && value !== 0) return '';
    
    const strValue = value.toString().trim();
    
    if (!isNaN(strValue) && strValue !== '') {
      return strValue.padStart(8, '0');
    }
    
    return strValue;
  }

  // ✅ NOUVELLE FONCTION : Conversion des dates MongoDB pour Excel
  static cleanDateForExcel(dateValue) {
    if (!dateValue) return '';
    
    // Si c'est déjà une string
    if (typeof dateValue === 'string') {
      return dateValue;
    }
    
    // Si c'est un objet Date MongoDB
    if (dateValue instanceof Date) {
      const year = dateValue.getFullYear();
      const month = String(dateValue.getMonth() + 1).padStart(2, '0');
      const day = String(dateValue.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Si c'est un objet MongoDB Date ({$date: ...})
    if (dateValue.$date) {
      const jsDate = new Date(dateValue.$date);
      const year = jsDate.getFullYear();
      const month = String(jsDate.getMonth() + 1).padStart(2, '0');
      const day = String(jsDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    return '';
  }
}

class ExcelHelper {
  static async readExcelFile(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);
    
    if (!worksheet) {
      throw new Error('Aucune feuille trouvée dans le fichier Excel');
    }
    
    return worksheet;
  }

  static setupWorksheet(workbook, sheetName) {
    const worksheet = workbook.addWorksheet(sheetName);
    
    worksheet.columns = CONFIG.columns.map(column => ({
      header: column.key,
      key: column.key.replace(/\s+/g, '_'),
      width: 20
    }));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E86AB' }
    };

    return worksheet;
  }

  static formatContactColumns(worksheet) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const contactCell = row.getCell(8);
        const contactRetraitCell = row.getCell(10);
        
        [contactCell, contactRetraitCell].forEach(cell => {
          if (cell.value) {
            cell.numFmt = CONFIG.phoneFormat;
            cell.value = cell.value.toString();
          }
        });
      }
    });
  }
}

class FileHelper {
  static safeDelete(filePath) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('🗑️ Fichier temporaire supprimé:', path.basename(filePath));
      }
    } catch (error) {
      console.warn('⚠️ Impossible de supprimer le fichier temporaire:', error.message);
    }
  }

  static generateFilename(prefix, extension = 'xlsx') {
    const date = new Date().toISOString().split('T')[0];
    return `${prefix}-${date}.${extension}`;
  }
}

// 🗄️ FONCTIONS DE JOURNALISATION (intégrées directement)
async function logAction(logData) {
  try {
    const db = getDB();
    await db.collection('journal').insertOne({
      ...logData,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Erreur journalisation:', error);
  }
}

async function getImports(req, res) {
  try {
    const db = getDB();
    const imports = await db.collection('journal')
      .find({ actionType: { $regex: /IMPORT/ } })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();
    
    res.json({ success: true, data: imports });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function annulerImportation(req, res) {
  try {
    const { importBatchID } = req.body;
    const db = getDB();
    
    const result = await db.collection('cartes').deleteMany({ importBatchID });
    
    await logAction({
      utilisateurId: req.user.id,
      nomUtilisateur: req.user.NomUtilisateur,
      actionType: 'ANNULATION_IMPORT',
      importBatchID: importBatchID,
      details: `Import annulé - ${result.deletedCount} cartes supprimées`
    });
    
    res.json({ 
      success: true, 
      message: `Import annulé - ${result.deletedCount} cartes supprimées` 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// 🎯 FONCTIONS PRINCIPALES (anciennement dans le contrôleur)
async function importExcel(req, res) {
  console.time('⏱️ Import Excel');
  console.log('🚀 DEBUT IMPORT');
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Aucun fichier uploadé'
    });
  }

  const importBatchID = uuidv4();
  const session = mongoDB.client.startSession();
  
  try {
    console.log('📁 Fichier reçu:', {
      name: req.file.originalname,
      size: req.file.size,
      importBatchID: importBatchID
    });

    if (!req.user) {
      FileHelper.safeDelete(req.file.path);
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié'
      });
    }

    // Journaliser le début
    await logAction({
      utilisateurId: req.user.id,
      nomUtilisateur: req.user.NomUtilisateur,
      actionType: 'DEBUT_IMPORT',
      importBatchID: importBatchID,
      details: `Début importation: ${req.file.originalname}`
    });

    const worksheet = await ExcelHelper.readExcelFile(req.file.path);
    const headers = extractHeaders(worksheet);
    
    // Validation des en-têtes
    const missingHeaders = DataValidator.validateHeaders(headers);
    if (missingHeaders.length > 0) {
      FileHelper.safeDelete(req.file.path);
      await logAction({
        utilisateurId: req.user.id,
        actionType: 'ERREUR_IMPORT',
        details: `En-têtes manquants: ${missingHeaders.join(', ')}`
      });
      
      return res.status(400).json({
        success: false,
        error: `En-têtes manquants: ${missingHeaders.join(', ')}`
      });
    }

    // Traitement avec transaction
    const result = new ImportResult(importBatchID);
    await session.withTransaction(async () => {
      await processImport(worksheet, headers, result, req, importBatchID, session);
    });
    
    FileHelper.safeDelete(req.file.path);
    console.timeEnd('⏱️ Import Excel');

    // Journaliser la fin
    await logAction({
      utilisateurId: req.user.id,
      actionType: 'FIN_IMPORT',
      importBatchID: importBatchID,
      details: `Import terminé: ${result.imported} importées, ${result.errors} erreurs`
    });

    res.json({
      success: true,
      message: 'Import terminé avec succès',
      stats: result.getStats(),
      importBatchID: importBatchID
    });

  } catch (error) {
    FileHelper.safeDelete(req.file.path);
    console.error('❌ Erreur import:', error);
    
    await logAction({
      utilisateurId: req.user?.id,
      actionType: 'ERREUR_IMPORT',
      details: `Erreur importation: ${error.message}`
    });

    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'import: ' + error.message
    });
  } finally {
    await session.endSession();
  }
}

// ✅ FONCTION EXPORT TOUTES LES CARTES - CORRIGÉE ET AMÉLIORÉE
async function exportAll(req, res) {
  try {
    console.log('📊 Export de TOUTES les cartes demandé');
    
    const db = getDB();
    const cartes = await db.collection('cartes').find({}).sort({ _id: 1 }).toArray();
    
    console.log(`📊 Toutes les cartes à exporter: ${cartes.length} lignes`);
    
    if (cartes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Aucune carte trouvée dans la base de données'
      });
    }
    
    // Journaliser l'export
    await logAction({
      utilisateurId: req.user.id,
      actionType: 'EXPORT_CARTES',
      details: `Export complet - ${cartes.length} cartes`
    });

    await exportToExcel(res, cartes, 'toutes-les-cartes');

  } catch (error) {
    console.error('❌ Erreur export toutes les cartes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'export: ' + error.message
    });
  }
}

async function exportSearchResults(req, res) {
  try {
    console.log('🔍 Paramètres reçus pour export recherche:', req.query);
    
    let query = {};
    const filterMap = {
      nom: 'NOM',
      prenom: 'PRENOMS',
      contact: 'CONTACT',
      siteRetrait: 'SITE DE RETRAIT',
      lieuNaissance: 'LIEU NAISSANCE',
      dateNaissance: 'DATE DE NAISSANCE',
      rangement: 'RANGEMENT'
    };

    Object.entries(filterMap).forEach(([key, field]) => {
      if (req.query[key] && req.query[key].trim() !== '') {
        query[field] = { $regex: req.query[key].trim(), $options: 'i' };
      }
    });

    console.log('🔍 Query MongoDB:', JSON.stringify(query));

    const db = getDB();
    const cartes = await db.collection('cartes').find(query).sort({ _id: 1 }).toArray();

    console.log(`📊 Résultats à exporter: ${cartes.length} lignes`);

    if (cartes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Aucun résultat trouvé pour les critères de recherche'
      });
    }

    await logAction({
      utilisateurId: req.user.id,
      actionType: 'EXPORT_RECHERCHE',
      details: `Export recherche - ${cartes.length} cartes`
    });
    
    await exportToExcel(res, cartes, 'resultats-recherche');

  } catch (error) {
    console.error('❌ Erreur export recherche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'export: ' + error.message
    });
  }
}

async function downloadTemplate(req, res) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = ExcelHelper.setupWorksheet(workbook, 'Template Import Cartes');

    // Données d'exemple
    const exampleData = {
      "LIEU D'ENROLEMENT": "UNIVERSITE FELIX HOUPHOUET BOIGNY",
      "SITE DE RETRAIT": "VICE PRESIDENCE DE L'UFHB",
      "RANGEMENT": "COC-UFHB106",
      "NOM": "KOUAME",
      "PRENOMS": "Jean",
      "DATE DE NAISSANCE": "1990-05-15",
      "LIEU NAISSANCE": "Abidjan",
      "CONTACT": "0769489580",
      "DELIVRANCE": "",
      "CONTACT DE RETRAIT": "",
      "DATE DE DELIVRANCE": ""
    };

    worksheet.addRow(exampleData);
    ExcelHelper.formatContactColumns(worksheet);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="template-import-cartes.xlsx"');

    await logAction({
      utilisateurId: req.user.id,
      actionType: 'TELECHARGEMENT_TEMPLATE',
      details: 'Téléchargement template'
    });

    await workbook.xlsx.write(res);

  } catch (error) {
    console.error('❌ Erreur template:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur génération template'
    });
  }
}

// 🛠️ FONCTIONS UTILITAIRES
function extractHeaders(worksheet) {
  const firstRow = worksheet.getRow(1);
  const headers = [];
  firstRow.eachCell((cell) => {
    headers.push(cell.value?.toString().trim() || '');
  });
  return headers;
}

async function processImport(worksheet, headers, result, req, importBatchID, session) {
  const db = getDB();
  
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    try {
      const rowData = extractRowData(worksheet.getRow(rowNumber), headers);
      if (!rowData || isEmptyRow(rowData)) continue;

      result.totalProcessed++;

      // Validation
      const validationErrors = DataValidator.validateRow(rowData, rowNumber);
      if (validationErrors.length > 0) {
        result.errorDetails.push(...validationErrors);
        result.errors++;
        continue;
      }

      // Nettoyage
      const cleanedData = cleanRowData(rowData);

      // Vérification doublon
      const duplicateCheck = await db.collection('cartes').countDocuments({
        NOM: cleanedData.NOM,
        PRENOMS: cleanedData.PRENOMS
      }, { session });

      if (duplicateCheck > 0) {
        result.duplicates++;
        continue;
      }

      // Insertion
      const carteDocument = {
        ...cleanedData,
        importBatchID: importBatchID,
        created_at: new Date(),
        updated_at: new Date()
      };

      const resultInsert = await db.collection('cartes').insertOne(carteDocument, { session });
      result.imported++;

      // Journaliser chaque carte
      await logAction({
        utilisateurId: req.user.id,
        actionType: 'IMPORT_CARTE',
        importBatchID: importBatchID,
        details: `Import carte: ${cleanedData.NOM} ${cleanedData.PRENOMS}`
      });

    } catch (error) {
      result.addError(`Ligne ${rowNumber}: ${error.message}`);
    }
  }
}

// ✅ FONCTION EXPORT EXCEL AMÉLIORÉE AVEC GESTION DES DATES MONGODB
async function exportToExcel(res, data, filename) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = ExcelHelper.setupWorksheet(workbook, 'Données Cartes');

    data.forEach(item => {
      const rowData = {};
      CONFIG.columns.forEach(column => {
        let value = item[column.key] || '';
        
        // ✅ GESTION SPÉCIALE DES DATES MONGODB
        if ((column.key === 'DATE DE NAISSANCE' || column.key === 'DATE DE DELIVRANCE') && value) {
          value = DataCleaner.cleanDateForExcel(value);
        }
        
        // ✅ GESTION DES CONTACTS
        if ((column.key === 'CONTACT' || column.key === 'CONTACT DE RETRAIT') && value) {
          value = DataCleaner.formatPhone(value);
        }
        
        rowData[column.key.replace(/\s+/g, '_')] = value;
      });
      worksheet.addRow(rowData);
    });

    ExcelHelper.formatContactColumns(worksheet);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${FileHelper.generateFilename(filename)}"`);

    await workbook.xlsx.write(res);
    
    console.log(`✅ Export Excel réussi: ${data.length} lignes exportées`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'export Excel:', error);
    throw error;
  }
}

function extractRowData(row, headers) {
  const rowData = {};
  let hasData = false;
  row.eachCell((cell, colNumber) => {
    const headerIndex = colNumber - 1;
    if (headerIndex < headers.length && cell.value) {
      rowData[headers[headerIndex]] = cell.value.toString().trim();
      hasData = true;
    }
  });
  return hasData ? rowData : null;
}

function cleanRowData(rowData) {
  const cleaned = {};
  Object.keys(rowData).forEach(key => {
    let value = rowData[key] || '';
    if (key.includes('CONTACT')) {
      value = DataCleaner.formatPhone(value);
    } else if (key.includes('DATE')) {
      value = DataCleaner.cleanValue(value, 'date');
    } else {
      value = DataCleaner.cleanValue(value, 'string');
    }
    cleaned[key] = value;
  });
  return cleaned;
}

function isEmptyRow(rowData) {
  return !rowData || Object.values(rowData).every(value => !value || value === '');
}

// 🚀 ROUTES PRINCIPALES - CORRIGÉES ET COMPLÈTES
router.get('/export', exportAll); // ✅ ROUTE MANQUANTE AJOUTÉE - Export toutes les cartes
router.post('/import', upload.single('file'), importExcel); // ✅ Import Excel
router.get('/export-resultats', exportSearchResults); // ✅ Export résultats recherche
router.get('/template', downloadTemplate); // ✅ Template d'import

// Routes supplémentaires pour compatibilité
router.get('/export-all', exportAll); // ✅ Alias pour l'export complet
router.get('/export-search', exportSearchResults); // ✅ Alias pour l'export recherche

router.get('/export-pdf', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Export PDF non disponible'
  });
});

// ✅ ROUTES ADMIN POUR LA JOURNALISATION 
router.get('/imports-batch', adminOnly, getImports);
router.post('/annuler-import', adminOnly, annulerImportation);

// ✅ Gestion d'erreurs multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false, 
        error: 'Fichier trop volumineux (max 10MB)' 
      });
    }
    return res.status(400).json({ 
      success: false, 
      error: `Erreur upload: ${error.message}` 
    });
  }
  
  console.error('❌ Erreur upload:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Erreur lors du traitement du fichier' 
  });
});

module.exports = router;