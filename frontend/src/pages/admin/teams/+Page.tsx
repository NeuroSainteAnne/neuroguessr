import { useEffect, useState, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import './Teams.css';
import { consoleLog } from '../../../utils/logging';

interface Team {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  memberCount: number;
}

interface TeamMember {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  email: string;
  teamId: number;
}

interface User {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  email: string;
  teamId: number | null;
}

export function Page() {
  const { authToken, isLoggedIn, userIsAdmin, t } = useApp();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<Record<number, TeamMember[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<Record<number, boolean>>({});
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  
  // User assignment states
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Form states
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const adminNavRef = useRef<HTMLDivElement>(null);
  const [navSliderStyle, setNavSliderStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => { setIsHydrated(true); }, []);

  // Check if user is admin
  if (!isLoggedIn || !userIsAdmin) {
    return (
      <div className="teams-page">
        <div className="teams-container">
          <div className="access-denied">
            <h2>Access Denied</h2>
            <p>You must be an administrator to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  const fetchTeams = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/teams', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      consoleLog('verbose', `Fetched ${data.teams.length} teams`);
      setTeams(data.teams);
    } catch (err) {
      console.error('Error fetching teams:', err);
      setError('Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async (teamId: number) => {
    try {
      setLoadingMembers(prev => ({ ...prev, [teamId]: true }));

      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTeamMembers(prev => ({ ...prev, [teamId]: data.members }));
      consoleLog('verbose', `Fetched ${data.members.length} members for team ${teamId}`);
    } catch (err) {
      console.error(`Error fetching members for team ${teamId}:`, err);
    } finally {
      setLoadingMembers(prev => ({ ...prev, [teamId]: false }));
    }
  };

  const handleToggleMembers = (teamId: number) => {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null);
    } else {
      setExpandedTeamId(teamId);
      // Always fetch fresh data when expanding
      fetchTeamMembers(teamId);
    }
  };

  const handleCreateTeam = async () => {
    if (!formName.trim()) {
      setError('Team name is required');
      return;
    }

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: formName,
          description: formDescription || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create team');
      }

      consoleLog('normal', `Created team: ${data.team.name}`);
      const newTeam = data.team;
      
      setShowCreateModal(false);
      setFormName('');
      setFormDescription('');
      
      // Refresh teams list
      await fetchTeams();
      
      // Automatically open assignment modal for the new team
      openAssignModal(newTeam);
    } catch (err: any) {
      console.error('Error creating team:', err);
      setError(err.message || 'Failed to create team');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateTeam = async () => {
    if (!selectedTeam || !formName.trim()) {
      setError('Team name is required');
      return;
    }

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/teams/${selectedTeam.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: formName,
          description: formDescription || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update team');
      }

      consoleLog('normal', `Updated team: ${data.team.name}`);
      setShowEditModal(false);
      setSelectedTeam(null);
      setFormName('');
      setFormDescription('');
      fetchTeams();
    } catch (err: any) {
      console.error('Error updating team:', err);
      setError(err.message || 'Failed to update team');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/teams/${selectedTeam.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete team');
      }

      consoleLog('normal', `Deleted team: ${selectedTeam.name} (${data.membersUnassigned} members unassigned)`);
      setShowDeleteModal(false);
      setSelectedTeam(null);
      fetchTeams();
    } catch (err: any) {
      console.error('Error deleting team:', err);
      setError(err.message || 'Failed to delete team');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUnassignMember = async (teamId: number, userId: number, username: string) => {
    try {
      const response = await fetch(`/api/teams/${teamId}/unassign/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to unassign user');
      }

      consoleLog('normal', `Unassigned user ${username} from team ${teamId}`);
      
      // Refresh all teams to get updated member counts
      await fetchTeams();
      
      // Refresh the members list for this team
      fetchTeamMembers(teamId);
    } catch (err: any) {
      console.error('Error unassigning user:', err);
      setError(err.message || 'Failed to unassign user');
    }
  };

  const fetchAllUsers = async (teamId: number) => {
    try {
      setLoadingUsers(true);

      const response = await fetch('/api/admin/users', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      consoleLog('verbose', `Fetched ${data.users.length} users`);
      
      setAllUsers(data.users);
      // Initially show only users not in this team
      setFilteredUsers(data.users.filter((user: User) => user.teamId !== teamId));
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAssignUser = async (userId: number, username: string) => {
    if (!selectedTeam) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/teams/${selectedTeam.id}/assign/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign user');
      }

      consoleLog('normal', `Assigned user ${username} to team ${selectedTeam.name}`);
      
      // Refresh all teams to get updated member counts
      await fetchTeams();
      
      // Refresh the members list for this team if it's currently expanded
      if (expandedTeamId === selectedTeam.id) {
        fetchTeamMembers(selectedTeam.id);
      }
      
      // Remove the assigned user from the filtered list (hide them)
      setFilteredUsers(prev => prev.filter(u => u.id !== userId));
      setAllUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, teamId: selectedTeam.id } : u
      ));
      
      // Don't close modal - allow multiple assignments
    } catch (err: any) {
      console.error('Error assigning user:', err);
      setError(err.message || 'Failed to assign user');
    } finally {
      setFormLoading(false);
    }
  };

  const openAssignModal = (team: Team) => {
    setSelectedTeam(team);
    setShowAssignModal(true);
    setSearchQuery('');
    fetchAllUsers(team.id);
  };

  const handleSearchUsers = (query: string) => {
    setSearchQuery(query);
    if (!selectedTeam) return;
    
    if (!query.trim()) {
      // Show only unassigned users or users from other teams
      setFilteredUsers(allUsers.filter(user => user.teamId !== selectedTeam.id));
    } else {
      const lowerQuery = query.toLowerCase();
      const filtered = allUsers.filter(user => {
        // Exclude users already in this team
        if (user.teamId === selectedTeam.id) return false;
        
        return (
          user.username.toLowerCase().includes(lowerQuery) ||
          user.firstname.toLowerCase().includes(lowerQuery) ||
          user.lastname.toLowerCase().includes(lowerQuery) ||
          user.email.toLowerCase().includes(lowerQuery)
        );
      });
      setFilteredUsers(filtered);
    }
  };

  const openEditModal = (team: Team) => {
    setSelectedTeam(team);
    setFormName(team.name);
    setFormDescription(team.description || '');
    setShowEditModal(true);
  };

  const openDeleteModal = (team: Team) => {
    setSelectedTeam(team);
    setShowDeleteModal(true);
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setShowAssignModal(false);
    setSelectedTeam(null);
    setFormName('');
    setFormDescription('');
    setSearchQuery('');
    setError(null);
  };

  useEffect(() => {
    if (isLoggedIn && userIsAdmin) {
      fetchTeams();
    }
  }, [authToken, isLoggedIn, userIsAdmin]);

  useEffect(() => {
    if (!adminNavRef.current) return;
    const activeBtn = adminNavRef.current.querySelector('.admin-nav-btn.active') as HTMLElement;
    const inactiveBtn = adminNavRef.current.querySelector('.admin-nav-btn:not(.active)') as HTMLElement;
    if (!activeBtn || !inactiveBtn) return;
    const containerRect = adminNavRef.current.getBoundingClientRect();
    const activeBtnRect = activeBtn.getBoundingClientRect();
    const inactiveBtnRect = inactiveBtn.getBoundingClientRect();
    // Start from the inactive button position, then animate to active
    setNavSliderStyle({
      left: inactiveBtnRect.left - containerRect.left,
      width: inactiveBtnRect.width,
      opacity: 1,
      transition: 'none',
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setNavSliderStyle({
          left: activeBtnRect.left - containerRect.left,
          width: activeBtnRect.width,
          opacity: 1,
        });
      });
    });
  }, [isHydrated, loading]);

  if (loading) {
    return (
      <div className="teams-page">
        <div className="teams-container">
          <div className="loading-state-teams">
            <div className="loading-spinner-teams"></div>
            <p>Loading teams...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="teams-page">
      <div className="teams-container">
        <div className="teams-header">
          <h1>{t('admin_section_title') || 'Admin Section'}</h1>
          <div className="admin-nav" ref={adminNavRef}>
            <div className="admin-nav-slider" style={navSliderStyle}></div>
            <a href="/admin/teams" className="admin-nav-btn active">Équipes</a>
            <a href="/admin/news" className="admin-nav-btn">Actualités</a>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="teams-actions">
          <button 
            className="create-team-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + Create New Team
          </button>
        </div>

        {teams.length === 0 ? (
          <div className="empty-state">
            <p>No teams yet. Create your first team to get started!</p>
            <button 
              className="create-team-btn"
              onClick={() => setShowCreateModal(true)}
            >
              + Create Team
            </button>
          </div>
        ) : (
          <div className="teams-list">
            {teams.map(team => (
              <div key={team.id} className="team-card">
                <div className="team-card-header">
                  <div className="team-info">
                    <h3>{team.name}</h3>
                    <div>
                     {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                    </div>
                    <div>
                    {team.description && (
                      <p className="team-description">{team.description}</p>
                    )}
                    </div>
                  </div>
                  <div className="team-actions">
                    <button
                      className="team-btn view-members-btn"
                      onClick={() => handleToggleMembers(team.id)}
                    >
                      {expandedTeamId === team.id ? 'Hide' : 'View'} Members
                    </button>
                    <button
                      className="team-btn edit-team-btn"
                      onClick={() => openEditModal(team)}
                    >
                      Edit
                    </button>
                    <button
                      className="team-btn delete-team-btn"
                      onClick={() => openDeleteModal(team)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expandedTeamId === team.id && (
                  <div className="members-section">
                    <div className="members-header">
                      <h4>Team Members</h4>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          className="team-btn view-members-btn"
                          onClick={() => openAssignModal(team)}
                          style={{ fontSize: '0.85rem', padding: '0.375rem 0.875rem' }}
                        >
                          + Assign Users
                        </button>
                      </div>
                    </div>

                    {loadingMembers[team.id] ? (
                      <p style={{ color: '#8892b0', textAlign: 'center', padding: '1rem' }}>
                        Loading members...
                      </p>
                    ) : (teamMembers[team.id]?.length ?? 0) > 0 ? (
                      <div className="members-list">
                        {teamMembers[team.id]!.map(member => (
                          <div key={member.id} className="member-item">
                            <div className="member-info">
                              <span className="member-username">{member.username}</span>
                              {' - '}
                              <span>{member.firstname} {member.lastname}</span>
                            </div>
                            <button
                              className="unassign-btn"
                              onClick={() => handleUnassignMember(team.id, member.id, member.username)}
                            >
                              Unassign
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: '#8892b0', textAlign: 'center', padding: '1rem' }}>
                        No members assigned to this team yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create Team Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Team</h2>
                <p>Add a new team to your organization</p>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Team Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Enter team name"
                    maxLength={100}
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Enter team description (optional)"
                    maxLength={500}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="modal-btn modal-btn-cancel"
                  onClick={closeModals}
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button
                  className="modal-btn modal-btn-primary"
                  onClick={handleCreateTeam}
                  disabled={formLoading || !formName.trim()}
                >
                  {formLoading ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Team Modal */}
        {showEditModal && selectedTeam && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit Team</h2>
                <p>Update team information</p>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Team Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Enter team name"
                    maxLength={100}
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Enter team description (optional)"
                    maxLength={500}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="modal-btn modal-btn-cancel"
                  onClick={closeModals}
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button
                  className="modal-btn modal-btn-primary"
                  onClick={handleUpdateTeam}
                  disabled={formLoading || !formName.trim()}
                >
                  {formLoading ? 'Updating...' : 'Update Team'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Team Modal */}
        {showDeleteModal && selectedTeam && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Delete Team</h2>
                <p>Are you sure you want to delete this team?</p>
              </div>
              <div className="modal-body">
                <p style={{ color: '#a8b2d1', marginBottom: '1rem' }}>
                  Team: <strong style={{ color: '#fff' }}>{selectedTeam.name}</strong>
                </p>
                <p style={{ color: '#ef4444', fontSize: '0.95rem' }}>
                  ⚠️ Members will be unassigned from this team but not deleted.
                  This action cannot be undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  className="modal-btn modal-btn-cancel"
                  onClick={closeModals}
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button
                  className="modal-btn modal-btn-danger"
                  onClick={handleDeleteTeam}
                  disabled={formLoading}
                >
                  {formLoading ? 'Deleting...' : 'Delete Team'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assign User Modal */}
        {showAssignModal && selectedTeam && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Assign Users to {selectedTeam.name}</h2>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Search Available Users</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchUsers(e.target.value)}
                    placeholder="Search by username, name, or email..."
                  />
                </div>
                
                {loadingUsers ? (
                  <p style={{ color: '#8892b0', textAlign: 'center', padding: '2rem' }}>
                    Loading users...
                  </p>
                ) : (
                  <div className="users-list">
                    {filteredUsers.length === 0 ? (
                      <p style={{ color: '#8892b0', textAlign: 'center', padding: '2rem' }}>
                        {searchQuery 
                          ? 'No available users found matching your search.' 
                          : 'No available users to assign. All users are either in this team or other teams.'}
                      </p>
                    ) : (
                      filteredUsers.map(user => (
                        <div key={user.id} className="user-item">
                          <div className="user-info">
                            <span className="user-username">{user.username}</span>
                            <span className="user-details">
                              {user.firstname} {user.lastname}
                            </span>
                            {user.teamId && user.teamId !== selectedTeam.id && (
                              <span className="user-team-badge">
                                {teams.find(t => t.id === user.teamId)?.name + " team" || 'Another team'}
                              </span>
                            )}
                          </div>
                          <button
                            className="assign-user-btn"
                            onClick={() => handleAssignUser(user.id, user.username)}
                            disabled={formLoading}
                          >
                            {formLoading ? 'Assigning...' : 'Assign'}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  className="modal-btn modal-btn-primary"
                  onClick={closeModals}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
