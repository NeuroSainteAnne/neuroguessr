import type { Request, Response } from 'express';
import { sql } from './database_init.ts';
import { logger } from './logging.ts';
import Joi from 'joi';

// GET /api/news/active — public, returns the most recent active news item
export const getActiveNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await sql`
      SELECT id, title, description, created_at, updated_at
      FROM news
      WHERE active = TRUE
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (rows.length === 0) {
      res.status(200).json({ news: null });
      return;
    }
    res.status(200).json({ news: rows[0] });
  } catch (error) {
    logger.error('Error getting active news:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/news — admin, returns all news items
export const getAllNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await sql`
      SELECT id, title, description, active, created_at, updated_at
      FROM news
      ORDER BY created_at DESC
    `;
    res.status(200).json({ news: rows });
  } catch (error) {
    logger.error('Error getting all news:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/news — admin
export const createNews = async (req: Request, res: Response): Promise<void> => {
  const schema = Joi.object({
    title: Joi.string().max(200).required(),
    description: Joi.string().max(2000).required(),
    active: Joi.boolean().default(true),
  });
  const { error, value } = schema.validate(req.body);
  if (error) {
    res.status(400).json({ error: error.details[0].message });
    return;
  }
  try {
    const rows = await sql`
      INSERT INTO news (title, description, active)
      VALUES (${value.title}, ${value.description}, ${value.active})
      RETURNING id, title, description, active, created_at, updated_at
    `;
    res.status(201).json({ news: rows[0] });
  } catch (err) {
    logger.error('Error creating news:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /api/news/:id — admin
export const updateNews = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return; }

  const schema = Joi.object({
    title: Joi.string().max(200),
    description: Joi.string().max(2000),
    active: Joi.boolean(),
  }).min(1);
  const { error, value } = schema.validate(req.body);
  if (error) { res.status(400).json({ error: error.details[0].message }); return; }

  try {
    const rows = await sql`
      UPDATE news
      SET
        title       = COALESCE(${value.title ?? null}, title),
        description = COALESCE(${value.description ?? null}, description),
        active      = COALESCE(${value.active ?? null}, active),
        updated_at  = NOW()
      WHERE id = ${id}
      RETURNING id, title, description, active, created_at, updated_at
    `;
    if (rows.length === 0) { res.status(404).json({ error: 'News not found' }); return; }
    res.status(200).json({ news: rows[0] });
  } catch (err) {
    logger.error('Error updating news:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/news/:id — admin
export const deleteNews = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return; }
  try {
    await sql`DELETE FROM news WHERE id = ${id}`;
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error('Error deleting news:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
