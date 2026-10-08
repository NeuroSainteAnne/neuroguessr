import { useEffect, useState, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import '../teams/Teams.css';
import './NewsAdmin.css';

interface NewsItem {
  id: number;
  title: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function Page() {
  const { authToken, isLoggedIn, userIsAdmin, t } = useApp();
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const adminNavRef = useRef<HTMLDivElement>(null);
  const [navSliderStyle, setNavSliderStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => { setIsHydrated(true); }, []);

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
  }, [isHydrated]);

  if (!isLoggedIn || !userIsAdmin) {
    return (
      <div className="teams-page">
        <div className="access-denied">
          <h2>Accès refusé</h2>
          <p>Vous devez être administrateur pour accéder à cette page.</p>
        </div>
      </div>
    );
  }

  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/news', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error('Erreur lors du chargement');
      const data = await res.json();
      setNewsList(data.news.map((n: any) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        active: n.active,
        createdAt: n.created_at,
        updatedAt: n.updated_at,
      })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNews(); }, []);

  const openCreate = () => {
    setEditingNews(null);
    setFormTitle('');
    setFormDescription('');
    setFormActive(true);
    setShowModal(true);
  };

  const openEdit = (item: NewsItem) => {
    setEditingNews(item);
    setFormTitle(item.title);
    setFormDescription(item.description);
    setFormActive(item.active);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formDescription.trim()) return;
    setFormLoading(true);
    try {
      const url = editingNews ? `/api/news/${editingNews.id}` : '/api/news';
      const method = editingNews ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ title: formTitle, description: formDescription, active: formActive }),
      });
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      setShowModal(false);
      fetchNews();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const toggleActive = async (item: NewsItem) => {
    try {
      await fetch(`/api/news/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ active: !item.active }),
      });
      fetchNews();
    } catch (err) {
      setError('Erreur lors de la mise à jour');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Supprimer cette nouveauté ?')) return;
    try {
      await fetch(`/api/news/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      fetchNews();
    } catch (err) {
      setError('Erreur lors de la suppression');
    }
  };

  return (
    <div className="teams-page">
      <div className="teams-container">
        <div className="teams-header">
          <h1>{t('admin_section_title') || 'Admin Section'}</h1>
          <div className="admin-nav" ref={adminNavRef}>
            <div className="admin-nav-slider" style={navSliderStyle}></div>
            <a href="/admin/teams" className="admin-nav-btn">Équipes</a>
            <a href="/admin/news" className="admin-nav-btn active">Actualités</a>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="teams-actions">
          <button className="create-team-btn" onClick={openCreate}>
            + Nouvelle annonce
          </button>
        </div>

        {loading ? (
          <div className="loading-state-teams">
            <div className="loading-spinner-teams" />
          </div>
        ) : newsList.length === 0 ? (
          <div className="empty-state">
            <p>Aucune nouveauté créée.</p>
            <button className="create-team-btn" onClick={openCreate}>Créer la première</button>
          </div>
        ) : (
          <div className="teams-list">
            {newsList.map(item => (
              <div key={item.id} className={`team-card news-card${item.active ? ' news-card--active' : ' news-card--inactive'}`}>
                <div className="team-card-header">
                  <div className="team-info">
                    <div className="news-card-status">
                      <span className={`news-badge${item.active ? ' news-badge--active' : ' news-badge--inactive'}`}>
                        {item.active ? '● Actif' : '○ Inactif'}
                      </span>
                      <span className="news-date">{new Date(item.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p className="team-description">{item.description}</p>
                  </div>
                  <div className="team-actions">
                    <button className="team-btn view-members-btn" onClick={() => toggleActive(item)}>
                      {item.active ? 'Désactiver' : 'Activer'}
                    </button>
                    <button className="team-btn edit-team-btn" onClick={() => openEdit(item)}>
                      Modifier
                    </button>
                    <button className="team-btn delete-team-btn" onClick={() => handleDelete(item.id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingNews ? 'Modifier la nouveauté' : 'Nouvelle annonce'}</h2>
              <p>Ce message s'affichera en popup slide-in à gauche de l'écran.</p>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Titre</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="ex: Nouveautés mars 2026"
                  maxLength={200}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Décrivez les nouveautés..."
                  maxLength={2000}
                  rows={5}
                />
              </div>
              <div className="form-group news-toggle-group">
                <label>
                  <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} />
                  &nbsp;Activer immédiatement
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn modal-btn-cancel" onClick={() => setShowModal(false)}>
                Annuler
              </button>
              <button
                className="modal-btn modal-btn-primary"
                onClick={handleSubmit}
                disabled={formLoading || !formTitle.trim() || !formDescription.trim()}
              >
                {formLoading ? 'Sauvegarde...' : editingNews ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
