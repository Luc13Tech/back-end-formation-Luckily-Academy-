# 🎓 Luckily Academy — Backend API

Backend sécurisé Node.js + Express + SQLite pour la plateforme e-learning Luckily Academy.

## 🚀 Déploiement sur Render

### Étape 1 — Créer le repo GitHub

```bash
git init
git add .
git commit -m "Luckily Academy Backend v1.0"
git remote add origin https://github.com/Luc13Tech/luckily-backend.git
git push -u origin main
```

### Étape 2 — Déployer sur Render

1. Allez sur [render.com](https://render.com)
2. **New** → **Web Service**
3. Connectez votre repo GitHub `luckily-backend`
4. Configurez :
   - **Name** : `luckily-academy-api`
   - **Runtime** : `Node`
   - **Build Command** : `npm install && node database.js --seed`
   - **Start Command** : `npm start`
   - **Plan** : Free (ou Starter pour la persistance)

### Étape 3 — Variables d'environnement sur Render

Dans **Environment** → **Add Environment Variable** :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | `2db006f0ca90103342ea1711ddc136741be3320ecef74dae4d40b2fd9c1dfac247bbf0c5adf14cbacc53d3f1f9293e247d506a4ef08d9935b4fee71a36d2dc9e` |
| `CLAUDE_API_KEY` | `sk-ant-api03-PQMx...` |
| `CORS_ORIGIN` | `https://nation-1kup.vercel.app` |
| `PORT` | `3000` |

### Étape 4 — Récupérer l'URL de l'API

Après déploiement, Render vous donne une URL comme :
`https://luckily-academy-api.onrender.com`

**Copiez cette URL et donnez-la pour intégration dans le frontend.**

---

## 📋 Routes API

### Authentification
```
POST /api/auth/register      → Créer un compte
POST /api/auth/login         → Se connecter
POST /api/auth/logout        → Se déconnecter
GET  /api/auth/me            → Infos utilisateur connecté
PUT  /api/auth/profile       → Modifier le profil
PUT  /api/auth/change-password → Changer le mot de passe
POST /api/auth/verify-code   → Vérifier code de formation
POST /api/auth/progress      → Marquer leçon comme complétée
DELETE /api/auth/account     → Supprimer le compte
```

### Formations
```
GET /api/courses             → Liste des formations (publique)
GET /api/courses/:id         → Détail (contenu complet si inscrit)
GET /api/courses/:id/lesson/:lessonId → Contenu d'une leçon
GET /api/courses/:id/pdf     → Télécharger le PDF
```

### Intelligence Artificielle
```
POST /api/claude             → Question IA (avec contexte cours)
POST /api/claude/lesson-help → Aide rapide sur une leçon
```

### Santé
```
GET /health                  → Status du serveur
GET /                        → Documentation API
```

---

## 🔐 Sécurité

- ✅ Mots de passe hashés avec bcrypt (12 rounds)
- ✅ JWT avec expiration 7 jours
- ✅ Tokens révocables (logout sécurisé)
- ✅ Rate limiting (100 req/15min globale, 10/15min auth, 30/15min IA)
- ✅ CORS restreint à votre domaine
- ✅ Headers sécurisés via Helmet
- ✅ Validation des entrées avec express-validator
- ✅ Contenu cours protégé (accessible seulement aux inscrits)
- ✅ Aucune clé secrète dans le code

---

## 🛠 Développement local

```bash
# Installer les dépendances
npm install

# Créer le fichier .env
cp .env.example .env
# Éditez .env avec vos valeurs

# Initialiser la base de données
node database.js --seed

# Démarrer en développement
npm run dev

# Démarrer en production
npm start
```

---

## 📁 Structure des fichiers

```
luckily-backend/
├── server.js          → Serveur Express principal
├── database.js        → Init SQLite + données formations
├── package.json
├── .env.example       → Template variables d'environnement
├── .gitignore
├── middleware/
│   └── auth.js        → Vérification JWT
└── routes/
    ├── auth.js        → Inscription, connexion, profil
    ├── courses.js     → Formations et leçons
    └── claude.js      → IA avec contexte cours
```

---

## ⚠️ Note importante — SQLite sur Render

Le plan **Free** de Render ne persiste pas les données entre redémarrages.
Pour la production, utilisez le plan **Starter** ou ajoutez un disque persistant.

Alternative : migrer vers PostgreSQL (Render en offre gratuitement).

---

**Développé par Luc DEGUENON — Luckily Academy © 2025**
