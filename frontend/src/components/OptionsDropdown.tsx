import { DisplayOptions } from '../types';
import { useApp } from '../context/AppContext';
import "./OptionsDropdown.css";

function OptionsDropdown() {
    const { t, viewerOptions, setViewerOption } = useApp();
    const updateViewerOptions = (e: Partial<DisplayOptions>) => {
        const newOptions = { ...viewerOptions, ...e };
        setViewerOption(newOptions);
    }

    return (<>
        <div className="dropdown">
            <button className="dropbtn">
                {t("view_options")}
                <span className="hamburger">
                    <svg width="24" height="18" viewBox="0 0 24 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 1H24" stroke="white" strokeWidth="1.5" />
                        <path d="M0 9H24" stroke="white" strokeWidth="1.5" />
                        <path d="M0 17H24" stroke="white" strokeWidth="1.5" />
                    </svg>
                </span>
            </button>
            <div className="dropdown-content">
                <a className={viewerOptions.displayType == "Axial" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                    onClick={() => updateViewerOptions({ displayType: "Axial" })}>{t("axial")}</a>
                <a className={viewerOptions.displayType == "Sagittal" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                    onClick={() => updateViewerOptions({ displayType: "Sagittal" })}>{t("sagittal")}</a>
                <a className={viewerOptions.displayType == "Coronal" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                    onClick={() => updateViewerOptions({ displayType: "Coronal" })}>{t("coronal")}</a>
                <a className={viewerOptions.displayType == "Render" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                    onClick={() => updateViewerOptions({ displayType: "Render" })}>{t("render")}</a>
                <a className={viewerOptions.displayType == "MultiPlanar" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                    onClick={() => updateViewerOptions({ displayType: "MultiPlanar" })}>{t("multiplanar")}</a>
                <a className={viewerOptions.displayType == "MultiPlanarRender" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                    onClick={() => updateViewerOptions({ displayType: "MultiPlanarRender" })}>{t("multiplanar_render")}</a>
                <a className={viewerOptions.radiologicalOrientation ? "viewBtn dropdown-item-checked" : "viewBtn"}
                    onClick={() => updateViewerOptions({ radiologicalOrientation: !viewerOptions.radiologicalOrientation })}>
                    {t("radiological")}
                </a>
                <a className={viewerOptions.displayAtlas ? "viewBtn dropdown-item-checked" : "viewBtn"}
                    onClick={() => updateViewerOptions({ displayAtlas: !viewerOptions.displayAtlas })}>
                    {t("colored_atlas")}
                </a>
                <div className="slider-container">
                    <label className="slider-label" htmlFor="alphaSlider">{t("atlas_opacity")}</label>
                    <input
                        type="range"
                        min="0"
                        max="255"
                        defaultValue={ Math.round(viewerOptions.displayOpacity * 255) }
                        onChange={(e) => {
                            const value = parseInt(e.target.value, 10);
                            updateViewerOptions({ displayOpacity: value / 255 });
                        }}
                        className="slider"
                        id="alphaSlider"
                    />
                </div>
            </div>
        </div>
    </>)
}

export default OptionsDropdown;