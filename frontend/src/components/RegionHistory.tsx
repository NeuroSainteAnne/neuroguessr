import { LabelAnchorPoint } from "@niivue/niivue";
import { useApp } from "../context/AppContext";
import { PastRegion } from "../types";
import "./RegionHistory.css"
import { useGame } from "./BrainViewer";

const RegionHistory = ({pastRegions, niivue, highlightPastRegion}:
        {pastRegions:PastRegion[], niivue: any, highlightPastRegion:(regionId:number, moveToCenter:boolean, allowFibers?:boolean)=>void}) => {
    const { setAskedAtlas } = useApp();
    const { currentlyLoadedAtlas, startGameCallbackRef } = useGame();
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
              jumpToPosition(region.clickedPosition, region.atlas, region.regionCenter);
          }
        }
        if (region.atlas != currentlyLoadedAtlas.current){
          setAskedAtlas({atlas:region.atlas, blindMode:false})
          startGameCallbackRef.current = highlightNow;
        } else {
          highlightNow();
        }
    }
    const jumpToPosition = async (position: {mm: number[], vox: number[]}, atlas: string, askedCenter?: number[]) => {
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
        if(askedCenter){
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