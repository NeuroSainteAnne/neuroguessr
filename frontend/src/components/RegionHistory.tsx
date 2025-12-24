import { useApp } from "../context/AppContext";
import { PastRegion } from "../types/types";
import "./RegionHistory.css"
import { useGame } from "./BrainViewer";

const RegionHistory = ({pastRegions, niivue, highlightPastRegion}:
        {pastRegions:PastRegion[], niivue: any, highlightPastRegion:(regionId:number, moveToCenter:boolean, allowFibers?:boolean)=>void}) => {
    const { setAskedAtlas, atlasRegions } = useApp();
    const { currentlyLoadedAtlas, startGameCallbackRef } = useGame();
    
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

    const { t } = useApp();
    return <div className="region-summary">
      <h3>{t("answers_summary")}</h3>
      <div className="answers-info" dangerouslySetInnerHTML={{__html: t("answers_info")}}></div>
      <div className="region-list">
        {pastRegions.map((region, index) => (
          <div 
            key={index}
            className={`region-item ${region.isCorrect ? 'correct' : 'incorrect'}`}
          >
            <span className="region-number">{index + 1}.</span>
            <span className="region-name">{getRegionName(region.atlas, region.regionId)}</span>
            <span className="region-score">{region.distance == -1 ?t("no_guess"):(region.distance?`${Math.round(region.distance)}mm`:``)}</span>
            <button 
              className="highlight-region-button"
              onClick={() => {
                handleHighlightRegion(region)
              }}
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