import { useApp } from "../context/AppContext";
import { PastRegion } from "../types/types";
import "./RegionHistory.css"
import { useGame } from "./BrainViewer";
import { useState, useEffect } from "react";

const RegionHistory = ({pastRegions, niivue, highlightPastRegion, sessionName, sessionDate, onToggleSidebar, sidebarExpanded}:
        {pastRegions:PastRegion[], niivue: any, highlightPastRegion:(regionId:number, moveToCenter:boolean, allowFibers?:boolean)=>void, sessionName?: string | undefined, sessionDate?: string | undefined, onToggleSidebar?: (expanded: boolean) => void, sidebarExpanded?: boolean}) => {
    const { setAskedAtlas, atlasRegions, addHeaderMessages, t } = useApp();
    const { currentlyLoadedAtlas, startGameCallbackRef } = useGame();
    const [selectedRegionIndex, setSelectedRegionIndex] = useState<number | null>(null);

    // Helper function to get region name from atlas and regionId
    const getRegionName = (atlas: string, regionId: number): string => {
        const region = atlasRegions.find(r => r.atlas === atlas && r.id === regionId);
        return region?.name || `Region ${regionId}`;
    };

    function removeOpenMeshes() {
        if (niivue.meshes.length > 0) {
            let mesh = niivue.meshes[0]
            niivue.removeMesh(mesh)
        }
    }

    const jumpToPosition = async (position: {mm: number[], vox: number[]}, askedCenter?: number[], askedBoundary?: number[]) => {
        if (!niivue) return;
        niivue.scene.crosshairPos = niivue.mm2frac(new Float32Array(position.mm));
        niivue.createOnLocationChange();

        let nodes = [{
                name: "",
                x: position.mm[0],
                y: position.mm[1],
                z: position.mm[2],
                colorValue: 2,
                sizeValue: 1
            }]
        let edges = []
        if(askedBoundary){
            nodes.push({
                name: "",
                x: askedBoundary[0],
                y: askedBoundary[1],
                z: askedBoundary[2],
                colorValue: 3,
                sizeValue: 1
            });
            edges.push({
                first: 0,
                second: 1,
                colorValue: 4,
                sizeValue:1
            });
        }
        else if(askedCenter){
            nodes.push({
                name: "",
                x: askedCenter[0],
                y: askedCenter[1],
                z: askedCenter[2],
                colorValue: 5,
                sizeValue: 1
            });
            edges.push({
                first: 0,
                second: 1,
                colorValue: 4,
                sizeValue:1
            });
        }

        await niivue.loadConnectome({
            nodeColormap: "kry",
            nodeMinColor: 1,
            nodeMaxColor: 5,
            edgeColormap: "kry",
            edgeMin: 1,
            edgeMax: 5,
            edgeScale: 0.5,
            nodes: nodes,
            edges: edges,
            showLegend: false,
        })
        niivue.opts.meshXRay = 0.75;
        niivue.updateGLVolume();
        niivue.drawScene();
    };

    const handleHighlightRegion = (region: PastRegion) => {
        const highlightNow = () => {
          removeOpenMeshes();
          highlightPastRegion(region.regionId, region.clickedPosition?false:true);
          if(region.clickedPosition){
              jumpToPosition(region.clickedPosition, region.regionCenter, region.regionBoundary);
          }
        }
        if (region.atlas != currentlyLoadedAtlas.current){
          setAskedAtlas({atlas:region.atlas, blindMode:false})
          startGameCallbackRef.current = highlightNow;
        } else {
          highlightNow();
        }
    }

    // Update header when selectedRegionIndex changes
    useEffect(() => {
        let headerText = '';

        if (sessionName) {
            const dateStr = sessionDate ? new Date(sessionDate).toLocaleDateString('fr-FR') : '';
            const counterStr = selectedRegionIndex !== null ? `${selectedRegionIndex + 1}/${pastRegions.length}` : '';

            // Determine if it's multiplayer or single-player based on sessionName
            const isSinglePlayer = sessionName === 'Time Attack' || sessionName === 'Streak';
            const reviewPrefix = isSinglePlayer ? 'Revue de la partie' : 'Revue de la partie multijoueur';

            // Build header with structure for better styling
            headerText = `<div class="review-widget-container">
                <div class="review-widget">
                    <div class="review-title">${reviewPrefix} ${sessionName}</div>
                </div>
                ${dateStr ? `<div class="review-date">${dateStr}</div>` : ''}
                ${counterStr ? `<div class="review-counter">Guess ${counterStr}</div>` : ''}
            </div>`;
        } else {
            headerText = t("answers_summary");
        }

        addHeaderMessages([{
            text: headerText,
            minDuration: 0,
            forceClear: true
        }]);
    }, [sessionName, sessionDate, selectedRegionIndex, pastRegions.length, addHeaderMessages, t]);

    // Handle keyboard navigation (left/right arrows)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (selectedRegionIndex !== null && selectedRegionIndex > 0) {
                    const newIndex = selectedRegionIndex - 1;
                    setSelectedRegionIndex(newIndex);
                    const region = pastRegions[newIndex];
                    if (region) handleHighlightRegion(region);
                }
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (selectedRegionIndex !== null && selectedRegionIndex < pastRegions.length - 1) {
                    const newIndex = selectedRegionIndex + 1;
                    setSelectedRegionIndex(newIndex);
                    const region = pastRegions[newIndex];
                    if (region) handleHighlightRegion(region);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedRegionIndex, pastRegions]);

    const selectedRegion = selectedRegionIndex !== null ? pastRegions[selectedRegionIndex] : null;
    const getRegionNameFromId = (atlas: string, regionId: number): string => {
        const region = atlasRegions.find(r => r.atlas === atlas && r.id === regionId);
        return region?.name || `Region ${regionId}`;
    };

    return <div className="region-summary">
      <div className="region-summary-header">
        <h3>{t("review") || "Review"}</h3>
        <button
          className="sidebar-toggle-button"
          onClick={() => onToggleSidebar && onToggleSidebar(!sidebarExpanded)}
          title={sidebarExpanded ? "Réduire la barre" : "Agrandir la barre"}
        >
          {sidebarExpanded ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          )}
        </button>
      </div>

      {selectedRegion && (
        <div className="region-detail-panel">
          <div className="region-detail-item">
            <span className="region-detail-label">{t("expected")}</span>
            <span className="region-detail-value">{getRegionNameFromId(selectedRegion.atlas, selectedRegion.regionId)}</span>
          </div>
          {selectedRegion.clickedPosition && (
            <div className="region-detail-item">
              <span className="region-detail-label">{t("clicked_on")}</span>
              <span className="region-detail-value">
                {selectedRegion.clickedRegionName || (
                  <>
                    <span style={{fontFamily: 'monospace', fontSize: '0.9em'}}>
                      [{selectedRegion.clickedPosition?.mm?.[0] ? Math.round(selectedRegion.clickedPosition.mm[0]) : 0}, {selectedRegion.clickedPosition?.mm?.[1] ? Math.round(selectedRegion.clickedPosition.mm[1]) : 0}, {selectedRegion.clickedPosition?.mm?.[2] ? Math.round(selectedRegion.clickedPosition.mm[2]) : 0}]
                    </span>
                  </>
                )}
              </span>
            </div>
          )}
          {selectedRegion.distance !== -1 && (
            <div className="region-detail-item">
              <span className="region-detail-label">{t("distance")}</span>
              <span className="region-detail-value">{selectedRegion.distance === 0 ? t("correct_answer") : Math.round(selectedRegion.distance) + "mm"}</span>
            </div>
          )}
        </div>
      )}

      {selectedRegionIndex === null && (
        <div className="review-init-message">
          <p>Cliquer sur une région pour commencer la revue de votre partie</p>
        </div>
      )}

      <div className="region-list">
        {pastRegions.map((region, index) => (
          <div
            key={index}
            className={`region-item ${region.isCorrect ? 'correct' : 'incorrect'} ${selectedRegionIndex === index ? 'selected' : ''}`}
            onClick={() => { setSelectedRegionIndex(index); handleHighlightRegion(region); }}
          >
            <span className="region-number">{index + 1}.</span>
            <span className="region-name">{getRegionName(region.atlas, region.regionId)}</span>
            {region.distance == -1
              ? <span className="region-score no-guess">{t("no_guess")}</span>
              : region.distance
                ? <span className="region-score distance">{Math.round(region.distance)}mm</span>
                : <span className="region-score correct-score">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </span>
            }
            {/*<button
              className="highlight-region-button"
              onClick={(e) => { e.stopPropagation(); handleHighlightRegion(region); }}
              title={t("highlight_region")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="22" y1="12" x2="18" y2="12"/>
                <line x1="6" y1="12" x2="2" y2="12"/>
                <line x1="12" y1="6" x2="12" y2="2"/>
                <line x1="12" y1="22" x2="12" y2="18"/>
              </svg>
            </button>*/}
          </div>
        ))}
      </div>

      {selectedRegionIndex !== null && (
        <div className="region-navigation">
          <button
            className="nav-button"
            onClick={() => {
              const newIndex = Math.max(0, selectedRegionIndex - 1);
              setSelectedRegionIndex(newIndex);
              const region = pastRegions[newIndex];
              if (region) handleHighlightRegion(region);
            }}
            disabled={selectedRegionIndex === 0}
            title={t("previous_guess")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span className="nav-counter">{selectedRegionIndex + 1} / {pastRegions.length}</span>
          <button
            className="nav-button"
            onClick={() => {
              const newIndex = Math.min(pastRegions.length - 1, selectedRegionIndex + 1);
              setSelectedRegionIndex(newIndex);
              const region = pastRegions[newIndex];
              if (region) handleHighlightRegion(region);
            }}
            disabled={selectedRegionIndex === pastRegions.length - 1}
            title={t("next_guess")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      )}
    </div>
}

export default RegionHistory;