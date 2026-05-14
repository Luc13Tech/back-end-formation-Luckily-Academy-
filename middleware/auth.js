// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — middleware/auth.js (PostgreSQL)
// ═══════════════════════════════════════════════════════════
'use strict';

const jwt = require('jsonwebtoken');
const { pool } = require('../database');

// ─── Middleware principal ───
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Accès non autorisé. Veuillez vous connecter.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Vérifier si token révoqué
    const revoked = await pool.query('SELECT jti FROM revoked_tokens WHERE jti = $1', [decoded.jti]);
    if (revoked.rows.length > 0) {
      return res.status(401).json({ success: false, message: 'Session expirée. Veuillez vous reconnecter.' });
    }

    // Vérifier que l'utilisateur existe
    const userRes = await pool.query(
      'SELECT id, email, fullname, role FROM users WHERE id = $1', [decoded.userId]
    );
    if (!userRes.rows[0]) {
      return res.status(401).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    req.user = userRes.rows[0];
    req.tokenJti = decoded.jti;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expirée. Veuillez vous reconnecter.' });
    }
    return res.status(403).json({ success: false, message: 'Token invalide.' });
  }
}

// ─── Middleware optionnel ───
async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7) : null;

  if (!token) { req.user = null; return next(); }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRes = await pool.query(
      'SELECT id, email, fullname, role FROM users WHERE id = $1', [decoded.userId]
    );
    req.user = userRes.rows[0] || null;
  } catch {
    req.user = null;
  }
  next();
}

// ─── Admin ───
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Accès réservé aux administrateurs.' });
  }
  next();
}

module.exports = { authenticateToken, optionalAuth, requireAdmin };
