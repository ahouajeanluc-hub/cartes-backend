const importExportAccess = (req, res, next) => {
    // Administrateurs, Superviseurs et Chefs d'équipe peuvent importer/exporter
    const allowedRoles = ['Administrateur', 'Superviseur', 'Chef d\'équipe'];
    
    // ✅ AMÉLIORATION : Récupération cohérente du rôle depuis req.user (MongoDB)
    const userRole = req.user?.Role || req.user?.role;
    
    console.log('🔍 Vérification accès import/export:', {
        utilisateur: req.user?.NomUtilisateur || 'Non connecté',
        userRole: userRole,
        method: req.method,
        url: req.url
    });
    
    if (!req.user) {
        console.log('❌ Accès import/export refusé - Utilisateur non authentifié');
        return res.status(401).json({ 
            success: false,
            error: 'Authentification requise',
            message: 'Vous devez être connecté pour accéder à cette fonctionnalité.'
        });
    }
    
    if (userRole && allowedRoles.includes(userRole)) {
        console.log('✅ Accès import/export autorisé pour:', req.user.NomUtilisateur, '- Rôle:', userRole);
        next();
    } else {
        console.log('❌ Accès import/export refusé - Utilisateur:', req.user.NomUtilisateur, '- Rôle:', userRole);
        
        res.status(403).json({ 
            success: false,
            error: 'Accès non autorisé',
            message: 'L\'import/export est réservé aux administrateurs, superviseurs et chefs d\'équipe.',
            details: {
                votreRole: userRole,
                rolesAutorises: allowedRoles
            }
        });
    }
};

module.exports = importExportAccess;