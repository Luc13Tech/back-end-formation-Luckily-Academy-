// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — database.js
// Initialisation PostgreSQL + seed des formations
// Version sans auto-exit pour Render
// ═══════════════════════════════════════════════════════════
'use strict';

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Configuration PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ─────────────────────────────────────────
// INITIALISATION DES TABLES
// ─────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    // Table utilisateurs
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         TEXT PRIMARY KEY,
        fullname   TEXT NOT NULL,
        email      TEXT UNIQUE NOT NULL,
        password   TEXT NOT NULL,
        phone      TEXT DEFAULT '',
        role       TEXT DEFAULT 'student',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table formations
    await client.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        category    TEXT NOT NULL,
        level       TEXT NOT NULL,
        duration    TEXT NOT NULL,
        price       INTEGER NOT NULL,
        description TEXT NOT NULL,
        content     TEXT NOT NULL,
        summary     TEXT NOT NULL,
        icon        TEXT DEFAULT '📚',
        image_url   TEXT DEFAULT '',
        pdf_url     TEXT DEFAULT '',
        access_code TEXT NOT NULL,
        is_active   INTEGER DEFAULT 1,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table enrollments (accès utilisateur → formation)
    await client.query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id)
      )
    `);

    // Table progression des leçons
    await client.query(`
      CREATE TABLE IF NOT EXISTS lesson_progress (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        lesson_key  TEXT NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id, lesson_key)
      )
    `);

    // Table tokens révoqués (pour logout sécurisé)
    await client.query(`
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        jti         TEXT PRIMARY KEY,
        revoked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Index pour performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_progress_user_course ON lesson_progress(user_id, course_id)`);

    console.log('✅ Base de données PostgreSQL initialisée');
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────
// SEED — TOUTES LES FORMATIONS
// ─────────────────────────────────────────
const COURSES_SEED = [
  {
    id: 'web-marketing',
    title: 'Web Marketing',
    category: 'Marketing',
    level: 'Débutant → Pro',
    duration: '8 semaines',
    price: 10000,
    access_code: 'luckily2002',
    icon: '📢',
    image_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=700&q=80',
    description: 'Maîtrisez les stratégies digitales : SEO, réseaux sociaux, publicité en ligne, email marketing et analytics pour développer votre activité.',
    summary: JSON.stringify([
      'Introduction au marketing digital',
      'Stratégie de contenu et branding',
      'SEO et référencement naturel',
      'Réseaux sociaux & community management',
      'Google Ads et Facebook Ads',
      'Email marketing et automation',
      'Analytics et mesure des performances',
      'Plan marketing complet'
    ]),
    content: JSON.stringify({
      chapters: [
        {
          id: 1,
          title: 'Introduction au Marketing Digital',
          lessons: [
            {
              id: 'ch1-l1',
              title: "Qu'est-ce que le Marketing Digital ?",
              image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
              content: `Le marketing digital est l'ensemble des actions et stratégies réalisées sur les canaux numériques : sites web, moteurs de recherche, réseaux sociaux, emails et applications mobiles.

**Pourquoi le marketing digital est indispensable :**
Contrairement au marketing traditionnel, le marketing digital permet de :
• Cibler précisément votre audience selon l'âge, la localisation, les intérêts
• Mesurer vos résultats en temps réel
• Ajuster vos campagnes instantanément
• Atteindre des milliers de personnes avec un budget limité

**Les piliers du marketing digital :**
1. Le SEO (référencement naturel)
2. Le SEA (publicité payante)
3. Les réseaux sociaux
4. L'email marketing
5. Le content marketing
6. L'analytics

