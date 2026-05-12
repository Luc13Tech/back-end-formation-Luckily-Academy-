// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — routes/claude.js
// Route IA Claude avec contexte cours (PostgreSQL)
// ═══════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { pool } = require('../database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// Helper fetch avec retry
async function fetchWithRetry(url, options, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ══════════════════════════════════
// POST /api/claude
// Question IA avec contexte cours
// ══════════════════════════════════
router.post('/', optionalAuth, [
  body('message')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Le message doit contenir entre 1 et 2000 caractères.'),
  body('courseId')
    .optional()
    .trim()
    .isLength({ max: 60 }),
  body('lessonId')
    .optional()
    .trim()
    .isLength({ max: 60 }),
  body('history')
    .optional()
    .isArray({ max: 20 })
    .withMessage('Historique invalide.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  const client = await pool.connect();
  try {
    const { message, courseId, lessonId, history = [], lang = 'fr' } = req.body;

    // ── Construction du contexte ──
    let courseContext = '';
    let lessonContext = '';

    if (courseId) {
      // Récupérer la formation
      const courseResult = await client.query(
        'SELECT title, description, category, level FROM courses WHERE id = $1',
        [courseId]
      );
      
      if (courseResult.rows.length > 0) {
        const course = courseResult.rows[0];
        courseContext = `Formation concernée : "${course.title}" (${course.category}, ${course.level})\nDescription : ${course.description}\n`;

        // Si une leçon est spécifiée et que l'utilisateur est inscrit
        if (lessonId && req.user) {
          const enrolledResult = await client.query(
            'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
            [req.user.id, courseId]
          );

          if (enrolledResult.rows.length > 0) {
            const courseDataResult = await client.query(
              'SELECT content FROM courses WHERE id = $1',
              [courseId]
            );
            
            if (courseDataResult.rows.length > 0 && courseDataResult.rows[0].content) {
              const content = JSON.parse(courseDataResult.rows[0].content);
              if (content.chapters) {
                for (const ch of content.chapters) {
                  if (ch.lessons) {
                    const lesson = ch.lessons.find(l => l.id === lessonId);
                    if (lesson) {
                      // Limiter le contenu à 2000 chars pour le contexte
                      const contentPreview = (lesson.content || '').substring(0, 2000);
                      lessonContext = `\nLeçon en cours : "${lesson.title}" (Chapitre : ${ch.title})\nContenu de la leçon :\n${contentPreview}${lesson.content?.length > 2000 ? '...' : ''}\n`;
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // ── Prompt syst-ème ──
    const langLabel = { fr: 'Français', en: 'English', es: 'Español', pt: 'Português' }[lang] || 'Français';

    const systemPrompt = `Tu es Luckily IA, l'assistant officiel de Luckily Academy — plateforme de formation en ligne fondée par Luc DEGUENON, Spécialiste en Technologie Moderne, basée à Cotonou, Bénin.

INFORMATIONS SUR LA PLATEFORME :
• Site : Luckily Academy
• Fondateur : Luc DEGUENON
• WhatsApp : +229 01 59 60 95 81
• Email : cultech49@gmail.com
• Localisation : Cotonou, Bénin, Afrique de l'Ouest

FORMATIONS ET PRIX :
• Web Marketing → 10 000 FCFA (8 semaines)
• Négociation Commerciale → 10 000 FCFA (6 semaines)
• Chargé Clientèle → 10 000 FCFA (6 semaines)
• Développement Web Frontend → 20 000 FCFA (12 semaines)
• Développement Web Backend → 25 000 FCFA (14 semaines)
• Analyse des Données → 15 000 FCFA (10 semaines)
• Microsoft Word Débutant → 5 000 FCFA
• Microsoft Word Intermédiaire → 5 000 FCFA
• Microsoft Word Avancé → 5 000 FCFA
• Microsoft Excel Débutant → 5 000 FCFA
• Microsoft Excel Intermédiaire → 5 000 FCFA
• Microsoft Excel Avancé → 5 000 FCFA
• Outils Bureautique & Compatibilité → 5 000 FCFA

PROCESSUS D'INSCRIPTION :
1. L'utilisateur choisit une formation
2. Paiement via WhatsApp (+229 01 59 60 95 81) : MTN MoMo, Moov Money, Wave, Carte bancaire
3. Après confirmation, un code d'accès unique est envoyé par WhatsApp
4. L'utilisateur entre le code sur la plateforme pour accéder à la formation

${courseContext}${lessonContext}

TON RÔLE :
- Répondre de façon dynamique, utile et personnalisée
- Expliquer les concepts du cours en cours si disponible
- Recommander des formations selon le profil de l'utilisateur
- Donner des exemples concrets adaptés au contexte africain
- Aider avec les questions sur la plateforme
- Donner des conseils de carrière et de développement professionnel
- Répondre aux questions générales sur les technologies, le business, etc.
- Générer des quiz et exercices pratiques si demandé

RÈGLES :
- Réponds toujours en ${langLabel}
- Sois bienveillant, professionnel et encourageant
- Si quelqu'un demande de l'aide technique sur la plateforme, redirige vers WhatsApp si tu ne peux pas résoudre
- Format tes réponses clairement (listes, étapes numérotées si approprié)
- Garde tes réponses concises mais complètes (max 400 mots sauf si explicitement demandé plus long)`;

    // ── Construire les messages ──
    const messages = [];

    // Historique (max 10 derniers échanges)
    const recentHistory = history.slice(-10);
    for (const h of recentHistory) {
      if (h.role && h.content && typeof h.content === 'string') {
        messages.push({ role: h.role, content: h.content.substring(0, 1000) });
      }
    }

    // Message actuel
    messages.push({ role: 'user', content: message });

    // ── Appel à l'API Claude ──
    const apiRes = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages
      })
    });

    if (!apiRes.ok) {
      const errData = await apiRes.json().catch(() => ({}));
      console.error('Claude API error:', apiRes.status, errData);

      if (apiRes.status === 401) {
        return res.status(500).json({ success: false, message: 'Erreur de configuration IA. Contactez l\'administrateur.' });
      }
      if (apiRes.status === 429) {
        return res.status(429).json({ success: false, message: 'Trop de requêtes. Attendez un moment avant de réessayer.' });
      }
      return res.status(500).json({ success: false, message: 'Service IA temporairement indisponible.' });
    }

    const data = await apiRes.json();
    const reply = data.content?.[0]?.text;

    if (!reply) {
      return res.status(500).json({ success: false, message: 'Réponse vide de l\'IA.' });
    }

    res.json({
      success: true,
      reply,
      tokens: data.usage?.output_tokens || 0
    });

  } catch (err) {
    console.error('Claude route error:', err);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la communication avec l\'IA. Veuillez réessayer.'
    });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// POST /api/claude/lesson-help
// Aide rapide sur une leçon
// ══════════════════════════════════
router.post('/lesson-help', authenticateToken, [
  body('courseId').trim().notEmpty(),
  body('lessonId').trim().notEmpty(),
  body('type').isIn(['explain', 'example', 'quiz', 'summary']).withMessage('Type invalide.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  const client = await pool.connect();
  try {
    const { courseId, lessonId, type } = req.body;

    // Vérifier enrollment
    const enrolledResult = await client.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );
    
    if (enrolledResult.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Non inscrit à cette formation.' });
    }

    // Récupérer le contenu de la leçon
    const courseResult = await client.query(
      'SELECT title, content FROM courses WHERE id = $1',
      [courseId]
    );
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formation introuvable.' });
    }

    const courseData = courseResult.rows[0];
    let lesson = null;
    const content = JSON.parse(courseData.content || '{}');
    
    if (content.chapters) {
      for (const ch of content.chapters) {
        if (ch.lessons) {
          const l = ch.lessons.find(l => l.id === lessonId);
          if (l) { lesson = l; break; }
        }
      }
    }

    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Leçon introuvable.' });
    }

    const prompts = {
      explain: `Explique en détail le concept principal de cette leçon intitulée "${lesson.title}" avec des exemples concrets adaptés au contexte africain. Voici le contenu :\n\n${lesson.content?.substring(0, 1500)}`,
      example: `Donne-moi 2 exemples pratiques et concrets pour illustrer "${lesson.title}". Les exemples doivent être pertinents pour le marché béninois/africain. Voici le contexte :\n\n${lesson.content?.substring(0, 1000)}`,
      quiz: `Génère un quiz de 3 questions (QCM) sur la leçon "${lesson.title}" avec les réponses correctes expliquées. Voici le contenu :\n\n${lesson.content?.substring(0, 1000)}`,
      summary: `Résume la leçon "${lesson.title}" en 5 points clés essentiels à retenir, numérotés et clairs. Voici le contenu :\n\n${lesson.content?.substring(0, 1500)}`
    };

    const fetch = (await import('node-fetch')).default;
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `Tu es Luckily IA, assistant pédagogique de Luckily Academy. Tu aides les apprenants à comprendre les leçons de la formation "${courseData.title}". Réponds en Français, de façon claire et pédagogique.`,
        messages: [{ role: 'user', content: prompts[type] }]
      })
    });

    const data = await apiRes.json();
    const reply = data.content?.[0]?.text;

    if (!reply) {
      return res.status(500).json({ success: false, message: 'Réponse vide.' });
    }

    res.json({ success: true, reply, type });
  } catch (err) {
    console.error('Lesson help error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

module.exports = router;
