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
            <button className="dropbtn" data-umami-event="open viewer options">
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
                <button className={viewerOptions.displayType == "Axial" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                     data-umami-event="set viewer options" data-umami-event-option="display type" data-umami-event-displaytype="axial"
                    onClick={() => updateViewerOptions({ displayType: "Axial" })}>{t("axial")}</button>
                <button className={viewerOptions.displayType == "Sagittal" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                     data-umami-event="set viewer options" data-umami-event-option="display type" data-umami-event-displaytype="sagittal"
                    onClick={() => updateViewerOptions({ displayType: "Sagittal" })}>{t("sagittal")}</button>
                <button className={viewerOptions.displayType == "Coronal" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                     data-umami-event="set viewer options" data-umami-event-option="display type" data-umami-event-displaytype="coronal"
                    onClick={() => updateViewerOptions({ displayType: "Coronal" })}>{t("coronal")}</button>
                <button className={viewerOptions.displayType == "Render" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                     data-umami-event="set viewer options" data-umami-event-option="display type" data-umami-event-displaytype="render"
                    onClick={() => updateViewerOptions({ displayType: "Render" })}>{t("render")}</button>
                <button className={viewerOptions.displayType == "MultiPlanar" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                     data-umami-event="set viewer options" data-umami-event-option="display type" data-umami-event-displaytype="multiplanar"
                    onClick={() => updateViewerOptions({ displayType: "MultiPlanar" })}>{t("multiplanar")}</button>
                <button className={viewerOptions.displayType == "MultiPlanarRender" ? "viewBtn dropdown-item-checked" : "viewBtn"}
                     data-umami-event="set viewer options" data-umami-event-option="display type" data-umami-event-displaytype="multiplanar render"
                    onClick={() => updateViewerOptions({ displayType: "MultiPlanarRender" })}>{t("multiplanar_render")}</button>
                <button className={viewerOptions.radiologicalOrientation ? "viewBtn dropdown-item-checked" : "viewBtn"}
                     data-umami-event="set viewer options" data-umami-event-option="orientation" data-umami-event-orientation={viewerOptions.radiologicalOrientation ? "neurological" : "radiological"}  
                    onClick={() => updateViewerOptions({ radiologicalOrientation: !viewerOptions.radiologicalOrientation })}>
                    {t("radiological")}
                </button>
                <button className={viewerOptions.displayAtlas ? "viewBtn dropdown-item-checked" : "viewBtn"}
                     data-umami-event="set viewer options" data-umami-event-option="show atlas" data-umami-event-showatlas={viewerOptions.displayAtlas ? "off" : "on"}  
                    onClick={() => updateViewerOptions({ displayAtlas: !viewerOptions.displayAtlas })}>
                    {t("colored_atlas")}
                </button>
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