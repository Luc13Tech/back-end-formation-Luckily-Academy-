// ═══════════════════════════════════════════════════════════
// LUCKILY ACADEMY — routes/courses.js
// Routes formations : liste, détail, PDF (PostgreSQL)
// ═══════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { pool } = require('../database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// ══════════════════════════════════
// GET /api/courses
// Liste publique des formations
// ══════════════════════════════════
router.get('/', optionalAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT id, title, category, level, duration, price, description, summary, icon, image_url
      FROM courses WHERE is_active = 1
      ORDER BY price DESC, title ASC
    `);

    const courses = result.rows;

    // Si connecté, ajouter info d'enrollment
    const coursesWithEnrollment = [];
    for (const c of courses) {
      let enrolled = false;
      if (req.user) {
        const enrollResult = await client.query(
          'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
          [req.user.id, c.id]
        );
        enrolled = enrollResult.rows.length > 0;
      }
      
      coursesWithEnrollment.push({
        ...c,
        summary: JSON.parse(c.summary || '[]'),
        enrolled
      });
    }

    res.json({ success: true, courses: coursesWithEnrollment });
  } catch (err) {
    console.error('Courses list error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// GET /api/courses/:id
// Détail d'une formation
// (contenu complet si inscrit)
// ══════════════════════════════════
router.get('/:id', optionalAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const courseResult = await client.query(
      `SELECT * FROM courses WHERE id = $1 AND is_active = 1`,
      [req.params.id]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formation introuvable.' });
    }

    const course = courseResult.rows[0];
    let enrolled = false;
    let progress = [];

    if (req.user) {
      const enrollResult = await client.query(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, course.id]
      );
      enrolled = enrollResult.rows.length > 0;

      if (enrolled) {
        const progressResult = await client.query(
          'SELECT lesson_key FROM lesson_progress WHERE user_id = $1 AND course_id = $2',
          [req.user.id, course.id]
        );
        progress = progressResult.rows.map(p => p.lesson_key);
      }
    }

    // Parser le contenu JSON
    let content = null;
    let summary = [];
    try {
      summary = JSON.parse(course.summary || '[]');
      // Contenu complet seulement si inscrit
      if (enrolled) {
        content = JSON.parse(course.content || '{}');
      } else {
        // Preview : seulement les titres de chapitres et leçons (pas le texte)
        const fullContent = JSON.parse(course.content || '{}');
        if (fullContent.chapters) {
          content = {
            chapters: fullContent.chapters.map(ch => ({
              id: ch.id,
              title: ch.title,
              lessons: ch.lessons.map(l => ({
                id: l.id,
                title: l.title,
                image: l.image,
                locked: true
                // Pas de 'content' ici
              }))
            }))
          };
        }
      }
    } catch (e) {
      console.error('Content parse error:', e);
    }

    // Calculer le total de leçons
    let totalLessons = 0;
    if (content && content.chapters) {
      content.chapters.forEach(ch => { totalLessons += ch.lessons?.length || 0; });
    }

    const hasPdf = !!(course.pdf_url && course.pdf_url.trim());

    res.json({
      success: true,
      course: {
        id: course.id,
        title: course.title,
        category: course.category,
        level: course.level,
        duration: course.duration,
        price: course.price,
        description: course.description,
        summary,
        icon: course.icon,
        image_url: course.image_url,
        content,
        totalLessons,
        hasPdf,
        enrolled,
        progress
      }
    });
  } catch (err) {
    console.error('Course detail error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// GET /api/courses/:id/lesson/:lessonId
// Contenu d'une leçon spécifique
// ══════════════════════════════════
router.get('/:id/lesson/:lessonId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    // Vérifier enrollment
    const enrollResult = await client.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, req.params.id]
    );

    if (enrollResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas inscrit à cette formation.'
      });
    }

    const courseResult = await client.query(
      'SELECT content FROM courses WHERE id = $1',
      [req.params.id]
    );
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formation introuvable.' });
    }

    const content = JSON.parse(courseResult.rows[0].content || '{}');
    let lessonFound = null;

    if (content.chapters) {
      for (const ch of content.chapters) {
        if (ch.lessons) {
          const l = ch.lessons.find(l => l.id === req.params.lessonId);
          if (l) { 
            lessonFound = { ...l, chapterTitle: ch.title }; 
            break; 
          }
        }
      }
    }

    if (!lessonFound) {
      return res.status(404).json({ success: false, message: 'Leçon introuvable.' });
    }

    res.json({ success: true, lesson: lessonFound });
  } catch (err) {
    console.error('Lesson error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════
// GET /api/courses/:id/pdf
// Télécharger le PDF (inscrits seulement)
// ══════════════════════════════════
router.get('/:id/pdf', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    // Vérifier enrollment
    const enrollResult = await client.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, req.params.id]
    );

    if (enrollResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Vous devez être inscrit pour télécharger le PDF.'
      });
    }

    const courseResult = await client.query(
      'SELECT title, pdf_url FROM courses WHERE id = $1',
      [req.params.id]
    );
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formation introuvable.' });
    }

    const course = courseResult.rows[0];

    // Si PDF externe (URL)
    if (course.pdf_url && course.pdf_url.startsWith('http')) {
      return res.json({ success: true, pdfUrl: course.pdf_url, title: course.title });
    }

    // Si PDF local
    if (course.pdf_url) {
      const pdfPath = path.join(__dirname, '..', 'uploads', 'pdfs', course.pdf_url);
      if (fs.existsSync(pdfPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${course.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
        return fs.createReadStream(pdfPath).pipe(res);
      }
    }

    // Générer un PDF simple si aucun PDF disponible
    res.status(404).json({
      success: false,
      message: 'PDF en cours de préparation. Revenez bientôt ou contactez-nous via WhatsApp.',
      whatsapp: '+229 01 59 60 95 81'
    });
  } catch (err) {
    console.error('PDF download error:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

module.exports = router;
