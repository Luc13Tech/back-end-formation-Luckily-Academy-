// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — server.js
// Serveur principal Express + SQLite
// Prêt pour déploiement sur Render
// ═══════════════════════════════════════════════════════════
'use strict';

// Charger les variables d'environnement EN PREMIER
require('dotenv').config();

// Vérification des variables obligatoires
const REQUIRED_ENV = ['JWT_SECRET', 'CLAUDE_API_KEY'];
for (const envVar of REQUIRED_ENV) {
  if (!process.env[envVar]) {
    console.error(`❌ Variable d'environnement manquante : ${envVar}`);
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initDB, seedCourses, getDB } = require('./database');
const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const claudeRoutes = require('./routes/claude');

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────
// INITIALISATION BASE DE DONNÉES
// ──────────────────────────────────────
try {
  initDB();

  // Vérifier si les formations existent, sinon les seeder
  const db = getDB();
  const coursesCount = db.prepare('SELECT COUNT(*) as count FROM courses').get();
  if (coursesCount.count === 0) {
    console.log('📦 Aucune formation trouvée, insertion des données...');
    seedCourses();
  } else {
    console.log(`✅ ${coursesCount.count} formation(s) en base de données`);
  }
} catch (err) {
  console.error('❌ Erreur initialisation DB:', err);
  process.exit(1);
}

// ──────────────────────────────────────
// SÉCURITÉ — Helmet (headers HTTP)
// ──────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false // Géré par le frontend
}));

// ──────────────────────────────────────
// CORS
// ──────────────────────────────────────
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:5500'];

app.use(cors({
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origine (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS bloqué pour l'origine : ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// ──────────────────────────────────────
// RATE LIMITING
// ──────────────────────────────────────
// Limite globale : 100 req/15min par IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes. Réessayez dans 15 minutes.' }
});

// Limite auth : 10 tentatives/15min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

// Limite IA : 30 requêtes/15min
const claudeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quota IA atteint. Réessayez dans 15 minutes.' }
});

app.use(globalLimiter);

// ──────────────────────────────────────
// BODY PARSER
// ──────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ──────────────────────────────────────
// LOGGING SIMPLE
// ──────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const color = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    console.log(`${color}[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)\x1b[0m`);
  });
  next();
});

// ──────────────────────────────────────
// ROUTES API
// ──────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/claude', claudeLimiter, claudeRoutes);

// ──────────────────────────────────────
// ROUTE DE SANTÉ (Health Check Render)
// ──────────────────────────────────────
app.get('/health', (req, res) => {
  const db = getDB();
  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch { /* ignore */ }

  res.json({
    status: 'ok',
    service: 'Luckily Academy API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'error',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Luckily Academy API',
    version: '1.0.0',
    description: 'Backend sécurisé pour la plateforme e-learning Luckily Academy',
    author: 'Luc DEGUENON',
    endpoints: {
      health: 'GET /health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
        profile: 'PUT /api/auth/profile',
        changePassword: 'PUT /api/auth/change-password',
        verifyCode: 'POST /api/auth/verify-code',
        progress: 'POST /api/auth/progress'
      },
      courses: {
        list: 'GET /api/courses',
        detail: 'GET /api/courses/:id',
        lesson: 'GET /api/courses/:id/lesson/:lessonId',
        pdf: 'GET /api/courses/:id/pdf'
      },
      ai: {
        chat: 'POST /api/claude',
        lessonHelp: 'POST /api/claude/lesson-help'
      }
    }
  });
});

// ──────────────────────────────────────
// GESTION DES ERREURS 404
// ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route introuvable : ${req.method} ${req.path}`
  });
});

// ──────────────────────────────────────
// GESTION GLOBALE DES ERREURS
// ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Erreur non gérée:', err);

  // Erreur CORS
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ success: false, message: 'Accès refusé (CORS).' });
  }

  // Erreur JSON malformé
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'JSON invalide dans la requête.' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Erreur interne du serveur.'
      : err.message
  });
});

// ──────────────────────────────────────
// DÉMARRAGE DU SERVEUR
// ──────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '═'.repeat(50));
  console.log('  🎓  LUCKILY ACADEMY — Backend API');
  console.log('═'.repeat(50));
  console.log(`  🚀  Serveur démarré sur le port ${PORT}`);
  console.log(`  🌍  Environnement : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  🔗  URL locale : http://localhost:${PORT}`);
  console.log(`  📋  Health check : http://localhost:${PORT}/health`);
  console.log('═'.repeat(50) + '\n');
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du serveur...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Arrêt du serveur...');
  process.exit(0);
});

module.exports = app;
