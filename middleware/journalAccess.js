const journalAccess = (req, res, next) => {
    // ✅ AMÉLIORATION : Récupération cohérente depuis MongoDB
    const role = req.user?.Role || req.user?.role;

    console.log("🕵️‍♂️ Vérification accès journal →", {
        utilisateur: req.user?.NomUtilisateur || 'Non connecté',
        role: role,
        endpoint: req.originalUrl
    });

    if (!req.user) {
        console.log('❌ Accès journal refusé - Utilisateur non authentifié');
        return res.status(401).json({ 
            success: false,
            error: 'Authentification requise',
            message: 'Vous devez être connecté pour accéder au journal.'
        });
    }

    if (role === 'Administrateur') {
        console.log('✅ Accès journal autorisé pour:', req.user.NomUtilisateur);
        next();
    } else {
        console.log('❌ Accès journal refusé - Utilisateur:', req.user.NomUtilisateur, '- Rôle:', role);
        res.status(403).json({ 
            success: false,
            error: 'Accès réservé aux administrateurs',
            message: 'Le journal d\'activité est réservé aux administrateurs.',
            details: {
                votreRole: role,
                roleRequis: 'Administrateur'
            }
        });
    }
};

module.exports = journalAccess;