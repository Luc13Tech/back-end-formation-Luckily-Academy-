// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — server.js
// Serveur principal Express + PostgreSQL
// Déployé sur Render
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

const { initDB, seedCourses, pool } = require('./database');
const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const claudeRoutes = require('./routes/claude');

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────
// INITIALISATION BASE DE DONNÉES (async)
// ──────────────────────────────────────
async function startServer() {
  try {
    // Initialiser les tables
    await initDB();
    console.log('✅ Tables PostgreSQL initialisées');

    // Vérifier si les formations existent, sinon les seeder
    const result = await pool.query('SELECT COUNT(*) as count FROM courses');
    const count = parseInt(result.rows[0].count, 10);

    if (count === 0) {
      console.log('📦 Aucune formation trouvée — insertion des données...');
      await seedCourses();
    } else {
      console.log(`✅ ${count} formation(s) déjà en base de données`);
    }
  } catch (err) {
    console.error('❌ Erreur initialisation DB:', err.message);
    // Ne pas quitter — laisser le serveur démarrer quand même
    // pour que le health check réponde
  }

  // ──────────────────────────────────────
  // SÉCURITÉ — Helmet (headers HTTP)
  // ──────────────────────────────────────
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
  }));

  // ──────────────────────────────────────
  // CORS — Autorise le frontend Vercel
  // ──────────────────────────────────────
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['*'];

  app.use(cors({
    origin: function (origin, callback) {
      // Autoriser les requêtes sans origine (Postman, mobile natif)
      if (!origin) return callback(null, true);
      if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn(`⚠️  CORS bloqué pour: ${origin}`);
      return callback(new Error(`CORS bloqué pour l'origine : ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'Accept']
  }));

  // Gérer les requêtes OPTIONS pré-vol
  app.options('*', cors());

  // ──────────────────────────────────────
  // RATE LIMITING
  // ──────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Trop de requêtes. Réessayez dans 15 minutes.' }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Trop de tentatives. Réessayez dans 15 minutes.' }
  });

  const claudeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Quota IA atteint. Réessayez dans 15 minutes.' }
  });

  app.use(globalLimiter);

  // ──────────────────────────────────────
  // BODY PARSER
  // ──────────────────────────────────────
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ──────────────────────────────────────
  // LOGGING
  // ──────────────────────────────────────
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const c = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(`${c}${req.method} ${req.path} → ${res.statusCode} (${ms}ms)\x1b[0m`);
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
  // HEALTH CHECK (Render le surveille)
  // ──────────────────────────────────────
  app.get('/health', async (req, res) => {
    let dbOk = false;
    let coursesCount = 0;
    try {
      const r = await pool.query('SELECT COUNT(*) as count FROM courses');
      coursesCount = parseInt(r.rows[0].count, 10);
      dbOk = true;
    } catch (e) {
      console.error('Health check DB error:', e.message);
    }

    res.json({
      status: 'ok',
      service: 'Luckily Academy API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'error',
      courses: coursesCount,
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // ──────────────────────────────────────
  // ROUTE RACINE — Documentation
  // ──────────────────────────────────────
  app.get('/', (req, res) => {
    res.json({
      name: 'Luckily Academy API',
      version: '1.0.0',
      author: 'Luc DEGUENON',
      description: 'Backend sécurisé PostgreSQL pour Luckily Academy',
      endpoints: {
        health: 'GET /health',
        auth: {
          register:       'POST /api/auth/register',
          login:          'POST /api/auth/login',
          logout:         'POST /api/auth/logout',
          me:             'GET  /api/auth/me',
          profile:        'PUT  /api/auth/profile',
          changePassword: 'PUT  /api/auth/change-password',
          verifyCode:     'POST /api/auth/verify-code',
          progress:       'POST /api/auth/progress',
          deleteAccount:  'DELETE /api/auth/account'
        },
        courses: {
          list:   'GET /api/courses',
          detail: 'GET /api/courses/:id',
          lesson: 'GET /api/courses/:id/lesson/:lessonId',
          pdf:    'GET /api/courses/:id/pdf'
        },
        ai: {
          chat:       'POST /api/claude',
          lessonHelp: 'POST /api/claude/lesson-help'
        }
      }
    });
  });

  // ──────────────────────────────────────
  // ROUTE SEED MANUELLE (sécurisée)
  // Appel: POST /admin/seed?key=VOTRE_JWT_SECRET
  // ──────────────────────────────────────
  app.post('/admin/seed', async (req, res) => {
    const key = req.query.key || req.body?.key;
    if (key !== process.env.JWT_SECRET) {
      return res.status(403).json({ success: false, message: 'Non autorisé.' });
    }
    try {
      await seedCourses();
      const r = await pool.query('SELECT COUNT(*) as count FROM courses');
      res.json({ success: true, message: `✅ ${r.rows[0].count} formations insérées.` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ──────────────────────────────────────
  // 404
  // ──────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route introuvable : ${req.method} ${req.path}`
    });
  });

  // ──────────────────────────────────────
  // ERREURS GLOBALES
  // ──────────────────────────────────────
  app.use((err, req, res, next) => {
    console.error('❌ Erreur non gérée:', err.message);
    if (err.message && err.message.includes('CORS')) {
      return res.status(403).json({ success: false, message: 'Accès refusé (CORS).' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, message: 'JSON invalide.' });
    }
    res.status(err.status || 500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Erreur interne.' : err.message
    });
  });

  // ──────────────────────────────────────
  // DÉMARRAGE
  // ──────────────────────────────────────
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '═'.repeat(52));
    console.log('  LUCKILY ACADEMY — Backend API (PostgreSQL)');
    console.log('═'.repeat(52));
    console.log(`  Port        : ${PORT}`);
    console.log(`  Env         : ${process.env.NODE_ENV || 'development'}`);
    console.log(`  CORS        : ${process.env.CORS_ORIGIN || '*'}`);
    console.log(`  Health      : http://localhost:${PORT}/health`);
    console.log('═'.repeat(52) + '\n');
  });

  process.on('SIGTERM', () => { console.log('Arrêt serveur...'); process.exit(0); });
  process.on('SIGINT',  () => { console.log('Arrêt serveur...'); process.exit(0); });
}

// Lancer le serveur
startServer().catch(err => {
  console.error('❌ Erreur critique au démarrage:', err);
  process.exit(1);
});

module.exports = app;
