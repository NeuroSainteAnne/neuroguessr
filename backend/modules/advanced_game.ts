import { Request, Response } from 'express';
import { AdvancedGameSettings } from '../interfaces/database.interfaces.ts';
import { sql } from "./database_init.ts";
import Joi from 'joi';
import { GameCommands } from 'interfaces/multi.interfaces.ts';
import { AuthenticatedRequest } from 'interfaces/requests.interfaces.ts';
import { logger } from './logging.ts';

const externalGameCommandsSchema = Joi.array().items(
  Joi.object({
    action: Joi.string().valid("load-atlas", "guess", "countdown").required(),
    atlas: Joi.string().optional(),
    regionId: Joi.number().integer().optional(),
    duration: Joi.number().integer().min(1).when('action', {
      is: 'countdown',
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
    startTime: Joi.string().isoDate().when('action', {
      is: 'countdown',
      then: Joi.optional(),
      otherwise: Joi.forbidden()
    }),
    blindMode: Joi.boolean().optional(),
  }).required()
);

const validateExternalGameCommands = (commands: unknown): Joi.ValidationResult => {
  return externalGameCommandsSchema.validate(commands, { abortEarly: false });
};

/**
 * Save new advanced game settings
 */
export const saveAdvancedSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, settings, public: isPublic } = req.body;
    const userId: number = (req as AuthenticatedRequest).user.id;
    
    // Validate required fields
    if (!name || !settings) {
      res.status(400).send({ message: "Name and settings are required" });
      return;
    }
    
    // Validate settings format (ensure it's valid JSON)
    let commands: GameCommands[] = [];
    try {
      if (typeof settings === 'string') {
        commands = JSON.parse(settings);
        const { error } = validateExternalGameCommands(commands);
        if (error) throw error;
      } else {
        JSON.stringify(settings);
        commands = settings as GameCommands[];
        const { error } = validateExternalGameCommands(commands);
        if (error) throw error;
      }
    } catch (error) {
      res.status(400).send({ message: "Settings must be valid JSON" });
      return;
    }
    
    // Convert commands to string
    const settingsStr = JSON.stringify(commands);
    
    // Insert into database
    const result = await sql`
      INSERT INTO advanced_game_settings (name, user_id, public, settings)
      VALUES (${name}, ${userId}, ${isPublic || false}, ${settingsStr})
      RETURNING id, name, user_id, created_at, public, settings
    `;
    
    res.status(201).send(result[0]);
  } catch (error) {
    logger.error("Error saving advanced settings:", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

/**
 * Get advanced game settings by ID
 */
export const getAdvancedSettingsById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const userId: number = (req as AuthenticatedRequest).user.id;
    
    // Get settings from database
    const result = await sql`
      SELECT * FROM advanced_game_settings
      WHERE id = ${parseInt(id)}
    ` as AdvancedGameSettings[];
    
    if (!result.length) {
      res.status(404).send({ message: "Settings not found" });
      return;
    }
    
    const settings = result[0];
    
    // Check if settings are private and user has access
    if (!settings.public && settings.user_id !== userId) {
      res.status(403).send({ message: "You don't have permission to access these settings" });
      return;
    }
    
    // Parse settings JSON
    try {
      settings.settings = JSON.parse(settings.settings);
    } catch (error) {
      // If parsing fails, return as is
      console.warn("Failed to parse settings JSON:", error);
    }
    
    res.status(200).send(settings);
  } catch (error) {
    logger.error("Error getting advanced settings:", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

/**
 * Get list of advanced game settings
 * Can filter by user_id and public flag
 */
export const getAdvancedSettingsList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { public: isPublic } = req.query;
    const userId: number = (req as AuthenticatedRequest).user.id;
    let query = sql`SELECT id, name, user_id, settings, created_at, public FROM advanced_game_settings WHERE 1=1`;
    
    if (isPublic) {
      query = sql`${query} AND public = TRUE`;
    } else {
      query = sql`${query} AND user_id = ${userId}`;
    }
    
    query = sql`${query} ORDER BY name ASC`;
    
    const result = await query as unknown as Omit<AdvancedGameSettings, 'settings'>[];
    
    res.status(200).send(result);
  } catch (error) {
    logger.error("Error getting advanced settings list:", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

/**
 * Update advanced game settings
 */
export const updateAdvancedSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, name, settings, public: isPublic } = req.body;
    const userId: number = (req as AuthenticatedRequest).user.id;

    // Get existing settings to check ownership
    const existingSettings = await sql`
      SELECT * FROM advanced_game_settings
      WHERE id = ${id}
    ` as AdvancedGameSettings[];
    
    if (!existingSettings.length) {
      res.status(404).send({ message: "Settings not found" });
      return;
    }
    
    if (userId !== existingSettings[0].user_id) {
      res.status(403).send({ message: "You don't have permission to update these settings" });
      return;
    }
    
    // Validate settings format (ensure it's valid JSON)
    let commands: GameCommands[] = [];
    try {
      if (typeof settings === 'string') {
        commands = JSON.parse(settings);
        const { error } = validateExternalGameCommands(commands);
        if (error) throw error;
      } else {
        JSON.stringify(settings);
        commands = settings as GameCommands[];
        const { error } = validateExternalGameCommands(commands);
        if (error) throw error;
      }
    } catch (error) {
      res.status(400).send({ message: "Settings must be valid JSON" });
      return;
    }

    // Convert commands to string
    const settingsStr = JSON.stringify(commands);
    
    // Update database
    let updates: Partial<{
        name: string;
        settings: string;
        public: boolean;
    }> = {};
            
    
    if (name) {
      updates.name = name;
    }
    
    if (settingsStr && settingsStr !== "[]") {
      updates.settings = settingsStr;
    }
    
    if (isPublic !== undefined) {
      updates.public = isPublic;
    }
    
    if (Object.keys(updates).length === 0) {
      res.status(400).send({ message: "No fields to update" });
      return;
    }
    
    const result = await sql`
      UPDATE advanced_game_settings
      SET ${sql(updates)}
      WHERE id = ${parseInt(id)}
      RETURNING id, name, user_id, created_at, public, settings
    `;
    
    // Parse settings JSON for response
    try {
      result[0].settings = JSON.parse(result[0].settings);
    } catch (error) {
      console.warn("Failed to parse settings JSON for response:", error);
    }
    
    res.status(200).send(result[0]);
  } catch (error) {
    logger.error("Error updating advanced settings:", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

/**
 * Delete advanced game settings
 */
export const deleteAdvancedSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const userId: number = (req as AuthenticatedRequest).user.id;
    
    // Get existing settings to check ownership
    const existingSettings = await sql`
      SELECT * FROM advanced_game_settings
      WHERE id = ${parseInt(id)}
    ` as AdvancedGameSettings[];
    
    if (!existingSettings.length) {
      res.status(404).send({ message: "Settings not found" });
      return;
    }
    
    // Check if user has permission to delete
    if (userId !== existingSettings[0].user_id) {
      res.status(403).send({ message: "You don't have permission to delete these settings" });
      return;
    }
    
    // Delete from database
    await sql`
      DELETE FROM advanced_game_settings
      WHERE id = ${parseInt(id)}
    `;
    
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting advanced settings:", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

/**
 * Check existing name
 */
export const checkAdvancedSettingsName = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name } = req.query;
        const userId = (req as AuthenticatedRequest).user.id

        if (!name) {
            res.status(400).send({ message: "Name is required." });
            return;
        }

        const result = await sql`
            SELECT id FROM advanced_game_settings
            WHERE name = ${String(name)} AND user_id = ${userId}
        `;

        const exists = result.length > 0;
        res.status(200).send({ exists, id: exists ? result[0].id : null });
    } catch (error) {
        logger.error("Error checking advanced settings name:", error);
        res.status(500).send({ message: "Internal server error." });
    }
};