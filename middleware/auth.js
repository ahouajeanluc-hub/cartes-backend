const jwt = require("jsonwebtoken");
const { getDB } = require("../db/mongodb.js");
const { ObjectId } = require("mongodb");

/**
 * Vérifie le token JWT - VERSION MONGODB AMÉLIORÉE
 */
exports.verifyToken = async (req, res, next) => {
  const header = req.headers["authorization"];
  const token = header && header.split(" ")[1];

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: "Accès refusé : token manquant" 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ VÉRIFICATION MONGODB : Vérifier que l'utilisateur existe toujours et est actif
    const user = await getDB().collection('utilisateurs').findOne(
      { 
        _id: new ObjectId(decoded.id),
        Actif: true 
      },
      {
        projection: {
          MotDePasse: 0,
          password: 0 // Exclure le mot de passe
        }
      }
    );

    if (!user) {
      console.error('❌ Utilisateur non trouvé ou inactif dans MongoDB');
      return res.status(401).json({ 
        success: false,
        message: "Utilisateur non trouvé ou compte désactivé" 
      });
    }

    // 🔥 STRUCTURE COHÉRENTE AVEC MONGODB
    req.user = {
      id: user._id.toString(),
      NomUtilisateur: user.NomUtilisateur,
      NomComplet: user.NomComplet || user.NomUtilisateur,
      Role: user.Role,
      role: user.Role, // Compatibilité minuscule
      Agence: user.Agence || '',
      Email: user.Email || ''
    };
    
    console.log('✅ Token vérifié - User:', req.user.NomUtilisateur, 'Role:', req.user.Role);
    next();
  } catch (error) {
    console.error('❌ Token invalide:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        success: false,
        message: "Token invalide" 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ 
        success: false,
        message: "Token expiré" 
      });
    }

    if (error.name === 'BSONTypeError') {
      return res.status(403).json({ 
        success: false,
        message: "Format d'identifiant utilisateur invalide" 
      });
    }

    return res.status(500).json({ 
      success: false,
      message: "Erreur d'authentification" 
    });
  }
};

/**
 * Vérifie que le rôle de l'utilisateur fait partie des rôles autorisés
 * (DÉJÀ COMPATIBLE MONGODB)
 */
exports.verifyRole = (rolesAutorises = []) => {
  return (req, res, next) => {
    const userRole = req.user?.Role || req.user?.role;
    
    if (!req.user || !userRole) {
      return res.status(401).json({ 
        success: false,
        message: "Utilisateur non authentifié" 
      });
    }

    if (!rolesAutorises.includes(userRole)) {
      console.log('❌ Accès refusé - Rôle non autorisé:', {
        utilisateur: req.user.NomUtilisateur,
        role: userRole,
        rolesAutorises: rolesAutorises
      });
      return res.status(403).json({ 
        success: false,
        message: "Accès interdit : rôle non autorisé" 
      });
    }

    next();
  };
};

/**
 * Middleware spécialisé : contrôle des colonnes modifiables selon le rôle
 * (DÉJÀ COMPATIBLE MONGODB)
 */
exports.canEditColumns = (req, res, next) => {
  const role = req.user?.Role || req.user?.role;

  if (!role) {
    return res.status(401).json({ 
      success: false,
      message: "Rôle non défini" 
    });
  }

  const ROLE_COLUMNS = {
    Administrateur: [
      "LIEU D'ENROLEMENT", "SITE DE RETRAIT", "RANGEMENT",
      "NOM", "PRENOMS", "DATE DE NAISSANCE", "LIEU NAISSANCE",
      "CONTACT", "DELIVRANCE", "CONTACT DE RETRAIT", "DATE DE DELIVRANCE"
    ],
    Superviseur: [
      "LIEU D'ENROLEMENT", "SITE DE RETRAIT", "RANGEMENT",
      "NOM", "PRENOMS", "DATE DE NAISSANCE", "LIEU NAISSANCE",
      "CONTACT", "DELIVRANCE", "CONTACT DE RETRAIT", "DATE DE DELIVRANCE"
    ],
    "Chef d'équipe": [
      "LIEU D'ENROLEMENT", "SITE DE RETRAIT", "RANGEMENT",
      "NOM", "PRENOMS", "DATE DE NAISSANCE", "LIEU NAISSANCE",
      "CONTACT", "DELIVRANCE", "CONTACT DE RETRAIT", "DATE DE DELIVRANCE"
    ],
    Opérateur: [
      "DELIVRANCE", "CONTACT DE RETRAIT", "DATE DE DELIVRANCE"
    ]
  };

  req.allowedColumns = ROLE_COLUMNS[role] || [];
  console.log('🔐 Colonnes autorisées pour', role, ':', req.allowedColumns);
  next();
};

/**
 * NOUVEAU : Vérifie si l'utilisateur peut gérer les utilisateurs
 */
exports.canManageUsers = (req, res, next) => {
  const userRole = req.user?.Role || req.user?.role;
  const allowedRoles = ['Administrateur', 'Superviseur'];
  
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ 
      success: false,
      message: "Accès réservé aux administrateurs et superviseurs" 
    });
  }
  
  next();
};

/**
 * NOUVEAU : Vérifie si l'utilisateur peut importer/exporter
 */
exports.canImportExport = (req, res, next) => {
  const userRole = req.user?.Role || req.user?.role;
  const allowedRoles = ['Administrateur', 'Superviseur', 'Chef d\'équipe'];
  
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ 
      success: false,
      message: "Accès réservé aux administrateurs, superviseurs et chefs d'équipe" 
    });
  }
  
  next();
};