import React, { useEffect, useState } from "react";
import { navigate } from "vike/client/router";
import { useApp } from "../../context/AppContext";
import { useGameSelector } from "../../context/GameSelectorContext";
import atlasFiles, { atlasCategories } from "../../utils/atlas_files";
import { prefetchAtlasJSON } from "../../utils/nifti_cache";
import './GameSelector.css';


const categoryImages: Record<string, string> = {
  "cortical_regions": "/interface/cortical_regions.png",
  "functional_networks": "/interface/functional_networks.png",
  "subcortical_regions": "/interface/subcortical_regions.png",
  "white_matter_tracts": "/interface/white_matter_tracts.png",
  "cerebral_arteries": "/interface/cerebral_arteries.png",
};

export const GameSelectorAtlas = () => {
  const { t, preloadAtlas, showTooltip, hideTooltip, pageContext, 
    isMobileView, setIsMobileView } = useApp();
  const { 
    selectedAtlas, setSelectedAtlas, 
    selectedCategory, setSelectedCategory,
    selectedMode, setSelectedMode 
  } = useGameSelector();

  const [blindMode, setBlindMode] = useState(false);
  const parts = pageContext.urlPathname.split('/');
  const welcomeSubPage = parts[2] || 'singleplayer';
  const defaultCategory = parts[3] || "";
  const defaultAtlas = parts[4] || "";
  const defaultMode = parts[5] || "";

  const handleInfoHover = (e: React.MouseEvent<HTMLSpanElement>, infoText: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    showTooltip(infoText, rect.left + rect.width / 2, rect.top - 8);
  };

  const handleInfoLeave = () => {
    hideTooltip();
  };

  const isMultiCreate = welcomeSubPage === 'multiplayer-create';

  useEffect(() => {
    const checkMobile = () => {
        const isMobile = window.innerWidth <= 768; // Adjust breakpoint as needed
        setIsMobileView(isMobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    if (isMultiCreate) {
      // In multiplayer-create mode, pre-select the first category so all atlases are visible immediately
      const autoCategory = atlasCategories[0] || ""
      setSelectedCategory(autoCategory);
    } else {
      setSelectedCategory(defaultCategory);
    }
    setSelectedAtlas(defaultAtlas);
    setSelectedMode(defaultMode);
  }, []);

  const handleCategorySelection = (category: string) => {
    setSelectedCategory(category);
    setSelectedAtlas("");
    setSelectedMode("");
    if (!isMultiCreate) {
      window.history.pushState(null, '', `/welcome/singleplayer/${category}`);
    }
  }

  const handleAtlasSelection = (atlasKey: string) => {
    setSelectedAtlas(atlasKey);
    if (!isMultiCreate) {
      window.history.pushState(null, '', `/welcome/singleplayer/${selectedCategory}/${atlasKey}`);
    }
    try {
      preloadAtlas(atlasKey);
      prefetchAtlasJSON(atlasKey);
    } catch (error) { console.error(error); }
  };

  const handleModeSelection = (mode: string) => {
    setSelectedMode(mode);
    window.history.pushState(null, '', `/welcome/singleplayer/${selectedCategory}/${selectedAtlas}/${mode}`);
  }

  const handlePlay = () => {
    if(selectedAtlas && selectedMode){
        const url = `/singleplayer/${selectedMode}/${selectedAtlas}${blindMode ? "?blind=true" : ""}`;
        navigate(url);
    }
  };

  useEffect(() => {
    const handler = () => {
      const parts = window.location.pathname.split('/');
      setSelectedCategory(parts[3] || "");
      setSelectedAtlas(parts[4] || "");
      setSelectedMode(parts[5] || "");
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [setSelectedCategory, setSelectedAtlas, setSelectedMode]);

  // --- 1. GRID VIEW ---
  if (!selectedCategory || selectedCategory === "") {
    // Mode simplifié pour la création de partie multi (sans images)
    if (isMultiCreate) {
      return (
        <div className="category-grid-container fade-in">
          <h2 className="section-title">{t("select_region_family")}</h2>
          <div className="category-list-simple">
            {atlasCategories.map((category) => (
              <button
                key={category}
                className="category-list-item"
                onClick={() => handleCategorySelection(category)}
              >
                <span>{t(category)}</span>
                <span className="card-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="category-grid-container fade-in">
        <h2 className="section-title">{t("select_region_family")}</h2>
        <div className="cards-grid">
          {atlasCategories.map((category) => (
            <button
              key={category}
              className="category-card"
              onClick={() => handleCategorySelection(category)}
            >
              <div className="card-image-wrapper">
                <img
                  src={categoryImages[category] || categoryImages["default"]}
                  alt={category}
                  className="card-image card-image-base"
                  onError={(e) => {e.currentTarget.src = categoryImages["default"] || ""}}
                />
                <img
                  src={(categoryImages[category] || categoryImages["default"] || "").replace('.png', '_colored.png')}
                  alt={category}
                  className="card-image card-image-colored"
                  onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = 'none'}}
                />
              </div>
              <div className="card-content">
                <h3>{t(category)}</h3>
                <span className="card-arrow">→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- 2. SPLIT VIEW (multiplayer-create: flat category sidebar) ---
  if (isMultiCreate) {
    return (
      <div className="mc-atlas-flat fade-in">
        {/* Category sidebar */}
        <div className="mc-atlas-categories">
          {atlasCategories.map((category) => (
            <button
              key={category}
              className={`mc-atlas-cat-btn ${selectedCategory === category ? "selected" : ""}`}
              onClick={() => handleCategorySelection(category)}
            >
              {t(category)}
            </button>
          ))}
        </div>
        {/* Atlas list */}
        <div className="mc-atlas-list">
          {Object.entries(atlasFiles)
            .filter(([_key, b]) => b.atlas_category === selectedCategory)
            .sort(([, a], [, b]) => (a.difficulty || 0) - (b.difficulty || 0))
            .map(([key, atlas]) => (
              <button
                key={key}
                className={`mc-atlas-btn ${selectedAtlas === key ? "selected" : ""}`}
                onClick={() => handleAtlasSelection(key)}
              >
                <span className="mc-atlas-btn-name">{atlas.name}</span>
                {atlas.difficulty > 0 && (
                  <span className="mc-atlas-btn-stars">
                    {[...Array(atlas.difficulty)].map((_, i) => (
                      <img key={i} src="/interface/cerveau.png" alt="" className="mc-atlas-btn-star" />
                    ))}
                  </span>
                )}
              </button>
            ))}
        </div>
      </div>
    );
  }

  // --- 3. SPLIT VIEW (singleplayer) ---
  return (
    <div className="atlas-detail-container fade-in">
      <div className="detail-header">
        <button className="back-button" onClick={() => handleCategorySelection("")}>
          ← {t("back_to_categories")}
        </button>
        <h2>{t(selectedCategory)}</h2>
      </div>

      <div className="detail-content-split">

        {/* COLONNE GAUCHE : LISTE ATLAS */}
        {(!isMobileView || selectedAtlas === "") && (
          <div className="column-atlas">
            <div className="column-title">{t("select_atlas")}</div>
            <div className="atlas-list-stack">
              {Object.entries(atlasFiles)
                .filter(([_key, b]) => b.atlas_category === selectedCategory)
                .sort(([, a], [, b]) => (a.difficulty || 0) - (b.difficulty || 0))
                .map(([key, atlas]) => (
                  <button
                    key={key}
                    className={`atlas-option-card ${selectedAtlas === key ? "selected" : ""}`}
                    onClick={() => handleAtlasSelection(key)}
                  >
                    <div className="atlas-text-group">
                        <span
                          className="atlas-text-container"
                          dangerouslySetInnerHTML={{ __html: t(key.toLowerCase() + "_info") }}
                        ></span>
                    </div>
                    {atlas.difficulty > 0 && (
                      <div className="difficulty-wrapper">
                        <span className="difficulty-label">{t("difficulty") || "Difficulté"}</span>
                        <div className="difficulty-icons">
                          {atlas.info && welcomeSubPage === "singleplayer" && (
                            <span
                              className="info-icon-wrapper"
                              onMouseEnter={(e) => handleInfoHover(e, t("info_info") || "")}
                              onMouseLeave={handleInfoLeave}
                            >
                              <span className="info-icon">ⓘ</span>
                            </span>
                          )}
                          {[...Array(atlas.difficulty)].map((_, index) => (
                            <img key={index} src="/interface/cerveau.png" alt="brain" className="brain-icon" />
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}
        {(isMobileView && selectedAtlas !== "") && (
          <div className="detail-header">
            <button className="back-button" onClick={() => setSelectedAtlas("")}>
              ← {t("back_to_atlases")}
            </button>
            <h2>{t(atlasFiles[selectedAtlas]?.name || "")}</h2>
          </div>
        )}

        {/* COLONNE DROITE : MODES */}
        {(!isMobileView || selectedAtlas !== "") && (
          <div className={`column-modes ${!selectedAtlas ? "disabled-section" : ""}`}>
              <div className="column-title">{t("select_game_mode")}</div>

              <div className="mode-list-grid">
                <button
                    className={`mode-option-card ${selectedMode === 'navigation' ? 'selected' : ''}`}
                    onClick={() => handleModeSelection('navigation')}
                >
                    <img src="/interface/boussole.png" alt="Nav" className="mode-icon" />
                    <div className="mode-info"><h4>{t("navigation_mode")}</h4></div>
                </button>

                <button
                    className={`mode-option-card ${selectedMode === 'practice' ? 'selected' : ''}`}
                    onClick={() => handleModeSelection('practice')}
                >
                    <img src="/interface/practice.png" alt="Prac" className="mode-icon" />
                    <div className="mode-info"><h4>{t("practice_mode")}</h4></div>
                </button>

                <button
                    className={`mode-option-card ${selectedMode === 'streak' ? 'selected' : ''}`}
                    onClick={() => handleModeSelection('streak')}
                >
                    <img src="/interface/flame.png" alt="Strk" className="mode-icon" />
                    <div className="mode-info"><h4>{t("streak_mode")}</h4></div>
                </button>

                <button
                    className={`mode-option-card ${selectedMode === 'time-attack' ? 'selected' : ''}`}
                    onClick={() => handleModeSelection('time-attack')}
                >
                    <img src="/interface/chronometer.png" alt="Time" className="mode-icon" />
                    <div className="mode-info"><h4>{t("time_attack_mode")}</h4></div>
                </button>
              </div>

              <label className="blind-mode-row">
                <input type="checkbox" checked={blindMode} onChange={() => setBlindMode(!blindMode)} />
                <span className="blind-text">{t("blind_mode")}</span>
              </label>

              <button
                className={`play-button ${selectedAtlas && selectedMode ? 'enabled' : ''}`}
                disabled={!selectedAtlas || !selectedMode}
                onClick={handlePlay}
              >
                {t("play_button")}
              </button>
            </div>
        )}

      </div>
    </div>
  );
};