import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../interfaces/requests.interfaces.ts';
import type { Team } from '../interfaces/database.interfaces.ts';
import { sql } from './database_init.ts';
import { logger } from './logging.ts';
import Joi from 'joi';
import { transformKeysSnakeToCamel } from 'middlewares/case-transformer.ts';

// Middleware to check if user is admin
export const requireAdmin = (req: Request, res: Response, next: Function): void => {
  const isAdmin: boolean = (req as AuthenticatedRequest).user?.admin || false;
  
  if (!isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  
  next();
};

// GET /api/teams - Get all teams
export const getAllTeams = async (req: Request, res: Response): Promise<void> => {
  try {
    const teams = await sql`
      SELECT 
        t.id, 
        t.name, 
        t.description, 
        t.created_at,
        COUNT(u.id)::int as member_count
      FROM teams t
      LEFT JOIN users u ON u.team_id = t.id
      GROUP BY t.id, t.name, t.description, t.created_at
      ORDER BY t.name ASC
    `;

    logger.info(`Retrieved ${teams.length} teams`);
    res.status(200).json({ teams: transformKeysSnakeToCamel(teams) });
  } catch (error) {
    logger.error('Error getting teams:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/teams/:id - Get a specific team
export const getTeamById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const teamId = parseInt(id, 10);

    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team ID' });
      return;
    }

    const teams = await sql<Team[]>`
      SELECT id, name, description, created_at
      FROM teams
      WHERE id = ${teamId}
      LIMIT 1
    `;

    if (teams.length === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.status(200).json({ team: teams[0] });
  } catch (error) {
    logger.error('Error getting team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/teams/:id/members - Get all members of a team
export const getTeamMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const teamId = parseInt(id, 10);

    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team ID' });
      return;
    }

    // First check if team exists
    const teams = await sql<Team[]>`
      SELECT id FROM teams WHERE id = ${teamId} LIMIT 1
    `;

    if (teams.length === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const members = await sql`
      SELECT 
        id, 
        username, 
        firstname, 
        lastname, 
        email,
        created_at,
        team_id
      FROM users
      WHERE team_id = ${teamId}
      ORDER BY username ASC
    `;

    logger.info(`Retrieved ${members.length} members for team ${teamId}`);
    res.status(200).json({ members, count: members.length });
  } catch (error) {
    logger.error('Error getting team members:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/teams - Create a new team
export const createTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const validate = (data: { name: string; description?: string }) => {
      const schema = Joi.object({
        name: Joi.string().min(1).max(100).required().label('Team name'),
        description: Joi.string().max(500).allow(null, '').optional().label('Description')
      });
      return schema.validate(data);
    };

    const { error, value } = validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const { name, description } = value;

    // Check if team name already exists
    const existingTeams = await sql<Team[]>`
      SELECT id FROM teams WHERE name = ${name} LIMIT 1
    `;

    if (existingTeams.length > 0) {
      res.status(409).json({ error: 'A team with this name already exists' });
      return;
    }

    const newTeams = await sql<Team[]>`
      INSERT INTO teams (name, description)
      VALUES (${name}, ${description || null})
      RETURNING id, name, description, created_at
    `;

    const userId = (req as AuthenticatedRequest).user.id;
    logger.info(`Admin ${userId} created team: ${name} (ID: ${newTeams[0].id})`);
    
    res.status(201).json({ 
      message: 'Team created successfully',
      team: newTeams[0]
    });
  } catch (error) {
    logger.error('Error creating team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /api/teams/:id - Update a team
export const updateTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const teamId = parseInt(id, 10);

    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team ID' });
      return;
    }

    const validate = (data: { name?: string; description?: string }) => {
      const schema = Joi.object({
        name: Joi.string().min(1).max(100).optional().label('Team name'),
        description: Joi.string().max(500).allow(null, '').optional().label('Description')
      }).min(1); // At least one field must be present
      return schema.validate(data);
    };

    const { error, value } = validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const { name, description } = value;

    // Check if team exists
    const teams = await sql<Team[]>`
      SELECT id FROM teams WHERE id = ${teamId} LIMIT 1
    `;

    if (teams.length === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // If name is being updated, check for duplicates
    if (name) {
      const duplicateTeams = await sql<Team[]>`
        SELECT id FROM teams WHERE name = ${name} AND id != ${teamId} LIMIT 1
      `;

      if (duplicateTeams.length > 0) {
        res.status(409).json({ error: 'A team with this name already exists' });
        return;
      }
    }

    // Build dynamic update query
    let updatedTeams: Team[];
    
    if (name !== undefined && description !== undefined) {
      updatedTeams = await sql<Team[]>`
        UPDATE teams
        SET name = ${name}, description = ${description}
        WHERE id = ${teamId}
        RETURNING id, name, description, created_at
      `;
    } else if (name !== undefined) {
      updatedTeams = await sql<Team[]>`
        UPDATE teams
        SET name = ${name}
        WHERE id = ${teamId}
        RETURNING id, name, description, created_at
      `;
    } else if (description !== undefined) {
      updatedTeams = await sql<Team[]>`
        UPDATE teams
        SET description = ${description}
        WHERE id = ${teamId}
        RETURNING id, name, description, created_at
      `;
    } else {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const userId = (req as AuthenticatedRequest).user.id;
    logger.info(`Admin ${userId} updated team ${teamId}:`, { name, description });
    
    res.status(200).json({ 
      message: 'Team updated successfully',
      team: updatedTeams[0]
    });
  } catch (error) {
    logger.error('Error updating team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/teams/:id - Delete a team
export const deleteTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const teamId = parseInt(id, 10);

    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team ID' });
      return;
    }

    // Check how many users are in this team
    const memberCount = await sql`
      SELECT COUNT(*) as count FROM users WHERE team_id = ${teamId}
    `;

    const count = parseInt(memberCount[0].count as string, 10);

    // Delete the team (users will have team_id set to NULL due to ON DELETE SET NULL)
    const result = await sql`
      DELETE FROM teams WHERE id = ${teamId}
    `;

    if (result.count === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const userId = (req as AuthenticatedRequest).user.id;
    logger.info(`Admin ${userId} deleted team ${teamId} (${count} members unassigned)`);
    
    res.status(200).json({ 
      message: 'Team deleted successfully',
      membersUnassigned: count
    });
  } catch (error) {
    logger.error('Error deleting team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /api/teams/:teamId/assign/:userId - Assign a user to a team
export const assignUserToTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teamId, userId } = req.params;
    const teamIdNum = parseInt(teamId, 10);
    const userIdNum = parseInt(userId, 10);

    if (isNaN(teamIdNum) || isNaN(userIdNum)) {
      res.status(400).json({ error: 'Invalid team ID or user ID' });
      return;
    }

    // Check if team exists
    const teams = await sql<Team[]>`
      SELECT id FROM teams WHERE id = ${teamIdNum} LIMIT 1
    `;

    if (teams.length === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Check if user exists
    const users = await sql`
      SELECT id, username FROM users WHERE id = ${userIdNum} LIMIT 1
    `;

    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Assign user to team
    await sql`
      UPDATE users 
      SET team_id = ${teamIdNum}
      WHERE id = ${userIdNum}
    `;

    const adminId = (req as AuthenticatedRequest).user.id;
    logger.info(`Admin ${adminId} assigned user ${userIdNum} (${users[0].username}) to team ${teamIdNum}`);
    
    res.status(200).json({ 
      message: 'User assigned to team successfully',
      userId: userIdNum,
      teamId: teamIdNum,
      username: users[0].username
    });
  } catch (error) {
    logger.error('Error assigning user to team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/teams/:teamId/unassign/:userId - Remove a user from a team
export const unassignUserFromTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const userIdNum = parseInt(userId, 10);

    if (isNaN(userIdNum)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Check if user exists
    const users = await sql`
      SELECT id, username, team_id FROM users WHERE id = ${userIdNum} LIMIT 1
    `;

    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (users[0].team_id === null) {
      res.status(400).json({ error: 'User is not assigned to any team' });
      return;
    }

    // Unassign user from team
    await sql`
      UPDATE users 
      SET team_id = NULL
      WHERE id = ${userIdNum}
    `;

    const adminId = (req as AuthenticatedRequest).user.id;
    logger.info(`Admin ${adminId} unassigned user ${userIdNum} (${users[0].username}) from team ${users[0].team_id}`);
    
    res.status(200).json({ 
      message: 'User unassigned from team successfully',
      userId: userIdNum,
      username: users[0].username
    });
  } catch (error) {
    logger.error('Error unassigning user from team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/admin/users - Get all users (admin only)
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await sql`
      SELECT 
        id, 
        username, 
        firstname, 
        lastname, 
        email,
        team_id,
        created_at
      FROM users
      ORDER BY username ASC
    `;

    logger.info(`Admin retrieved ${users.length} users`);
    res.status(200).json({ users: transformKeysSnakeToCamel(users) });
  } catch (error) {
    logger.error('Error getting all users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
