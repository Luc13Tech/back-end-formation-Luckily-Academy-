// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — routes/courses.js (PostgreSQL)
// ═══════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { pool } = require('../database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// ── GET /api/courses ── Liste publique
router.get('/', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, category, level, duration, price, description, summary, icon, image_url
      FROM courses WHERE is_active = TRUE
      ORDER BY price DESC, title ASC
    `);

    const courses = await Promise.all(result.rows.map(async (c) => {
      let enrolled = false;
      if (req.user) {
        const e = await pool.query(
          'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
          [req.user.id, c.id]
        );
        enrolled = e.rows.length > 0;
      }
      let summary = [];
      try { summary = JSON.parse(c.summary || '[]'); } catch {}
      return { ...c, summary, enrolled };
    }));

    res.json({ success: true, courses });
  } catch (err) {
    console.error('Courses list error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── GET /api/courses/:id ── Détail
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM courses WHERE id = $1 AND is_active = TRUE', [req.params.id]);
    const course = result.rows[0];
    if (!course) return res.status(404).json({ success: false, message: 'Formation introuvable.' });

    let enrolled = false;
    let progress = [];

    if (req.user) {
      const e = await pool.query(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, course.id]
      );
      enrolled = e.rows.length > 0;

      if (enrolled) {
        const p = await pool.query(
          'SELECT lesson_key FROM lesson_progress WHERE user_id = $1 AND course_id = $2',
          [req.user.id, course.id]
        );
        progress = p.rows.map(r => r.lesson_key);
      }
    }

    let content = null;
    let summary = [];
    let totalLessons = 0;

    try {
      summary = JSON.parse(course.summary || '[]');
      const fullContent = JSON.parse(course.content || '{}');

      if (enrolled) {
        content = fullContent;
      } else {
        // Preview sans contenu texte
        if (fullContent.chapters) {
          content = {
            chapters: fullContent.chapters.map(ch => ({
              id: ch.id,
              title: ch.title,
              lessons: ch.lessons?.map(l => ({
                id: l.id,
                title: l.title,
                image: l.image,
                locked: true
              })) || []
            }))
          };
        }
      }

      if (content?.chapters) {
        content.chapters.forEach(ch => { totalLessons += ch.lessons?.length || 0; });
      }
    } catch (e) {
      console.error('Content parse error:', e.message);
    }

    const hasPdf = !!(course.pdf_url && course.pdf_url.trim());

    res.json({
      success: true,
      course: {
        id: course.id, title: course.title, category: course.category,
        level: course.level, duration: course.duration, price: course.price,
        description: course.description, summary, icon: course.icon,
        image_url: course.image_url, content, totalLessons, hasPdf,
        enrolled, progress
      }
    });
  } catch (err) {
    console.error('Course detail error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── GET /api/courses/:id/lesson/:lessonId ── Leçon
router.get('/:id/lesson/:lessonId', authenticateToken, async (req, res) => {
  try {
    const enrolled = await pool.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, req.params.id]
    );
    if (!enrolled.rows.length) {
      return res.status(403).json({ success: false, message: 'Non inscrit à cette formation.' });
    }

    const courseRes = await pool.query('SELECT content FROM courses WHERE id = $1', [req.params.id]);
    if (!courseRes.rows[0]) return res.status(404).json({ success: false, message: 'Formation introuvable.' });

    const content = JSON.parse(courseRes.rows[0].content || '{}');
    let lessonFound = null;

    if (content.chapters) {
      for (const ch of content.chapters) {
        const l = ch.lessons?.find(l => l.id === req.params.lessonId);
        if (l) { lessonFound = { ...l, chapterTitle: ch.title }; break; }
      }
    }

    if (!lessonFound) return res.status(404).json({ success: false, message: 'Leçon introuvable.' });
    res.json({ success: true, lesson: lessonFound });
  } catch (err) {
    console.error('Lesson error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── GET /api/courses/:id/pdf ── PDF
router.get('/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const enrolled = await pool.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, req.params.id]
    );
    if (!enrolled.rows.length) {
      return res.status(403).json({ success: false, message: 'Vous devez être inscrit pour télécharger le PDF.' });
    }

    const courseRes = await pool.query('SELECT title, pdf_url FROM courses WHERE id = $1', [req.params.id]);
    const course = courseRes.rows[0];
    if (!course) return res.status(404).json({ success: false, message: 'Formation introuvable.' });

    if (course.pdf_url && course.pdf_url.startsWith('http')) {
      return res.json({ success: true, pdfUrl: course.pdf_url, title: course.title });
    }

    if (course.pdf_url) {
      const pdfPath = path.join(__dirname, '..', 'uploads', 'pdfs', course.pdf_url);
      if (fs.existsSync(pdfPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${course.title.replace(/[^a-zA-Z0-9]/g,'_')}.pdf"`);
        return fs.createReadStream(pdfPath).pipe(res);
      }
    }

    res.status(404).json({
      success: false,
      message: 'PDF en cours de préparation. Contactez-nous via WhatsApp.',
      whatsapp: '+229 01 59 60 95 81'
    });
  } catch (err) {
    console.error('PDF error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

module.exports = router;
