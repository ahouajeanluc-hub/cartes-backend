const { getDB } = require('../db/mongodb');

const inventaireController = {
  // 🔍 RECHERCHE MULTICRITÈRES AVEC PAGINATION - VERSION MONGODB
  rechercheCartes: async (req, res) => {
    try {
      const {
        nom,
        prenom, 
        contact,
        siteRetrait,
        lieuNaissance, 
        dateNaissance,
        rangement,
        page = 1,
        limit = 50
      } = req.query;

      console.log('📦 Critères reçus MongoDB:', req.query);

      // ✅ CALCUL PAGINATION
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // ✅ CONSTRUIRE LA REQUÊTE MONGODB
      let query = {};

      // 🔤 NOM (recherche partielle insensible à la casse)
      if (nom && nom.trim() !== '') {
        query.NOM = { $regex: nom.trim(), $options: 'i' };
      }

      // 🔤 PRÉNOM (recherche partielle insensible à la casse)  
      if (prenom && prenom.trim() !== '') {
        query.PRENOMS = { $regex: prenom.trim(), $options: 'i' };
      }

      // 📞 CONTACT (recherche partielle)
      if (contact && contact.trim() !== '') {
        query.CONTACT = { $regex: contact.trim(), $options: 'i' };
      }

      // 🏢 SITE DE RETRAIT (recherche partielle insensible à la casse)
      if (siteRetrait && siteRetrait.trim() !== '') {
        query["SITE DE RETRAIT"] = { $regex: siteRetrait.trim(), $options: 'i' };
      }

      // 🗺️ LIEU DE NAISSANCE (recherche partielle insensible à la casse)
      if (lieuNaissance && lieuNaissance.trim() !== '') {
        query["LIEU NAISSANCE"] = { $regex: lieuNaissance.trim(), $options: 'i' };
      }

      // 🎂 DATE DE NAISSANCE (exacte)
      if (dateNaissance && dateNaissance.trim() !== '') {
        query["DATE DE NAISSANCE"] = dateNaissance.trim();
      }

      // 📦 RANGEMENT (recherche partielle insensible à la casse)
      if (rangement && rangement.trim() !== '') {
        query.RANGEMENT = { $regex: rangement.trim(), $options: 'i' };
      }

      console.log('📋 Requête MongoDB:', JSON.stringify(query, null, 2));

      // 🗄️ EXÉCUTER LES REQUÊTES MONGODB
      const db = getDB();
      
      // Exécuter les requêtes en parallèle pour meilleures performances
      const [cartes, total] = await Promise.all([
        // Requête pour les données avec pagination
        db.collection('cartes')
          .find(query)
          .sort({ "SITE DE RETRAIT": 1, "NOM": 1 }) // Tri par site puis nom
          .skip(skip)
          .limit(limitNum)
          .toArray(),
        
        // Requête pour le total
        db.collection('cartes').countDocuments(query)
      ]);

      const totalPages = Math.ceil(total / limitNum);

      console.log(`✅ ${cartes.length} cartes trouvées sur ${total} total`);
      
      // Debug: vérifier que les IDs sont présents
      if (cartes.length > 0) {
        console.log(`🔍 Premier résultat avec _id: ${cartes[0]._id}`);
        console.log(`🔍 Dernier résultat avec _id: ${cartes[cartes.length - 1]._id}`);
      }

      // Formater la réponse pour inclure à la fois _id (MongoDB) et ID (compatibilité)
      const cartesFormatees = cartes.map(carte => ({
        ...carte,
        ID: carte._id.toString() // ✅ Compatibilité avec l'existant
      }));

      res.json({
        success: true,
        cartes: cartesFormatees,
        total: total,
        page: pageNum,
        totalPages: totalPages,
        limit: limitNum
      });

    } catch (error) {
      console.error('❌ Erreur recherche MongoDB:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la recherche dans la base de données',
        details: error.message
      });
    }
  },

  // ✅ NOUVELLE MÉTHODE : Recherche avancée avec agrégation
  rechercheAvancee: async (req, res) => {
    try {
      const { criteres, page = 1, limit = 50 } = req.body;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const db = getDB();

      // Pipeline d'agrégation pour recherches complexes
      const pipeline = [
        { $match: criteres },
        { 
          $project: {
            "LIEU D'ENROLEMENT": 1,
            "SITE DE RETRAIT": 1,
            "RANGEMENT": 1,
            "NOM": 1,
            "PRENOMS": 1,
            "DATE DE NAISSANCE": 1,
            "LIEU NAISSANCE": 1,
            "CONTACT": 1,
            "DELIVRANCE": 1,
            "CONTACT DE RETRAIT": 1,
            "DATE DE DELIVRANCE": 1,
            "ID": "$_id" // ✅ Compatibilité
          }
        },
        { $sort: { "SITE DE RETRAIT": 1, "NOM": 1 } },
        { $skip: skip },
        { $limit: limitNum }
      ];

      const [cartes, total] = await Promise.all([
        db.collection('cartes').aggregate(pipeline).toArray(),
        db.collection('cartes').countDocuments(criteres)
      ]);

      const totalPages = Math.ceil(total / limitNum);

      res.json({
        success: true,
        cartes: cartes,
        total: total,
        page: pageNum,
        totalPages: totalPages,
        limit: limitNum
      });

    } catch (error) {
      console.error('❌ Erreur recherche avancée MongoDB:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la recherche avancée',
        details: error.message
      });
    }
  }
};

module.exports = inventaireController;