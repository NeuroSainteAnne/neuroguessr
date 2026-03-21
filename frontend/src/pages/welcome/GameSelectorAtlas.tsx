import { useApp } from "../../context/AppContext";
import { useGameSelector } from "../../context/GameSelectorContext";
import atlasFiles, { atlasCategories } from "../../utils/atlas_files";
import { prefetchAtlasJSON } from "../../utils/nifti_cache";
import './GameSelector.css';

export const GameSelectorAtlas = () => {
  const {t, preloadAtlas, showTooltip, hideTooltip, pageContext} = useApp();
  const { selectedAtlas, setSelectedAtlas, selectedCategory, setSelectedCategory } = useGameSelector();
  const parts = pageContext.urlPathname.split('/')
  const welcomeSubPage = parts[2] || 'singleplayer'

  const handleAtlasSelection = async (atlasKey: string) => {
    setSelectedAtlas(atlasKey);
    
    // Start preloading the selected atlas
    try {
      preloadAtlas(atlasKey);
      prefetchAtlasJSON(atlasKey);
    } catch (error) {
      console.error(`Failed to preload atlas ${atlasKey}:`, error);
      // Don't show user notification for preload failures - it's not critical
    }
  };

  const handleInfoHover = (e: React.MouseEvent<HTMLSpanElement>, infoText: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    showTooltip(infoText, rect.left + rect.width / 2, rect.top - 8);
  };

  const handleInfoLeave = () => {
    hideTooltip();
  };

  return (<>
    <div className="atlas-layout">
      <div className="category-list">
        {atlasCategories.map((category) => (
          <button key={category}
            className={selectedCategory == category ? "category-button selected" : "category-button"}
            data-umami-event="select atlas category" data-umami-event-category={category}
            onClick={() => { setSelectedCategory(category) }}>
            {t(category)}
          </button>
        ))}
      </div>
      <div className="atlas-choices-display">
        {Object.entries(atlasFiles)
          .filter(([_key, b]) => b.atlas_category == selectedCategory)
          .sort(([, a], [, b]) => (a.difficulty || 0) - (b.difficulty || 0))
          .map(([key, atlas]) => (
            <button key={atlas.name}
              className={selectedAtlas == key ? "panel-button selected" : "panel-button"}
              data-umami-event="select atlas" data-umami-event-atlas={key.toLowerCase()}
              onClick={() => handleAtlasSelection(key)}>
              <span className="atlas-info" dangerouslySetInnerHTML={{ __html: t(key.toLowerCase() + "_info") }}></span>
              {atlas.difficulty > 0 && (
                <span className="difficulty-icons">
                  {[...Array(atlas.difficulty)].map((_, index) => (
                    <img key={index} src="/interface/star.png" alt="Star" className="star-icon" />
                  ))}
                </span>
              )}
              {atlas.info && welcomeSubPage == "singleplayer" && (
                <span 
                  className="info-icon-wrapper"
                  onMouseEnter={(e) => handleInfoHover(e, t("info_info"))}
                  onMouseLeave={handleInfoLeave}
                >
                  <span className="info-icon">ℹ️</span>
                </span>
              )}
            </button>
          ))}
      </div>
    </div>
  </>)
}