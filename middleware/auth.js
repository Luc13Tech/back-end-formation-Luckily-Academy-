// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — middleware/auth.js
// Vérification JWT pour routes protégées
// ═══════════════════════════════════════════════════════════
'use strict';

const jwt = require('jsonwebtoken');
const { getDB } = require('../database');

// ─── Middleware principal — vérifie le token ───
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Accès non autorisé. Veuillez vous connecter.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Vérifier si le token est révoqué (logout)
    const db = getDB();
    const revoked = db.prepare('SELECT jti FROM revoked_tokens WHERE jti = ?').get(decoded.jti);
    if (revoked) {
      return res.status(401).json({
        success: false,
        message: 'Session expirée. Veuillez vous reconnecter.'
      });
    }

    // Vérifier que l'utilisateur existe encore
    const user = db.prepare('SELECT id, email, fullname, role FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur introuvable.'
      });
    }

    req.user = user;
    req.tokenJti = decoded.jti;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expirée. Veuillez vous reconnecter.'
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Token invalide.'
    });
  }
}

// ─── Middleware optionnel — ne bloque pas si pas de token ───
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = getDB();
    const user = db.prepare('SELECT id, email, fullname, role FROM users WHERE id = ?').get(decoded.userId);
    req.user = user || null;
  } catch {
    req.user = null;
  }
  next();
}

// ─── Middleware admin ───
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux administrateurs.'
    });
  }
  next();
}

module.exports = { authenticateToken, optionalAuth, requireAdmin };
