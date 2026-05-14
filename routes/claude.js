// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — routes/claude.js (PostgreSQL)
// ═══════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { pool } = require('../database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

async function callClaude(system, messages, maxTokens = 800) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API ${res.status}: ${err.error?.message || 'Unknown error'}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ── POST /api/claude ── Chat général avec contexte cours
router.post('/', optionalAuth, [
  body('message').trim().isLength({ min: 1, max: 2000 }).withMessage('Message invalide.'),
  body('courseId').optional().trim(),
  body('lessonId').optional().trim(),
  body('history').optional().isArray({ max: 20 }),
  body('lang').optional().isIn(['fr','en','es','pt'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { message, courseId, lessonId, history = [], lang = 'fr' } = req.body;
    const langLabel = { fr:'Français', en:'English', es:'Español', pt:'Português' }[lang] || 'Français';

    // Construire le contexte du cours
    let courseContext = '';
    let lessonContext = '';

    if (courseId) {
      const courseRes = await pool.query(
        'SELECT title, description, category, level FROM courses WHERE id = $1', [courseId]
      );
      const course = courseRes.rows[0];
      if (course) {
        courseContext = `Formation : "${course.title}" (${course.category}, ${course.level})\nDescription : ${course.description}\n`;

        if (lessonId && req.user) {
          const enrollRes = await pool.query(
            'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2', [req.user.id, courseId]
          );
          if (enrollRes.rows.length > 0) {
            const courseDataRes = await pool.query('SELECT content FROM courses WHERE id = $1', [courseId]);
            if (courseDataRes.rows[0]?.content) {
              const content = JSON.parse(courseDataRes.rows[0].content);
              if (content.chapters) {
                for (const ch of content.chapters) {
                  const lesson = ch.lessons?.find(l => l.id === lessonId);
                  if (lesson) {
                    const preview = (lesson.content || '').substring(0, 2000);
                    lessonContext = `\nLeçon : "${lesson.title}" (Chapitre : ${ch.title})\nContenu :\n${preview}${lesson.content?.length > 2000 ? '...' : ''}\n`;
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }

    const systemPrompt = `Tu es Luckily IA, l'assistant officiel de Luckily Academy — plateforme de formation en ligne fondée par Luc DEGUENON, Spécialiste en Technologie Moderne, basée à Cotonou, Bénin.

FORMATIONS ET PRIX :
• Web Marketing → 10 000 FCFA (8 semaines)
• Négociation Commerciale → 10 000 FCFA (6 semaines)
• Chargé Clientèle → 10 000 FCFA (6 semaines)
• Développement Web Frontend → 20 000 FCFA (12 semaines)
• Développement Web Backend → 25 000 FCFA (14 semaines)
• Analyse des Données → 15 000 FCFA (10 semaines)
• Word Débutant/Intermédiaire/Avancé → 5 000 FCFA chacun
• Excel Débutant/Intermédiaire/Avancé → 5 000 FCFA chacun
• Outils Bureautique → 5 000 FCFA

CONTACT : WhatsApp +229 01 59 60 95 81 | cultech49@gmail.com
PAIEMENT : MTN MoMo, Moov Money, Wave, Carte bancaire via WhatsApp
ACCÈS : Code unique envoyé par WhatsApp après paiement confirmé

${courseContext}${lessonContext}

Réponds de façon dynamique, utile et personnalisée en ${langLabel}. Sois pédagogue, bienveillant et encourageant.`;

    // Construire les messages
    const apiMessages = [];
    for (const h of history.slice(-10)) {
      if (h.role && h.content && typeof h.content === 'string') {
        apiMessages.push({ role: h.role, content: h.content.substring(0, 1000) });
      }
    }
    apiMessages.push({ role: 'user', content: message });

    const reply = await callClaude(systemPrompt, apiMessages, 1000);

    res.json({ success: true, reply });
  } catch (err) {
    console.error('Claude route error:', err.message);
    if (err.message.includes('401')) {
      return res.status(500).json({ success: false, message: 'Erreur de configuration IA.' });
    }
    if (err.message.includes('429')) {
      return res.status(429).json({ success: false, message: 'Quota IA atteint. Réessayez dans un instant.' });
    }
    res.status(500).json({ success: false, message: 'Service IA temporairement indisponible.' });
  }
});

// ── POST /api/claude/lesson-help ── Aide rapide sur une leçon
router.post('/lesson-help', authenticateToken, [
  body('courseId').trim().notEmpty(),
  body('lessonId').trim().notEmpty(),
  body('type').isIn(['explain','example','quiz','summary'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { courseId, lessonId, type } = req.body;

    const enrolled = await pool.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );
    if (!enrolled.rows.length) {
      return res.status(403).json({ success: false, message: 'Non inscrit à cette formation.' });
    }

    const courseRes = await pool.query('SELECT title, content FROM courses WHERE id = $1', [courseId]);
    const courseData = courseRes.rows[0];
    if (!courseData) return res.status(404).json({ success: false, message: 'Formation introuvable.' });

    let lesson = null;
    const content = JSON.parse(courseData.content || '{}');
    if (content.chapters) {
      for (const ch of content.chapters) {
        const l = ch.lessons?.find(l => l.id === lessonId);
        if (l) { lesson = l; break; }
      }
    }
    if (!lesson) return res.status(404).json({ success: false, message: 'Leçon introuvable.' });

    const lessonPreview = (lesson.content || '').substring(0, 1500);
    const prompts = {
      explain: `Explique en détail le concept principal de la leçon "${lesson.title}" avec des exemples concrets adaptés au contexte africain/béninois.\n\nContenu :\n${lessonPreview}`,
      example: `Donne 2 exemples pratiques et concrets pour illustrer "${lesson.title}", adaptés au marché béninois/africain.\n\nContexte :\n${lessonPreview}`,
      quiz:    `Génère un quiz de 3 questions (QCM) sur la leçon "${lesson.title}" avec les réponses correctes expliquées.\n\nContenu :\n${lessonPreview}`,
      summary: `Résume la leçon "${lesson.title}" en 5 points clés essentiels numérotés et clairs.\n\nContenu :\n${lessonPreview}`
    };

    const system = `Tu es Luckily IA, assistant pédagogique de Luckily Academy pour la formation "${courseData.title}". Réponds en Français, de façon claire, pédagogique et adaptée au contexte africain.`;

    const reply = await callClaude(system, [{ role: 'user', content: prompts[type] }], 800);

    res.json({ success: true, reply, type });
  } catch (err) {
    console.error('Lesson help error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

module.exports = router;