**L'écosystème digital africain :**
L'Afrique connaît une révolution digitale. Avec plus de 600 millions d'utilisateurs internet et une pénétration mobile de 80%, le continent offre des opportunités immenses. En Afrique de l'Ouest, WhatsApp (90%), Facebook (70%), Instagram (45%) et TikTok (croissance de 200%/an) sont les plateformes dominantes.`
            },
            {
              id: 'ch1-l2',
              title: 'Définir ses objectifs SMART',
              image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
              content: `Avant toute action marketing, définissez des objectifs SMART :

**S — Spécifique :** "Obtenir 500 abonnés Facebook en 3 mois"
**M — Mesurable :** vous pouvez compter les abonnés exactement
**A — Atteignable :** réaliste selon vos ressources disponibles
**R — Réaliste :** cohérent avec votre marché et secteur
**T — Temporel :** avec une date limite claire

**Exemple d'objectif mal défini :**
"Augmenter ma visibilité sur les réseaux sociaux"

**Exemple d'objectif SMART :**
"Générer 200 leads qualifiés via Facebook Ads en 60 jours avec un budget de 150 000 FCFA, pour le lancement de ma boutique en ligne."

**Les 4 types d'objectifs marketing :**
1. Notoriété — faire connaître votre marque
2. Engagement — créer une communauté active
3. Leads — attirer des prospects qualifiés
4. Conversion — transformer en clients payants`
            },
            {
              id: 'ch1-l3',
              title: 'Les canaux de marketing digital',
              image: 'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=800&q=80',
              content: `Chaque canal digital a ses forces et ses spécificités.

**SEO (référencement naturel)**
✓ Résultats durables sur le long terme
✓ Trafic gratuit et qualifié
✗ Délai de 3 à 6 mois avant résultats

**Publicité payante (Ads)**
✓ Résultats immédiats
✓ Ciblage précis de l'audience
✗ Coût continu — s'arrête sans budget

**Réseaux sociaux**
✓ Construction de communauté
✓ Interaction directe avec clients
✗ Algorithmes changeants

**Email marketing**
✓ ROI le plus élevé (42€ pour 1€ investi)
✓ Audience captive qui vous appartient
✗ Nécessite de construire une liste

**Recommandation pour débuter :**
Commencez par 2 canaux maximum. En Afrique de l'Ouest : WhatsApp Business + Facebook/Instagram.`
            },
            {
              id: 'ch1-l4',
              title: "L'écosystème digital africain",
              image: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&q=80',
              content: `L'Afrique connaît une révolution numérique sans précédent avec des opportunités immenses pour les marketeurs digitaux.

**Statistiques clés :**
• 600+ millions d'utilisateurs internet
• 80% de pénétration mobile
• 200% de croissance TikTok par an

**Plateformes dominantes en Afrique de l'Ouest :**
• WhatsApp — 90% des internautes (canal n°1)
• Facebook — 70% (communautés et publicité)
• Instagram — 45% (e-commerce et influence)
• TikTok — croissance explosive

**Spécificités du marché africain :**
1. Mobile-first : 85% des connexions via smartphone
2. Données limitées : contenu léger privilégié
3. WhatsApp Business : outil de vente incontournable
4. Paiement mobile : MTN MoMo, Flooz, Wave

**Opportunités de marché :**
Le Bénin, Togo, Sénégal, Côte d'Ivoire et Ghana sont les marchés les plus dynamiques d'Afrique de l'Ouest pour le digital.`
            }
          ]
        },
        {
          id: 2,
          title: 'SEO — Référencement Naturel',
          lessons: [
            {
              id: 'ch2-l1',
              title: 'Les bases du SEO',
              image: 'https://images.unsplash.com/photo-1562577309-4932fdd64cd1?w=800&q=80',
              content: `Le SEO (Search Engine Optimization) est l'art d'optimiser votre site pour apparaître en première page de Google sans payer.

**Pourquoi le SEO est crucial :**
• 75% des utilisateurs ne vont jamais au-delà de la première page
• Les résultats organiques reçoivent 10x plus de clics que les publicités
• Le SEO génère des résultats durables

**Les 3 piliers du SEO :**

**1. SEO Technique**
• Vitesse de chargement (< 3 secondes)
• Site mobile-friendly (responsive)
• Structure URL claire
• Certificat SSL (HTTPS)

**2. SEO On-Page**
• Mots-clés dans les titres et le contenu
• Balises meta title et description
• Images optimisées avec attribut alt
• Contenu de qualité et unique

**3. SEO Off-Page**
• Backlinks (liens entrants de qualité)
• Présence sur Google My Business
• Avis et réputation en ligne`
            },
            {
              id: 'ch2-l2',
              title: 'Recherche de mots-clés',
              image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80',
              content: `La recherche de mots-clés est la fondation de toute stratégie SEO réussie.

**Outils gratuits :**
• Google Keyword Planner
• Google Search Console
• Ubersuggest (version gratuite)
• Answer The Public
• Google Autocomplete

**Types de mots-clés :**

**Mots-clés génériques (head keywords)**
• Fort volume de recherche
• Forte concurrence
• Exemple : "formation marketing"

**Mots-clés de longue traîne (long-tail)**
• Volume plus faible mais plus ciblé
• Moins de concurrence
• Taux de conversion plus élevé
• Exemple : "formation web marketing en ligne Bénin"

**Stratégie recommandée :**
Pour un nouveau site, concentrez-vous sur les mots-clés de longue traîne. Ils sont plus faciles à cibler et convertissent mieux.`
            },
            {
              id: 'ch2-l3',
              title: 'Optimisation on-page',
              image: 'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=800&q=80',
              content: `L'optimisation on-page consiste à optimiser chaque page de votre site pour les moteurs de recherche.

**Éléments essentiels à optimiser :**

**1. Le titre (title tag)**
• 50-60 caractères maximum
• Inclure le mot-clé principal
• Exemple : "Formation Web Marketing Bénin | Luckily Academy"

**2. La meta description**
• 150-160 caractères
• Inciter au clic
• Inclure un appel à l'action

**3. Les titres H1, H2, H3**
• Un seul H1 par page (titre principal)
• H2 pour les sections
• Inclure des variantes de mots-clés

**4. Le contenu**
• Minimum 800 mots pour du bon contenu
• Densité de mots-clés naturelle (2-3%)
• Inclure des images avec attribut alt

**5. Les URLs**
• Courtes et descriptives
• Exemple : /formation-web-marketing-benin`
            },
            {
              id: 'ch2-l4',
              title: 'Google Search Console',
              image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80',
              content: `Google Search Console est un outil gratuit indispensable pour tout professionnel du SEO.

**Ce que vous pouvez faire :**
• Voir quels mots-clés amènent du trafic
• Identifier les erreurs d'indexation
• Soumettre votre sitemap
• Vérifier la compatibilité mobile
• Analyser les Core Web Vitals

**Les métriques clés :**
• Impressions : combien de fois votre site est apparu dans les résultats
• Clics : combien de fois les gens ont cliqué
• CTR (Taux de clics) : clics / impressions × 100
• Position moyenne : votre classement moyen

**Actions prioritaires :**
1. Vérifiez votre site dans Search Console
2. Soumettez votre sitemap XML
3. Corrigez les erreurs de couverture
4. Optimisez vos pages les plus proches de la page 1`
            },
            {
              id: 'ch2-l5',
              title: 'Netlinking et SEO off-page',
              image: 'https://images.unsplash.com/photo-1562577309-4932fdd64cd1?w=800&q=80',
              content: `Le SEO off-page concerne tout ce qui se passe en dehors de votre site pour améliorer votre référencement.

**Les backlinks — monnaie du SEO :**
Un backlink est un lien d'un autre site vers le vôtre. Google les voit comme des "votes de confiance".

**Comment obtenir des backlinks de qualité :**
1. Créez du contenu exceptionnel que les gens veulent partager
2. Guest blogging — écrire pour d'autres sites
3. Partenariats avec d'autres entreprises
4. Annuaires professionnels locaux
5. Témoignages sur des sites partenaires

**À éviter absolument :**
• Acheter des backlinks (pénalité Google)
• Échanges massifs de liens
• Liens de sites spammy

**Outils pour analyser vos backlinks :**
• Google Search Console (gratuit)
• Ahrefs (payant mais puissant)
• Moz Link Explorer
• SEMrush`
            }
          ]
        },
        {
          id: 3,
          title: 'Réseaux Sociaux & Community Management',
          lessons: [
            {
              id: 'ch3-l1',
              title: 'Stratégie Facebook & Instagram',
              image: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&q=80',
              content: `Facebook et Instagram sont les deux plateformes dominantes en Afrique de l'Ouest.

**Facebook :**
• Créez une Page Business professionnelle
• Publiez 3 à 5 fois par semaine
• Utilisez Facebook Groups pour créer une communauté
• Formats optimaux : vidéos courtes (30-90s), images de qualité

**Instagram :**
• Cohérence visuelle (couleurs, style)
• Stories quotidiennes (engagement x3)
• Reels pour atteindre de nouveaux abonnés
• Hashtags pertinents (10-15 par post)

**Les meilleurs horaires de publication (Afrique de l'Ouest) :**
• Matin : 7h-9h (avant le travail)
• Midi : 12h-14h (pause déjeuner)
• Soir : 19h-22h (après le travail)

**Contenus qui performent :**
1. Tutoriels et conseils pratiques
2. Coulisses de votre entreprise
3. Témoignages clients
4. Questions/Sondages
5. Promotions et offres spéciales`
            },
            {
              id: 'ch3-l2',
              title: 'Créer du contenu viral',
              image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?w=800&q=80',
              content: `Un contenu viral se partage spontanément. Il existe des formules éprouvées.

**Les 5 types de contenu qui fonctionnent :**
1. Éducatif : "5 erreurs à éviter en SEO"
2. Inspirant : success stories, témoignages
3. Divertissant : humour (adapté à votre audience)
4. Utile : tutoriels, guides pratiques
5. Émotionnel : histoires touchantes

**La règle 80/20 :**
• 80% de contenu à valeur ajoutée pour votre audience
• 20% de contenu promotionnel

**Formats performants en 2025 :**
• Vidéos courtes TikTok/Reels : 15-60 secondes
• Carrousels Instagram : 5-10 slides éducatives
• Stories interactives : sondages, quiz, questions

**L'outil AIDA pour vos publications :**
• A : Attirer l'attention (titre accrocheur)
• I : Susciter l'intérêt (problème/solution)
• D : Créer le Désir (bénéfices)
• A : Appel à l'Action (que faire maintenant ?)`
            },
            {
              id: 'ch3-l3',
              title: 'TikTok pour les entreprises',
              image: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&q=80',
              content: `TikTok est la plateforme à la croissance la plus rapide en Afrique avec une augmentation de 200% par an.

**Pourquoi TikTok pour les entreprises africaines :**
• Portée organique encore très forte (contrairement à Facebook)
• Audience jeune et engagée (18-35 ans)
• Algorithme favorise le contenu de qualité, pas les followers

**Formule pour réussir sur TikTok :**
1. Accrochez en 1-3 secondes (hook puissant)
2. Racontez une histoire ou partagez une astuce
3. Gardez 15-60 secondes idéalement
4. Utilisez des sons tendance
5. Finissez par un appel à l'action

**Idées de contenu pour entreprises :**
• "Antes y después" (avant/après)
• "Voici comment je..." (tutoriels)
• "5 secrets de..." (listes)
• Réponses aux commentaires en vidéo
• Coulisses de votre entreprise

**Conseils pratiques :**
• Publiez 1-3 fois par jour pour commencer
• Répondez aux commentaires dans les premières heures
• Utilisez 3-5 hashtags pertinents`
            },
            {
              id: 'ch3-l4',
              title: 'Gérer sa communauté',
              image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
              content: `Un community manager professionnel anime, modère et développe la communauté en ligne d'une marque.

**Les 5 missions du CM :**
1. Créer et publier du contenu
2. Répondre aux commentaires et messages
3. Modérer les discussions
4. Analyser les statistiques
5. Gérer les crises

**Répondre aux commentaires négatifs :**
1. Ne jamais ignorer (même les mauvais commentaires)
2. Répondre rapidement (< 24h)
3. Rester professionnel et empathique
4. Proposer une solution en message privé
5. Ne pas supprimer sauf contenus illégaux

**Outils de gestion des réseaux sociaux :**
• Meta Business Suite (gratuit) — Facebook/Instagram
• Buffer (versions gratuites disponibles)
• Hootsuite (planification avancée)
• Canva (création visuelle)

**Calendrier éditorial :**
Planifiez vos publications à l'avance sur 1-4 semaines. Organisez par thème, type de contenu et plateforme.`
            },
            {
              id: 'ch3-l5',
              title: 'Publicité sur les réseaux sociaux',
              image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80',
              content: `La publicité payante sur les réseaux sociaux permet d'atteindre précisément votre cible idéale.

**Facebook/Instagram Ads :**
Structure d'une campagne :
1. Campagne → Objectif (trafic, leads, ventes)
2. Groupe d'annonces → Audience + budget
3. Annonce → Visuel + texte

**Ciblage avancé disponible :**
• Par pays, ville, langue
• Par âge, sexe, situation familiale
• Par centres d'intérêt (business, mode, sport...)
• Audiences similaires (Lookalike)

**Budget recommandé pour débuter :**
• Test initial : 2 000 - 5 000 FCFA/jour
• Campagne réelle : 10 000 - 50 000 FCFA/jour

**Métriques à suivre :**
• CPM : Coût pour 1000 impressions
• CPC : Coût par clic
• CTR : Taux de clic (idéal > 2%)
• ROAS : Retour sur dépense publicitaire

**Structure d'une bonne annonce :**
1. Image/Vidéo accrocheuse
2. Titre : bénéfice principal (< 40 caractères)
3. Texte : problème + solution + CTA
4. Bouton d'appel à l'action clair`
            }
          ]
        },
        {
          id: 4,
          title: 'Email Marketing & Analytics',
          lessons: [
            {
              id: 'ch4-l1',
              title: 'Email marketing et automation',
              image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80',
              content: `L'email marketing reste le canal avec le meilleur ROI : 42$ de retour pour chaque dollar investi.

**Pour commencer :**
1. Choisissez un outil : Mailchimp (gratuit jusqu'à 500 contacts), Brevo, ActiveCampaign
2. Créez votre liste de contacts
3. Rédigez vos premiers emails
4. Automatisez vos séquences

**Séquence de bienvenue (5 emails) :**
• J1 : Email de bienvenue + ressource gratuite
• J3 : Votre histoire / valeurs
• J5 : Contenu éducatif de valeur
• J7 : Témoignages clients
• J10 : Première offre commerciale

**Taux d'ouverture moyens par secteur :**
• Éducation : 28-35%
• E-commerce : 15-25%
• Services professionnels : 20-30%

**Pour améliorer votre taux d'ouverture :**
• Objet d'email court et percutant (< 50 caractères)
• Personnalisez avec le prénom
• Testez différents horaires d'envoi
• Nettoyez régulièrement votre liste`
            },
            {
              id: 'ch4-l2',
              title: 'Analytics et mesure des performances',
              image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
              content: `Sans mesure, pas de progrès. L'analytics est la boussole de votre stratégie marketing.

**Google Analytics 4 — Installation :**
1. Créez un compte Google Analytics 4
2. Installez le code de tracking sur votre site
3. Configurez vos objectifs (conversions)
4. Attendez 24-48h pour les premières données

**Métriques essentielles à surveiller :**
• Sessions : nombre de visites
• Utilisateurs : personnes uniques
• Taux de rebond : visiteurs qui repartent immédiatement
• Durée moyenne de session
• Pages vues par session
• Taux de conversion

**Tableau de bord marketing idéal :**
1. Trafic total et sources
2. Performances par canal
3. Pages les plus visitées
4. Conversions et revenus
5. Comportement utilisateur

**Prendre des décisions basées sur les données :**
• Identifiez vos pages les plus performantes
• Doublez sur ce qui fonctionne
• Abandonnez ce qui ne convertit pas
• Testez constamment (A/B testing)`
            },
            {
              id: 'ch4-l3',
              title: 'Créer son plan marketing complet',
              image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
              content: `Un plan marketing est votre feuille de route pour atteindre vos objectifs business.

**Structure du plan marketing :**

**1. Analyse de la situation (SWOT)**
• Forces : vos avantages concurrentiels
• Faiblesses : vos points à améliorer
• Opportunités : tendances du marché
• Menaces : concurrence et risques

**2. Définition de la cible (Persona)**
Créez un profil détaillé de votre client idéal :
• Âge, profession, localisation
• Problèmes et frustrations
• Objectifs et aspirations
• Canaux utilisés

**3. Objectifs et KPIs**
Définissez des objectifs SMART avec des KPIs clairs.

**4. Stratégie et tactiques**
Choisissez vos canaux et créez votre calendrier.

**5. Budget**
Répartissez votre budget par canal.

**6. Planning et suivi**
Calendrier éditorial + tableau de bord de suivi.

**Exemple de budget mensuel pour une PME :**
• SEO/Contenu : 30%
• Publicité Meta : 40%
• Email marketing : 10%
• Outils : 20%`
            }
          ]
        }
      ]
    })
  },
  {
    id: 'negociation',
    title: 'Négociation Commerciale',
    category: 'Business',
    level: 'Débutant → Avancé',
    duration: '6 semaines',
    price: 10000,
    access_code: 'luckily2003',
    icon: '🤝',
    image_url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=700&q=80',
    description: 'Techniques de persuasion avancées, gestion des objections, closing et fidélisation client. Devenez un négociateur d\'élite.',
    summary: JSON.stringify(['Psychologie de la négociation','Préparation et stratégie BATNA','Les 6 principes de Cialdini','Gestion des objections (ACRE)','Techniques de closing','Négociation interculturelle','Fidélisation client','Jeux de rôle pratiques']),
    content: JSON.stringify({
      chapters: [
        { id: 1, title: 'Psychologie & Fondamentaux', lessons: [
          { id: 'ch1-l1', title: 'Psychologie de la négociation', image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&q=80',
            content: `La négociation est avant tout une affaire de psychologie. Comprendre comment fonctionne l'esprit humain vous donne un avantage décisif.\n\n**Les biais cognitifs essentiels :**\n• Biais de réciprocité : donnez avant de demander\n• Effet d'ancrage : le premier chiffre prononcé influence tout\n• Aversion à la perte : "vous risquez de perdre X" est plus puissant que "vous gagnez X"\n\n**Les 4 styles de négociateur :**\n1. Compétitif (gagnant/perdant)\n2. Collaboratif (gagnant/gagnant) ← recommandé\n3. Accommodant (perdant/gagnant)\n4. Évitant (perdant/perdant)` },
          { id: 'ch1-l2', title: 'Méthode BATNA — Préparer sa négociation', image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
            content: `80% du succès d'une négociation se joue avant la négociation elle-même.\n\n**BATNA = Best Alternative To a Negotiated Agreement**\n(Meilleure alternative à un accord négocié)\n\nConnaissez votre BATNA et celui de votre interlocuteur. Plus votre BATNA est solide, plus vous négociez avec confiance.\n\n**Checklist de préparation :**\n✓ Quel est mon objectif idéal ?\n✓ Quel est mon seuil minimal acceptable ?\n✓ Quels sont les besoins réels de mon interlocuteur ?\n✓ Quelles sont mes concessions possibles ?\n✓ Quels sont mes arguments clés ?` }
        ]},
        { id: 2, title: 'Techniques de Persuasion', lessons: [
          { id: 'ch2-l1', title: 'Les 6 principes de Cialdini', image: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800&q=80',
            content: `Robert Cialdini a identifié 6 principes universels de persuasion :\n\n1. **Réciprocité** : Les gens rendent ce qu'ils reçoivent → Offrez quelque chose avant de demander\n2. **Engagement & Cohérence** : On reste fidèle à ses engagements → Faites dire "oui" sur des petites choses d'abord\n3. **Preuve sociale** : On fait comme les autres → Utilisez des témoignages et chiffres clients\n4. **Autorité** : On fait confiance aux experts → Montrez vos certifications, expériences\n5. **Sympathie** : On dit oui à ceux qu'on aime → Créez un lien avant de vendre\n6. **Rareté** : Ce qui est rare est désirable → "Places limitées", "Offre valable jusqu'au..."` },
          { id: 'ch2-l2', title: 'Gérer les objections (ACRE)', image: 'https://images.unsplash.com/photo-1573497019418-b400bb3ab074?w=800&q=80',
            content: `Une objection n'est pas un refus. C'est une demande d'information supplémentaire.\n\n**Les 5 objections les plus courantes :**\n1. "C'est trop cher" → "Par rapport à quoi ? Quel budget avez-vous ?"\n2. "Je dois réfléchir" → "Qu'est-ce qui vous retient ?"\n3. "Je n'ai pas le temps" → "Combien de temps vous faudrait-il ?"\n4. "Je dois en parler à..." → "Quand pouvez-vous lui en parler ?"\n5. "J'ai déjà un fournisseur" → "Qu'est-ce qui vous rendrait curieux d'en découvrir un autre ?"\n\n**Méthode ACRE :**\n- A : Accepter (écouter sans interrompre)\n- C : Clarifier (poser des questions)\n- R : Répondre (apporter une solution)\n- E : Engager (avancer vers la décision)` }
        ]},
        { id: 3, title: 'Closing & Fidélisation', lessons: [
          { id: 'ch3-l1', title: "L'art du closing", image: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800&q=80',
            content: `Le closing est le moment de conclure la vente.\n\n**Techniques de closing efficaces :**\n1. La question alternative : "Vous préférez commencer lundi ou mardi ?"\n2. Le résumé : "Donc si je comprends bien, vous avez besoin de X, Y et Z. Mon offre couvre tout cela. On y va ?"\n3. L'urgence : "Je n'ai plus que 2 places disponibles ce mois-ci"\n4. L'essai : "Commençons par une période d'essai de 30 jours"\n\n**Signaux d'achat à repérer :**\n• Questions sur les délais de livraison\n• Questions sur la garantie\n• Demande de références clients\n• Calculs du ROI` }
        ]}
      ]
    })
  },
  {
    id: 'dev-frontend',
    title: 'Développement Web Frontend',
    category: 'Dev',
    level: 'Débutant → Pro',
    duration: '12 semaines',
    price: 20000,
    access_code: 'luckily2005',
    icon: '💻',
    image_url: 'https://images.unsplash.com/photo-1547658719-da2b51169166?w=700&q=80',
    description: 'HTML5, CSS3, JavaScript ES6+, React.js. De la page blanche au site professionnel complet.',
    summary: JSON.stringify(['HTML5 sémantique','CSS3 et animations','Flexbox et CSS Grid','JavaScript ES6+','DOM et événements','Fetch API et JSON','React.js','Projet final complet','Déploiement Vercel','Portfolio professionnel']),
    content: JSON.stringify({
      chapters: [
        { id: 1, title: 'HTML5 — Fondamentaux', lessons: [
          { id: 'ch1-l1', title: "Structure d'une page web HTML5", image: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=800&q=80',
            content: `HTML (HyperText Markup Language) est le squelette de toute page web.\n\n**Structure de base HTML5 :**\n\`\`\`html\n<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="UTF-8"/>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n  <title>Ma Page</title>\n</head>\n<body>\n  <header><nav>Navigation</nav></header>\n  <main><h1>Titre Principal</h1><p>Paragraphe.</p></main>\n  <footer>Pied de page</footer>\n</body>\n</html>\n\`\`\`\n\n**Les balises sémantiques HTML5 :**\n• header — En-tête du site\n• nav — Navigation principale\n• main — Contenu principal\n• article — Article indépendant\n• section — Section thématique\n• aside — Contenu secondaire\n• footer — Pied de page` },
          { id: 'ch1-l2', title: 'Formulaires HTML complets', image: 'https://images.unsplash.com/photo-1555421689-3f034debb7a6?w=800&q=80',
            content: `Les formulaires HTML permettent de collecter des données utilisateur.\n\n**Formulaire de contact complet :**\n\`\`\`html\n<form action="/contact" method="POST">\n  <label for="nom">Nom *</label>\n  <input type="text" id="nom" name="nom" required placeholder="Jean Dupont"/>\n  \n  <label for="email">Email *</label>\n  <input type="email" id="email" name="email" required/>\n  \n  <label for="message">Message *</label>\n  <textarea id="message" name="message" rows="5" required></textarea>\n  \n  <button type="submit">Envoyer</button>\n</form>\n\`\`\`\n\n**Types d'input utiles :**\n• text, email, password, tel, number, date, file\n• required, minlength, maxlength, pattern\n• placeholder, autocomplete` }
        ]},
        { id: 2, title: 'CSS3 — Design & Style', lessons: [
          { id: 'ch2-l1', title: 'Flexbox — mise en page moderne', image: 'https://images.unsplash.com/photo-1523437113738-bbd3cc89fb19?w=800&q=80',
            content: `Flexbox est la méthode moderne de mise en page CSS. Elle résout 90% des problèmes.\n\n**Activer Flexbox :**\n\`\`\`css\n.container {\n  display: flex;\n  flex-direction: row; /* ou column */\n  justify-content: space-between; /* axe principal */\n  align-items: center; /* axe secondaire */\n  gap: 16px;\n  flex-wrap: wrap;\n}\n\`\`\`\n\n**Centrage parfait :**\n\`\`\`css\n.centre {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  min-height: 100vh;\n}\n\`\`\`\n\n**Navbar responsive :**\n\`\`\`css\nnav {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 0 24px;\n  height: 70px;\n}\n\`\`\`` },
          { id: 'ch2-l2', title: 'CSS Grid et Responsive Design', image: 'https://images.unsplash.com/photo-1507721999472-8ed4421c4af2?w=800&q=80',
            content: `CSS Grid est parfait pour les mises en page complexes en 2 dimensions.\n\n**Grille de base :**\n\`\`\`css\n.grille {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 24px;\n}\n\`\`\`\n\n**Media Queries — Responsive :**\n\`\`\`css\n/* Desktop */\n.grille { grid-template-columns: repeat(3, 1fr); }\n\n/* Tablette */\n@media (max-width: 768px) {\n  .grille { grid-template-columns: repeat(2, 1fr); }\n}\n\n/* Mobile */\n@media (max-width: 480px) {\n  .grille { grid-template-columns: 1fr; }\n}\n\`\`\`\n\n**Variables CSS :**\n\`\`\`css\n:root {\n  --primary: #00B4D8;\n  --text: #1A1A2E;\n  --radius: 12px;\n}\n\n.bouton {\n  background: var(--primary);\n  border-radius: var(--radius);\n}\n\`\`\`` }
        ]},
        { id: 3, title: 'JavaScript ES6+', lessons: [
          { id: 'ch3-l1', title: 'DOM Manipulation', image: 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=800&q=80',
            content: `Le DOM (Document Object Model) représente votre page HTML en objets JavaScript manipulables.\n\n**Sélectionner des éléments :**\n\`\`\`javascript\nconst titre = document.getElementById('titre');\nconst boutons = document.querySelectorAll('.btn');\nconst premier = document.querySelector('.carte');\n\`\`\`\n\n**Modifier le contenu :**\n\`\`\`javascript\ntexte.textContent = 'Nouveau texte';\ntexte.innerHTML = '<strong>Texte en gras</strong>';\nimage.src = 'nouvelle-image.jpg';\nelement.style.color = 'red';\n\`\`\`\n\n**Gérer les événements :**\n\`\`\`javascript\nbouton.addEventListener('click', () => {\n  alert('Bouton cliqué !');\n});\n\ninput.addEventListener('input', (e) => {\n  console.log(e.target.value);\n});\n\`\`\`` },
          { id: 'ch3-l2', title: 'Fetch API et JSON', image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&q=80',
            content: `Fetch API permet de communiquer avec des serveurs web depuis JavaScript.\n\n**Récupérer des données (GET) :**\n\`\`\`javascript\nasync function chargerDonnees() {\n  try {\n    const reponse = await fetch('https://api.exemple.com/data');\n    if (!reponse.ok) throw new Error('Erreur: ' + reponse.status);\n    const data = await reponse.json();\n    console.log(data);\n  } catch (erreur) {\n    console.error('Erreur:', erreur);\n  }\n}\n\`\`\`\n\n**Envoyer des données (POST) :**\n\`\`\`javascript\nasync function envoyerData(data) {\n  const reponse = await fetch('/api/endpoint', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify(data)\n  });\n  return reponse.json();\n}\n\`\`\`` }
        ]}
      ]
    })
  },
  {
    id: 'dev-backend',
    title: 'Développement Web Backend',
    category: 'Dev',
    level: 'Intermédiaire → Pro',
    duration: '14 semaines',
    price: 25000,
    access_code: 'luckily2006',
    icon: '⚙️',
    image_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=700&q=80',
    description: 'Node.js, PHP, MySQL, MongoDB, APIs REST, authentification JWT. Maîtrisez le développement côté serveur.',
    summary: JSON.stringify(['Fondamentaux serveur & HTTP','Node.js & Express.js','SQL avec MySQL','MongoDB & Mongoose','APIs REST complètes','Authentification JWT','Sécurité web','Déploiement & DevOps','PHP & Laravel','2 projets complets']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'Node.js & Express', lessons: [{ id: 'ch1-l1', title: 'Introduction au Backend', image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80', content: 'Introduction complète au développement backend avec Node.js et Express.js.' }]}]})
  },
  {
    id: 'analyse-donnees',
    title: 'Analyse des Données',
    category: 'Data',
    level: 'Débutant → Pro',
    duration: '10 semaines',
    price: 15000,
    access_code: 'luckily2007',
    icon: '📊',
    image_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=700&q=80',
    description: 'Excel avancé, Python (Pandas, NumPy), Power BI — transformez les données en insights précieux.',
    summary: JSON.stringify(['Introduction à la Data Analyse','Excel avancé — TCD','Power Query','Python — Pandas & NumPy','Visualisation Matplotlib','Power BI Dashboards','SQL pour analystes','Statistiques descriptives','Rapport d\'analyse','2 projets réels']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'Excel pour l\'Analyse', lessons: [{ id: 'ch1-l1', title: 'Tableaux croisés dynamiques', image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80', content: 'Maîtrisez les tableaux croisés dynamiques pour analyser rapidement vos données.' }]}]})
  },
  {
    id: 'charge-clientele',
    title: 'Chargé Clientèle',
    category: 'Service',
    level: 'Débutant → Pro',
    duration: '6 semaines',
    price: 10000,
    access_code: 'luckily2004',
    icon: '🎯',
    image_url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=700&q=80',
    description: 'Excellence dans la relation client : accueil, gestion des réclamations, fidélisation et service après-vente.',
    summary: JSON.stringify(['Excellence dans l\'accueil','Communication empathique','Gestion des réclamations HEARD','Fidélisation client','Outils CRM','Gestion du stress','Service multicanal','KPIs satisfaction']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'Excellence Accueil', lessons: [{ id: 'ch1-l1', title: 'Les 7 secondes fatidiques', image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80', content: 'Le client forge son impression en 7 secondes. Maîtrisez l\'art de l\'accueil professionnel.' }]}]})
  },
  {
    id: 'word-debutant',
    title: 'Microsoft Word — Débutant',
    category: 'Bureautique',
    level: 'Débutant',
    duration: '2 semaines',
    price: 5000,
    access_code: 'luckily2008',
    icon: '📝',
    image_url: 'https://images.unsplash.com/photo-1618044619888-009e412ff12a?w=700&q=80',
    description: 'Créer, formater, mettre en page et imprimer des documents professionnels avec Word.',
    summary: JSON.stringify(['Interface et navigation Word','Saisie et correction','Mise en forme des caractères','Paragraphes et alignements','Listes à puces','Tableaux et images','Mise en page','PDF et partage']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'Découverte de Word', lessons: [{ id: 'ch1-l1', title: "L'interface Microsoft Word", image: 'https://images.unsplash.com/photo-1618044619888-009e412ff12a?w=800&q=80', content: 'Découvrez l\'interface complète de Microsoft Word et maîtrisez les raccourcis essentiels.' }]}]})
  },
  {
    id: 'word-intermediaire',
    title: 'Microsoft Word — Intermédiaire',
    category: 'Bureautique',
    level: 'Intermédiaire',
    duration: '2 semaines',
    price: 5000,
    access_code: 'luckily2009',
    icon: '📄',
    image_url: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=700&q=80',
    description: 'Styles, tables des matières automatiques, publipostage, en-têtes et pieds de page avancés.',
    summary: JSON.stringify(['Styles Word','Table des matières automatique','En-têtes avancés','Publipostage','Protection documents','Suivi des modifications','Modèles personnalisés','Champs automatiques']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'Styles et Documents', lessons: [{ id: 'ch1-l1', title: 'Maîtriser les styles Word', image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=800&q=80', content: 'Les styles sont la fonctionnalité la plus puissante de Word pour les documents professionnels.' }]}]})
  },
  {
    id: 'word-avance',
    title: 'Microsoft Word — Avancé',
    category: 'Bureautique',
    level: 'Avancé',
    duration: '3 semaines',
    price: 5000,
    access_code: 'luckily2010',
    icon: '📋',
    image_url: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?w=700&q=80',
    description: 'Macros VBA, formulaires interactifs, publipostage avancé et automatisation complète de Word.',
    summary: JSON.stringify(['Macros Word','VBA pour automatiser','Formulaires interactifs','Publipostage avancé','Documents maîtres','Révision et co-édition','Scripts automatisation','Intégration Office']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'Macros et Automatisation', lessons: [{ id: 'ch1-l1', title: 'Introduction aux macros Word', image: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?w=800&q=80', content: 'Les macros permettent d\'automatiser des tâches répétitives dans Word.' }]}]})
  },
  {
    id: 'excel-debutant',
    title: 'Microsoft Excel — Débutant',
    category: 'Bureautique',
    level: 'Débutant',
    duration: '2 semaines',
    price: 5000,
    access_code: 'luckily2011',
    icon: '📊',
    image_url: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=700&q=80',
    description: 'Feuilles de calcul, formules de base (SOMME, MOYENNE), graphiques simples et mise en forme.',
    summary: JSON.stringify(['Interface Excel','Cellules, lignes et colonnes','Formules de base','Mise en forme','Tri et filtrage','Graphiques simples','Impression','Gestion classeurs']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'Découverte Excel', lessons: [{ id: 'ch1-l1', title: "L'interface Excel", image: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&q=80', content: 'Découvrez l\'interface complète de Microsoft Excel et maîtrisez la navigation.' }]}]})
  },
  {
    id: 'excel-intermediaire',
    title: 'Microsoft Excel — Intermédiaire',
    category: 'Bureautique',
    level: 'Intermédiaire',
    duration: '3 semaines',
    price: 5000,
    access_code: 'luckily2012',
    icon: '📈',
    image_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=700&q=80',
    description: 'VLOOKUP, INDEX-MATCH, tableaux structurés, graphiques avancés, mise en forme conditionnelle.',
    summary: JSON.stringify(['VLOOKUP et HLOOKUP','INDEX et MATCH','Fonctions conditionnelles','Mise en forme conditionnelle','Tableaux structurés','Graphiques avancés','Validation données','Protection feuilles']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'Formules de Recherche', lessons: [{ id: 'ch1-l1', title: 'VLOOKUP — La recherche verticale', image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80', content: 'VLOOKUP (RECHERCHEV) est l\'une des fonctions les plus utilisées en entreprise.' }]}]})
  },
  {
    id: 'excel-avance',
    title: 'Microsoft Excel — Avancé',
    category: 'Bureautique',
    level: 'Avancé',
    duration: '3 semaines',
    price: 5000,
    access_code: 'luckily2013',
    icon: '📉',
    image_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=700&q=80',
    description: 'Power Query, VBA, macros, tableaux croisés avancés et dashboards professionnels.',
    summary: JSON.stringify(['Power Query','TCD avancés et segments','Macros et VBA Excel','Fonctions matricielles','Tableaux de bord','Analyse de simulation','Solveur','Connexions externes']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'Power Query & VBA', lessons: [{ id: 'ch1-l1', title: 'Power Query — Transformer les données', image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80', content: 'Power Query est l\'outil de transformation de données intégré dans Excel.' }]}]})
  },
  {
    id: 'outils',
    title: 'Outils Bureautique & Compatibilité',
    category: 'Bureautique',
    level: 'Tous niveaux',
    duration: '2 semaines',
    price: 5000,
    access_code: 'luckily2014',
    icon: '🔧',
    image_url: 'https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=700&q=80',
    description: 'PDF, Google Workspace, LibreOffice et conversion de formats. Maîtrisez l\'écosystème bureautique.',
    summary: JSON.stringify(['Créer et éditer des PDF','Adobe Reader et outils PDF','Google Docs, Sheets, Slides','LibreOffice','Conversion formats','Google Drive et OneDrive','Collaboration','Signatures électroniques']),
    content: JSON.stringify({ chapters: [{ id: 1, title: 'PDF et Google Workspace', lessons: [{ id: 'ch1-l1', title: 'Maîtriser les PDF', image: 'https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=800&q=80', content: 'Le PDF (Portable Document Format) est le standard mondial pour partager des documents.' }]}]})
  }
];

