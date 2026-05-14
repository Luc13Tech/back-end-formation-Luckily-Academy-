// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — routes/auth.js (PostgreSQL)
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

function generateToken(userId, jti) {
  return jwt.sign({ userId, jti }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }
  return null;
}

// ── POST /api/auth/register ──
router.post('/register', [
  body('fullname').trim().isLength({ min: 2, max: 100 }).withMessage('Nom invalide (2-100 caractères).'),
  body('email').trim().isEmail().normalizeEmail().withMessage('Email invalide.'),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe minimum 6 caractères.'),
  body('phone').optional().trim().isLength({ max: 20 })
], async (req, res) => {
  if (validationErrors(req, res)) return;
  try {
    const { fullname, email, password, phone = '' } = req.body;
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Cet email est déjà utilisé.' });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const jti = uuidv4();
    await pool.query(
      'INSERT INTO users (id, fullname, email, password, phone) VALUES ($1, $2, $3, $4, $5)',
      [userId, fullname.trim(), email.toLowerCase(), hashedPassword, phone.trim()]
    );
    const token = generateToken(userId, jti);
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès !',
      token,
      user: { id: userId, fullname: fullname.trim(), email: email.toLowerCase(), phone: phone.trim(), enrollments: [] }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── POST /api/auth/login ──
router.post('/login', [
  body('email').trim().isEmail().normalizeEmail().withMessage('Email invalide.'),
  body('password').notEmpty().withMessage('Mot de passe requis.')
], async (req, res) => {
  if (validationErrors(req, res)) return;
  try {
    const { email, password } = req.body;
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = userRes.rows[0];
    if (!user) {
      await bcrypt.compare(password, '$2a$12$invalidhashforstalling00000000000000000000000000000000');
      return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect.' });
    }
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect.' });
    }
    const jti = uuidv4();
    const token = generateToken(user.id, jti);

    // Récupérer les formations inscrites
    const enrollRes = await pool.query('SELECT course_id FROM enrollments WHERE user_id = $1', [user.id]);
    const enrollments = enrollRes.rows.map(e => e.course_id);

    res.json({
      success: true,
      message: 'Connexion réussie !',
      token,
      user: { id: user.id, fullname: user.fullname, email: user.email, phone: user.phone, enrollments }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── POST /api/auth/logout ──
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await pool.query('INSERT INTO revoked_tokens (jti) VALUES ($1) ON CONFLICT (jti) DO NOTHING', [req.tokenJti]);
    await pool.query("DELETE FROM revoked_tokens WHERE revoked_at < NOW() - INTERVAL '8 days'");
    res.json({ success: true, message: 'Déconnecté avec succès.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── GET /api/auth/me ──
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userRes = await pool.query(
      'SELECT id, fullname, email, phone, role, created_at FROM users WHERE id = $1', [req.user.id]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });

    const enrollRes = await pool.query('SELECT course_id FROM enrollments WHERE user_id = $1', [user.id]);
    const enrollments = enrollRes.rows.map(e => e.course_id);

    const progressRes = await pool.query(
      'SELECT course_id, lesson_key FROM lesson_progress WHERE user_id = $1', [user.id]
    );
    const progressMap = {};
    progressRes.rows.forEach(p => {
      if (!progressMap[p.course_id]) progressMap[p.course_id] = [];
      progressMap[p.course_id].push(p.lesson_key);
    });

    res.json({ success: true, user: { ...user, enrollments, progress: progressMap } });
  } catch (err) {
    console.error('Me error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── PUT /api/auth/profile ──
router.put('/profile', authenticateToken, [
  body('fullname').optional().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional().trim().isLength({ max: 20 })
], async (req, res) => {
  if (validationErrors(req, res)) return;
  try {
    const { fullname, phone } = req.body;
    const cur = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = cur.rows[0];
    await pool.query(
      'UPDATE users SET fullname = $1, phone = $2, updated_at = NOW() WHERE id = $3',
      [fullname ? fullname.trim() : user.fullname, phone !== undefined ? phone.trim() : user.phone, req.user.id]
    );
    res.json({ success: true, message: 'Profil mis à jour.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── PUT /api/auth/change-password ──
router.put('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis.'),
  body('newPassword').isLength({ min: 6 }).withMessage('Nouveau mot de passe : minimum 6 caractères.')
], async (req, res) => {
  if (validationErrors(req, res)) return;
  try {
    const { currentPassword, newPassword } = req.body;
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) return res.status(401).json({ success: false, message: 'Mot de passe actuel incorrect.' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, req.user.id]);
    res.json({ success: true, message: 'Mot de passe mis à jour.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── DELETE /api/auth/account ──
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Compte supprimé.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── POST /api/auth/verify-code ──
router.post('/verify-code', authenticateToken, [
  body('courseId').trim().notEmpty().withMessage('courseId requis.'),
  body('code').trim().notEmpty().withMessage('Code requis.')
], async (req, res) => {
  if (validationErrors(req, res)) return;
  try {
    const { courseId, code } = req.body;
    const courseRes = await pool.query(
      'SELECT id, access_code, title FROM courses WHERE id = $1 AND is_active = TRUE', [courseId]
    );
    const course = courseRes.rows[0];
    if (!course) return res.status(404).json({ success: false, message: 'Formation introuvable.' });

    // Vérifier si déjà inscrit
    const existRes = await pool.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2', [req.user.id, courseId]
    );
    if (existRes.rows.length > 0) {
      return res.json({ success: true, message: 'Vous avez déjà accès à cette formation.', alreadyEnrolled: true });
    }

    if (code.trim().toLowerCase() !== course.access_code.toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Code incorrect. Vérifiez le code reçu par WhatsApp.' });
    }

    const enrollId = uuidv4();
    await pool.query(
      'INSERT INTO enrollments (id, user_id, course_id) VALUES ($1, $2, $3)',
      [enrollId, req.user.id, courseId]
    );
    res.json({ success: true, message: `Accès accordé à "${course.title}" !`, courseId });
  } catch (err) {
    console.error('Verify code error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── POST /api/auth/progress ──
router.post('/progress', authenticateToken, [
  body('courseId').trim().notEmpty(),
  body('lessonKey').trim().notEmpty()
], async (req, res) => {
  if (validationErrors(req, res)) return;
  try {
    const { courseId, lessonKey } = req.body;
    const enrolled = await pool.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2', [req.user.id, courseId]
    );
    if (!enrolled.rows.length) {
      return res.status(403).json({ success: false, message: 'Non inscrit à cette formation.' });
    }
    await pool.query(
      'INSERT INTO lesson_progress (id, user_id, course_id, lesson_key) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, course_id, lesson_key) DO NOTHING',
      [uuidv4(), req.user.id, courseId, lessonKey]
    );
    res.json({ success: true, message: 'Progression enregistrée.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

module.exports = router;
