// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — routes/auth.js
// Routes : inscription, connexion, profil, vérification code
// ═══════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// ─── Helper : générer JWT ───
function generateToken(userId, jti) {
  return jwt.sign(
    { userId, jti },
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

  try {
    const { fullname, email, password, phone = '' } = req.body;
    const db = getDB();

    // Vérifier si email déjà utilisé
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
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
    db.prepare(`
      INSERT INTO users (id, fullname, email, password, phone)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, fullname.trim(), email.toLowerCase(), hashedPassword, phone.trim());

    // Générer le token JWT
    const token = generateToken(userId, jti);

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès !',
      token,
      user: {
        id: userId,
        fullname: fullname.trim(),
        email: email.toLowerCase(),
        phone: phone.trim()
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur. Veuillez réessayer.' });
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

  try {
    const { email, password } = req.body;
    const db = getDB();

    // Chercher l'utilisateur
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      // Délai fixe pour éviter les attaques par timing
      await bcrypt.compare(password, '$2a$12$invalidhashforstalling00000000000000000000000000000000');
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.'
      });
    }

    // Vérifier le mot de passe
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.'
      });
    }

    const jti = uuidv4();
    const token = generateToken(user.id, jti);

    // Récupérer les formations inscrites
    const enrollments = db.prepare(
      'SELECT course_id FROM enrollments WHERE user_id = ?'
    ).all(user.id).map(e => e.course_id);

    res.json({
      success: true,
      message: 'Connexion réussie !',
      token,
      user: {
        id: user.id,
        fullname: user.fullname,
        email: user.email,
        phone: user.phone,
        enrollments
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur. Veuillez réessayer.' });
  }
});

// ══════════════════════════════════
// POST /api/auth/logout
// ══════════════════════════════════
router.post('/logout', authenticateToken, (req, res) => {
  try {
    const db = getDB();
    // Révoquer le token
    db.prepare('INSERT OR IGNORE INTO revoked_tokens (jti) VALUES (?)').run(req.tokenJti);
    // Nettoyer les vieux tokens révoqués (> 8 jours)
    db.prepare("DELETE FROM revoked_tokens WHERE revoked_at < datetime('now', '-8 days')").run();
    res.json({ success: true, message: 'Déconnecté avec succès.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════
// GET /api/auth/me
// ══════════════════════════════════
router.get('/me', authenticateToken, (req, res) => {
  try {
    const db = getDB();
    const user = db.prepare('SELECT id, fullname, email, phone, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });

    const enrollments = db.prepare(
      'SELECT course_id FROM enrollments WHERE user_id = ?'
    ).all(user.id).map(e => e.course_id);

    // Progression
    const progress = db.prepare(
      'SELECT course_id, lesson_key FROM lesson_progress WHERE user_id = ?'
    ).all(user.id);

    const progressMap = {};
    progress.forEach(p => {
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

  try {
    const { fullname, phone } = req.body;
    const db = getDB();
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    db.prepare(`
      UPDATE users SET fullname = ?, phone = ?, updated_at = datetime('now') WHERE id = ?
    `).run(
      fullname ? fullname.trim() : current.fullname,
      phone !== undefined ? phone.trim() : current.phone,
      req.user.id
    );

    res.json({ success: true, message: 'Profil mis à jour.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
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

  try {
    const { currentPassword, newPassword } = req.body;
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) return res.status(401).json({ success: false, message: 'Mot de passe actuel incorrect.' });
    const hashed = await bcrypt.hash(newPassword, 12);
    db.prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?").run(hashed, req.user.id);
    res.json({ success: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════
// DELETE /api/auth/account
// ══════════════════════════════════
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.json({ success: true, message: 'Compte supprimé avec succès.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════
// POST /api/auth/verify-code
// Vérifier le code d'une formation
// ══════════════════════════════════
router.post('/verify-code', authenticateToken, [
  body('courseId').trim().notEmpty().withMessage('ID de formation requis.'),
  body('code').trim().notEmpty().withMessage('Code d\'accès requis.')
], (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return;

  try {
    const { courseId, code } = req.body;
    const db = getDB();

    // Vérifier que la formation existe
    const course = db.prepare('SELECT id, access_code, title FROM courses WHERE id = ? AND is_active = 1').get(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Formation introuvable.' });
    }

    // Vérifier si déjà inscrit
    const existing = db.prepare(
      'SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?'
    ).get(req.user.id, courseId);
    if (existing) {
      return res.json({ success: true, message: 'Vous avez déjà accès à cette formation.', alreadyEnrolled: true });
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
    db.prepare(
      'INSERT INTO enrollments (id, user_id, course_id) VALUES (?, ?, ?)'
    ).run(enrollId, req.user.id, courseId);

    res.json({
      success: true,
      message: `Accès accordé à "${course.title}" ! Bienvenue dans la formation.`,
      courseId
    });
  } catch (err) {
    console.error('Verify code error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════
// POST /api/auth/progress
// Marquer une leçon comme complétée
// ══════════════════════════════════
router.post('/progress', authenticateToken, [
  body('courseId').trim().notEmpty().withMessage('courseId requis.'),
  body('lessonKey').trim().notEmpty().withMessage('lessonKey requis.')
], (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return;

  try {
    const { courseId, lessonKey } = req.body;
    const db = getDB();

    // Vérifier que l'utilisateur est inscrit
    const enrolled = db.prepare(
      'SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?'
    ).get(req.user.id, courseId);
    if (!enrolled) {
      return res.status(403).json({ success: false, message: 'Vous n\'êtes pas inscrit à cette formation.' });
    }

    // Insérer la progression (ignore si déjà fait)
    db.prepare(`
      INSERT OR IGNORE INTO lesson_progress (id, user_id, course_id, lesson_key)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), req.user.id, courseId, lessonKey);

    res.json({ success: true, message: 'Progression enregistrée.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

module.exports = router;
