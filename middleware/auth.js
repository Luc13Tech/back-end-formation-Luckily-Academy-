// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — middleware/auth.js
// Vérification JWT pour routes protégées (PostgreSQL)
// ═══════════════════════════════════════════════════════════
'use strict';

const jwt = require('jsonwebtoken');
const { pool } = require('../database');

// ─── Middleware principal — vérifie le token ───
async function authenticateToken(req, res, next) {
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

    const client = await pool.connect();
    try {
      // Vérifier si le token est révoqué (logout)
      const revokedResult = await client.query(
        'SELECT jti FROM revoked_tokens WHERE jti = $1',
        [decoded.jti]
      );
      
      if (revokedResult.rows.length > 0) {
        return res.status(401).json({
          success: false,
          message: 'Session expirée. Veuillez vous reconnecter.'
        });
      }

      // Vérifier que l'utilisateur existe encore
      const userResult = await client.query(
        'SELECT id, email, fullname, role FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur introuvable.'
        });
      }

      req.user = userResult.rows[0];
      req.tokenJti = decoded.jti;
      next();
    } finally {
      client.release();
    }
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
async function optionalAuth(req, res, next) {
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
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        'SELECT id, email, fullname, role FROM users WHERE id = $1',
        [decoded.userId]
      );
      req.user = userResult.rows.length > 0 ? userResult.rows[0] : null;
    } finally {
      client.release();
    }
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
