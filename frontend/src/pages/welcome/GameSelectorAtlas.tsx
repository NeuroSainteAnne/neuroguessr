import { useApp } from "../../context/AppContext";
import { useGameSelector } from "../../context/GameSelectorContext";
import atlasFiles, { atlasCategories } from "../../utils/atlas_files";
import './GameSelector.css';

export const GameSelectorAtlas = () => {
  const {t} = useApp();
  const { selectedAtlas, setSelectedAtlas, selectedCategory, setSelectedCategory } = useGameSelector();

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
          .filter(([key, b]) => b.atlas_category == selectedCategory)
          .sort(([, a], [, b]) => (a.difficulty || 0) - (b.difficulty || 0))
          .map(([key, atlas]) => (
            <button key={atlas.name}
              className={selectedAtlas == key ? "panel-button selected" : "panel-button"}
              data-umami-event="select atlas" data-umami-event-atlas={key.toLowerCase()}
              onClick={() => setSelectedAtlas(key)}>
              <span className="atlas-info" dangerouslySetInnerHTML={{ __html: t(key.toLowerCase() + "_info") }}></span>
              {atlas.difficulty > 0 && (
                <span className="difficulty-icons">
                  {[...Array(atlas.difficulty)].map((_, index) => (
                    <img key={index} src="/interface/star.png" alt="Star" className="star-icon" />
                  ))}
                </span>
              )}
            </button>
          ))}
      </div>
    </div>
  </>)
}