// Middleware global (ex. logger) - DÉJÀ COMPATIBLE MONGODB

function logger(req, res, next) {
    const timestamp = new Date().toISOString();
    const userInfo = req.user ? `[${req.user.NomUtilisateur}]` : '[Non connecté]';
    
    console.log(`[${timestamp}] ${userInfo} ${req.method} ${req.url}`);
    next();
}

// ✅ NOUVEAU : Middleware pour ajouter la DB MongoDB aux requêtes
function addDB(req, res, next) {
    const { getDB } = require('../db/ren mongodb.JS mongodb.js');
    req.db = getDB();
    next();
}

// ✅ NOUVEAU : Middleware de gestion d'erreurs global
function errorHandler(err, req, res, next) {
    console.error('❌ Erreur globale:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        user: req.user?.NomUtilisateur || 'Non connecté'
    });

    // Erreurs MongoDB spécifiques
    if (err.name === 'MongoError' || err.name === 'MongoServerError') {
        return res.status(500).json({
            success: false,
            error: 'Erreur base de données',
            message: 'Une erreur est survenue avec la base de données'
        });
    }

    // Erreurs de validation MongoDB
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Données invalides',
            message: err.message
        });
    }

    // Erreurs JWT
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: 'Token invalide',
            message: 'Authentification requise'
        });
    }

    // Erreur par défaut
    res.status(err.status || 500).json({
        success: false,
        error: 'Erreur serveur',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
    });
}

// ✅ NOUVEAU : Middleware de sécurité CORS étendu
function securityHeaders(req, res, next) {
    // Headers de sécurité
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // CORS pour production
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Access-Control-Allow-Origin', 'https://gestioncartecocody.netlify.app');
    } else {
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    }
    
    next();
}

// ✅ NOUVEAU : Middleware de validation des ObjectId MongoDB
function validateObjectId(paramName) {
    return (req, res, next) => {
        const { ObjectId } = require('mongodb');
        const id = req.params[paramName];
        
        if (id && !ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID invalide',
                message: `L'ID ${id} n'est pas valide`
            });
        }
        
        next();
    };
}

module.exports = { 
    logger,
    addDB,
    errorHandler,
    securityHeaders,
    validateObjectId
};