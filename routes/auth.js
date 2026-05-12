// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — routes/auth.js
// Routes : inscription, connexion, profil, vérification code
// Version PostgreSQL asynchrone
// ═══════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// ─── Helper : générer JWT ───
function generateToken(userId, email, role, jti) {
  return jwt.sign(
    { userId, email, role, jti },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ─── Helper : formater les erreurs de validation ───
function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  return null;
}

// ══════════════════════════════════
// POST /api/auth/register
// ══════════════════════════════════
router.post('/register', [
  body('fullname')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères.'),
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide.'),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères.'),
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Numéro de téléphone invalide.')
], async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return;

  const client = await pool.connect();
  try {
    const { fullname, email, password, phone = '' } = req.body;

    // Vérifier si email déjà utilisé
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cet email est déjà utilisé. Veuillez vous connecter.'
      });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const jti = uuidv4();

    // Insérer l'utilisateur
    await client.query(
      `INSERT INTO users (id, fullname, email, password, phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, fullname.trim(), email.toLowerCase(), hashedPassword, phone.trim()]
    );

    // Générer le token JWT
    const token = generateToken(userId, email.toLowerCase(), 'student', jti);

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès !',
      token,
      user: {
        id: userId,
        fullname: fullname.trim(),
        email: email.toLowerCase(),
        phone: phone.trim(),
        role: 'student'
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur. Veuillez réessayer.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════
router.post('/login', [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide.'),
  body('password')
    .notEmpty()
    .withMessage('Mot de passe requis.')
], async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return;

  const client = await pool.connect();
  try {
    const { email, password } = req.body;

    // Chercher l'utilisateur
    const userResult = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      // Délai fixe pour éviter les attaques par timing
      await bcrypt.compare(password, '$2a$12$invalidhashforstalling00000000000000000000000000000000');
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.'
      });
    }

    const user = userResult.rows[0];
    
    // Vérifier le mot de passe
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.'
      });
    }

    const jti = uuidv4();
    const token = generateToken(user.id, user.email, user.role, jti);

    // Récupérer les formations inscrites
    const enrollmentsResult = await client.query(
      'SELECT course_id FROM enrollments WHERE user_id = $1',
      [user.id]
    );
    const enrollments = enrollmentsResult.rows.map(e => e.course_id);

    res.json({
      success: true,
      message: 'Connexion réussie !',
      token,
      user: {
        id: user.id,
        fullname: user.fullname,
        email: user.email,
        phone: user.phone,
        role: user.role,
        enrollments
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur. Veuillez réessayer.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// POST /api/auth/logout
// ══════════════════════════════════
router.post('/logout', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    // Révoquer le token
    await client.query(
      'INSERT INTO revoked_tokens (jti) VALUES ($1) ON CONFLICT (jti) DO NOTHING',
      [req.tokenJti]
    );
    // Nettoyer les vieux tokens révoqués (> 8 jours)
    await client.query(
      "DELETE FROM revoked_tokens WHERE revoked_at < NOW() - INTERVAL '8 days'"
    );
    res.json({ success: true, message: 'Déconnecté avec succès.' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// GET /api/auth/me
// ══════════════════════════════════
router.get('/me', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userResult = await client.query(
      'SELECT id, fullname, email, phone, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    const user = userResult.rows[0];

    // Récupérer les formations inscrites
    const enrollmentsResult = await client.query(
      'SELECT course_id FROM enrollments WHERE user_id = $1',
      [user.id]
    );
    const enrollments = enrollmentsResult.rows.map(e => e.course_id);

    // Récupérer la progression
    const progressResult = await client.query(
      'SELECT course_id, lesson_key FROM lesson_progress WHERE user_id = $1',
      [user.id]
    );

    const progressMap = {};
    progressResult.rows.forEach(p => {
      if (!progressMap[p.course_id]) progressMap[p.course_id] = [];
      progressMap[p.course_id].push(p.lesson_key);
    });

    res.json({
      success: true,
      user: { ...user, enrollments, progress: progressMap }
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// PUT /api/auth/profile
// ══════════════════════════════════
router.put('/profile', authenticateToken, [
  body('fullname')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères.'),
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Numéro de téléphone invalide.')
], async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return;

  const client = await pool.connect();
  try {
    const { fullname, phone } = req.body;
    
    // Récupérer les valeurs actuelles
    const currentResult = await client.query(
      'SELECT fullname, phone FROM users WHERE id = $1',
      [req.user.id]
    );
    const current = currentResult.rows[0];

    await client.query(
      `UPDATE users 
       SET fullname = $1, phone = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [
        fullname ? fullname.trim() : current.fullname,
        phone !== undefined ? phone.trim() : current.phone,
        req.user.id
      ]
    );

    res.json({ success: true, message: 'Profil mis à jour.' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// PUT /api/auth/change-password
// ══════════════════════════════════
router.put('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis.'),
  body('newPassword').isLength({ min: 6 }).withMessage('Le nouveau mot de passe doit avoir au moins 6 caractères.')
], async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return;

  const client = await pool.connect();
  try {
    const { currentPassword, newPassword } = req.body;
    
    const userResult = await client.query(
      'SELECT password FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Mot de passe actuel incorrect.' });
    }
    
    const hashed = await bcrypt.hash(newPassword, 12);
    await client.query(
      "UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [hashed, req.user.id]
    );
    
    res.json({ success: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// DELETE /api/auth/account
// ══════════════════════════════════
router.delete('/account', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    // Les suppressions en cascade gèrent les dépendances (enrollments, progress)
    await client.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Compte supprimé avec succès.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// POST /api/auth/verify-code
// Vérifier le code d'une formation
// ══════════════════════════════════
router.post('/verify-code', authenticateToken, [
  body('courseId').trim().notEmpty().withMessage('ID de formation requis.'),
  body('code').trim().notEmpty().withMessage("Code d'accès requis.")
], async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return;

  const client = await pool.connect();
  try {
    const { courseId, code } = req.body;

    // Vérifier que la formation existe
    const courseResult = await client.query(
      'SELECT id, access_code, title FROM courses WHERE id = $1 AND is_active = 1',
      [courseId]
    );
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formation introuvable.' });
    }

    const course = courseResult.rows[0];

    // Vérifier si déjà inscrit
    const existingResult = await client.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );
    
    if (existingResult.rows.length > 0) {
      return res.json({ 
        success: true, 
        message: 'Vous avez déjà accès à cette formation.', 
        alreadyEnrolled: true 
      });
    }

    // Comparer le code (insensible à la casse)
    if (code.trim().toLowerCase() !== course.access_code.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: 'Code incorrect. Vérifiez le code reçu par WhatsApp.'
      });
    }

    // Inscrire l'utilisateur
    const enrollId = uuidv4();
    await client.query(
      'INSERT INTO enrollments (id, user_id, course_id) VALUES ($1, $2, $3)',
      [enrollId, req.user.id, courseId]
    );

    res.json({
      success: true,
      message: `Accès accordé à "${course.title}" ! Bienvenue dans la formation.`,
      courseId
    });
  } catch (err) {
    console.error('Verify code error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// POST /api/auth/progress
// Marquer une leçon comme complétée
// ══════════════════════════════════
router.post('/progress', authenticateToken, [
  body('courseId').trim().notEmpty().withMessage('courseId requis.'),
  body('lessonKey').trim().notEmpty().withMessage('lessonKey requis.')
], async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return;

  const client = await pool.connect();
  try {
    const { courseId, lessonKey } = req.body;

    // Vérifier que l'utilisateur est inscrit
    const enrolledResult = await client.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );
    
    if (enrolledResult.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: "Vous n'êtes pas inscrit à cette formation." 
      });
    }

    // Insérer la progression (ignore si déjà fait)
    const progressId = uuidv4();
    await client.query(
      `INSERT INTO lesson_progress (id, user_id, course_id, lesson_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, course_id, lesson_key) DO NOTHING`,
      [progressId, req.user.id, courseId, lessonKey]
    );

    res.json({ success: true, message: 'Progression enregistrée.' });
  } catch (err) {
    console.error('Progress error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

module.exports = router;
