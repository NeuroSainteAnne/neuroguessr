import { useApp } from "../context/AppContext";
import { PastRegion } from "../types";
import "./RegionHistory.css"

const RegionHistory = ({pastRegions, highlightPastRegion}:{pastRegions:PastRegion[], highlightPastRegion:(regionId:number)=>void}) => {
    const { t } = useApp();
    return <div className="region-summary">
      <h3>{t("answers_summary")}</h3>
      <div className="region-list">
        {pastRegions.map((region, index) => (
          <div 
            key={index}
            className={`region-item ${region.isCorrect ? 'correct' : 'incorrect'}`}
          >
            <span className="region-number">{index + 1}.</span>
            <span className="region-name">{region.regionName}</span>
            <span className="region-score">{region.distance == -1 ?t("no_guess"):(region.distance?`${Math.round(region.distance)}mm`:``)}</span>
            <button 
              className="highlight-region-button"
              onClick={() => highlightPastRegion(region.regionId)}
              title={t("highlight_region")}
            >
              <i className="fas fa-crosshairs"></i>
            </button>
          </div>
        ))}
      </div>
    </div>
}

export default RegionHistory;