async function seedCourses() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const insertCourse = `
      INSERT INTO courses
      (id, title, category, level, duration, price, description, content, summary, icon, image_url, access_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        level = EXCLUDED.level,
        duration = EXCLUDED.duration,
        price = EXCLUDED.price,
        description = EXCLUDED.description,
        content = EXCLUDED.content,
        summary = EXCLUDED.summary,
        icon = EXCLUDED.icon,
        image_url = EXCLUDED.image_url,
        access_code = EXCLUDED.access_code
    `;
    
    for (const c of COURSES_SEED) {
      await client.query(insertCourse, [
        c.id, c.title, c.category, c.level, c.duration, c.price,
        c.description, c.content, c.summary, c.icon, c.image_url, c.access_code
      ]);
    }
    
    await client.query('COMMIT');
    console.log(`✅ ${COURSES_SEED.length} formations insérées dans PostgreSQL`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur seed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────
// FONCTIONS D'EXPORT
// ─────────────────────────────────────────
function getDB() {
  return pool;
}

// ⚠️ PAS D'AUTO-EXÉCUTION ICI ! ⚠️
// L'initialisation est gérée par server.js au démarrage
// Ce fichier n'exporte que les fonctions et le pool

module.exports = { pool, getDB, initDB, seedCourses };
