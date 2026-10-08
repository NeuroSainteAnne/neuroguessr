import { useApp } from '../../../context/AppContext';
import { GameSelectorWithSearch } from '../GameSelectorWithSearch';
import './HelpPage.css';

export function Page() {
  const { t } = useApp();

  return (
    <>
      <title>{t('help_page_title') || 'Aide — NeuroGuessr'}</title>
      <GameSelectorWithSearch />
      <div className="help-page">
        <h1>{t('help_page_heading') || 'Aide & Informations'}</h1>

        <section className="help-section">
          <h2>{t('help_about_title') || 'À Propos de NeuroGuessr'}</h2>
          <p>{t('help_about_body') || ''}</p>
        </section>

        <section className="help-section">
          <h2>{t('help_modes_title') || 'Modes de Jeu'}</h2>
          <div className="help-mode-list">
            <div className="help-mode-item">
              <div className="help-mode-icon">
                <img src="/interface/boussole.png" alt={t('navigation_mode')} />
              </div>
              <div className="help-mode-body">
                <h3>{t('navigation_mode')}</h3>
                <p dangerouslySetInnerHTML={{ __html: t('help_modes_navigation') || '' }} />
              </div>
            </div>
            <div className="help-mode-item">
              <div className="help-mode-icon">
                <img src="/interface/practice.png" alt={t('practice_mode')} />
              </div>
              <div className="help-mode-body">
                <h3>{t('practice_mode')}</h3>
                <p dangerouslySetInnerHTML={{ __html: t('help_modes_practice') || '' }} />
              </div>
            </div>
            <div className="help-mode-item">
              <div className="help-mode-icon">
                <img src="/interface/flame.png" alt={t('streak_mode')} />
              </div>
              <div className="help-mode-body">
                <h3>{t('streak_mode')}</h3>
                <p dangerouslySetInnerHTML={{ __html: t('help_modes_streak') || '' }} />
              </div>
            </div>
            <div className="help-mode-item">
              <div className="help-mode-icon">
                <img src="/interface/chronometer.png" alt={t('time_attack_mode')} />
              </div>
              <div className="help-mode-body">
                <h3>{t('time_attack_mode')}</h3>
                <p dangerouslySetInnerHTML={{ __html: t('help_modes_time_attack') || '' }} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
