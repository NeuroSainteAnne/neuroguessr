import React, { useEffect, useRef, useState } from 'react';
import { GameSelectorAtlas } from '../GameSelectorAtlas';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../../../context/AppContext';
import { ColorMap, ExternalGameCommands, MultiplayerParametersType } from '../../../types';
import { isTokenValid, refreshToken } from '../../../utils/helper_login';
import { useGameSelector } from '../../../context/GameSelectorContext';
import { navigate } from 'vike/client/router';
import { Socket, io } from 'socket.io-client';
import "./MultiplayerConfigScreen.css"
import Joi from "joi";
import atlasFiles, { atlasCategories } from '../../../utils/atlas_files';
import { fetchJSON } from '../../../helper_niivue';
import { add, set } from 'date-fns';

const externalGameCommandsSchema = Joi.array().items(
  Joi.object({
    action: Joi.string().valid("load-atlas", "guess").required(),
    atlas: Joi.string().optional(),
    regionId: Joi.number().integer().optional(),
    duration: Joi.number().integer().min(1).required(),
  }).required()
);

const validateExternalGameCommands = (commands: ExternalGameCommands[]): Joi.ValidationResult => {
  if (!commands.length) throw "No command given"
  return externalGameCommandsSchema.validate(commands, { abortEarly: false });
};

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;
const LOAD_ATLAS_DURATION = 10;

const MultiplayerConfigScreen = () => {
    const { t, authToken, userUsername, currentLanguage, copyToClipboard } = useApp();
    const { selectedAtlas, setSelectedAtlas } = useGameSelector();
    const [sessionCode, setSessionCode] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const [numRegions, setNumRegions] = useState<number>(DEFAULT_REGION_NUMBER);
    const [durationPerRegion, setDurationPerRegion] = useState<number>(DEFAULT_DURATION_PER_REGION);
    const [blindMode, setBlindMode] = useState(false);
    const [gameoverOnError, setGameoverOnError] = useState<boolean>(DEFAULT_GAMEOVER_ON_ERROR);
    const [isPublic, setIsPublic] = useState<boolean>(false);
    const parametersRef = useRef<MultiplayerParametersType>({
        atlas: undefined,
        regionsNumber: DEFAULT_REGION_NUMBER,
        durationPerRegion: DEFAULT_DURATION_PER_REGION,
        gameoverOnError: DEFAULT_GAMEOVER_ON_ERROR,
        blindMode: false,
        commands: undefined
    })
    const [copiedIcon, setCopiedIcon] = useState<null | "code" | "link">(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
    const showAdvancedSettingsRef = useRef<boolean>(false);
    const [advancedMode, setAdvancedMode] = useState<"ui"|"code">("ui");
    const advancedModeRef = useRef<"ui"|"code">("ui");
    const [advancedSettingsJSON, setAdvancedSettingsJSON] = useState<string>("[]");
    const advancedSettingsJSONRef = useRef<string>("[]");
    const [advancedSettingsError, setAdvancedSettingsError] = useState<string | null>(null);
    const [advancedLastAtlas, setAdvancedLastAtlas] = useState<string | null>(null);
    const [isValidatedJSON, setIsValidatedJSON] = useState(false);
    const [isSavedAdvanced, setIsSavedAdvanced] = useState(false);
    const [listRegions, setListRegions] = useState<string[]|null>(null)
    const [advancedDurationPerRegion, setAdvancedDurationPerRegion] = useState<number>(DEFAULT_DURATION_PER_REGION);
    const [advancedPresets, setAdvancedPresets] = useState<{ id: number; name: string; settings: string }[]>([]);
    const [forcePresetReload, setForcePresetReload] = useState<number>(0);
    const [expandedAtlases, setExpandedAtlases] = useState<{ [key: number]: boolean }>({});
    const [atlasRegionNames, setAtlasRegionNames] = useState<{ [atlasKey: string]: string[] }>({});
    const [totalDuration, setTotalDuration] = useState<number>(0);

    const createSession = async () => {
        setLoading(true);
        setError(null);
        // Check if the player is logged in
        if (!authToken) {
            setError('Please log in');
            return;
        }
        if (!isTokenValid(authToken)) {
            setError('Please log in');
            return;
        }
        if (!refreshToken()) {
            setError('Please log in again');
            return;
        }
        try {
            const response = await fetch('/api/create-multiplayer-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ isPublic, atlas: selectedAtlas || undefined, blindMode })
            });
            if (!response.ok) {
                const result = await response.json();
                setError(result.message || 'Failed to create session');
                setLoading(false);
                return;
            }
            const result = await response.json();
            setSessionCode(result.sessionCode);
            setSessionId(result.sessionId);
            setSessionToken(result.sessionToken);
        } catch (err) {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (sessionCode && sessionToken && userUsername && authToken) {
            // Create socket connection
            const socket = io('/', {
                path: '/socket.io',
                transports: ['polling', 'websocket'], // Start with polling first, then try websocket
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                timeout: 20000,
                forceNew: true
            });
            socketRef.current = socket;
            
            // Connection events
            socket.on('connect', () => {
                console.log('Socket connected');
                
                // Join the lobby
                socket.emit('join-lobby', {
                    sessionCode,
                    userName: userUsername,
                    isAnonymous: false,
                    token: authToken
                });
            });
            
            // Connection error
            socket.on('connect_error', (err) => {
                setError(`Connection error: ${err.message}`);
            });
            socket.on('error', (data) => {
                setError(data.message);
            });
            socket.on('fatal-error', (data) => {
                setError(data.message);
            });
            socket.on('lobby-users', (data) => {
                if (Array.isArray(data.users)) {
                    setLobbyUsers(data.users);
                }
            });
            socket.on('player-joined', (data) => {
                if (data.userName) {
                    setLobbyUsers(prev => Array.from(new Set([...prev, data.userName])));
                }
            });
            socket.on('player-left', (data) => {
                if (data.userName) {
                    setLobbyUsers(prev => prev.filter(u => u !== data.userName));
                }
            });
            socket.on('parameters-updated', (data) => {
                if(data && data.parameters && data.parameters.totalDuration) {
                    setTotalDuration(data.parameters.totalDuration);
                }
            });
            socket.on('parameters-has-updated', (data) => {
                if (data && data.success) {
                    setIsValidatedJSON(true)
                }
            });
            return () => {
                if (socketRef.current) {
                    socketRef.current.disconnect();
                    socketRef.current = null;
                }
            };
        }
    }, [sessionCode, sessionToken, userUsername, authToken]);

    const updateParameters = async (newParameters : Partial<MultiplayerParametersType>) => {
        if(!socketRef.current) return;
        parametersRef.current = {...parametersRef.current, ...newParameters}
        if(parametersRef && parametersRef.current && !parametersRef.current.commands){
            const generatedCommands = [
                { action: "load-atlas", atlas: parametersRef.current.atlas, duration: LOAD_ATLAS_DURATION },
                ...Array.from({ length: parametersRef.current.regionsNumber }, (_, i) => ({
                    action: "guess",
                    duration: durationPerRegion,
                })),
            ];
            setAdvancedSettingsJSON(JSON.stringify(generatedCommands, null, 2))
        }
        // Send updated parameters to the server
        if (sessionCode && sessionToken) {
            try {
                socketRef.current.emit('update-parameters', {
                    sessionCode,
                    sessionToken,
                    parameters: parametersRef.current
                });
            } catch (err) {
                setError('Failed to update parameters');
                throw String(err)
            }
        }
    }

    const handleShowAdvancedBox = () => {
        setIsValidatedJSON(false);
        setShowAdvancedSettings(true);
        if(selectedAtlas) setAdvancedLastAtlas(selectedAtlas)
    }

    useEffect(()=>{
        setIsValidatedJSON(false);
        setIsSavedAdvanced(false);
        if(!advancedSettingsJSON){
            setAdvancedSettingsJSON("[]")
            advancedSettingsJSONRef.current = "[]";
            return;
        }
        try {
            advancedSettingsJSONRef.current = advancedSettingsJSON;
            const parsedJSON = JSON.parse(advancedSettingsJSON);
            const loadAtlasCommand = [...parsedJSON].reverse().find((command: any) => command.action === "load-atlas" && command.atlas);
            if (loadAtlasCommand) {
                setAdvancedLastAtlas(loadAtlasCommand.atlas); // Update the last atlas based on the JSON
            } else {
                setAdvancedLastAtlas(null); // Reset if no atlas is found
            }
            if (textareaRef.current) {
                textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
            }
            if(showAdvancedSettingsRef.current && advancedModeRef.current === "ui"){
                const success = validateExternalGameCommands(parsedJSON);
                if (!success) {
                    setAdvancedSettingsError(t("invalid_json_structure") || "Invalid JSON structure");
                    return;
                }
                setAdvancedSettingsError(null);
                updateParameters({ commands: parsedJSON }); // Send the validated JSON to the server
            }
        } catch (err) {
            setAdvancedLastAtlas(null); // Reset if JSON is invalid
        }
    }, [advancedSettingsJSON])

    useEffect(() => {
        showAdvancedSettingsRef.current = showAdvancedSettings;
    }, [showAdvancedSettings]);
    useEffect(() => {
        advancedModeRef.current = advancedMode;
    }, [advancedMode]);

    useEffect(() => {
        if (!showAdvancedSettings) return;
        const preloadAtlasRegionNames = async () => {
            const regionNames: { [atlasKey: string]: string[] } = {};
            await Promise.all(
                Object.entries(atlasFiles).map(async ([key, atlas]) => {
                    try {
                        const response = await fetchJSON(`/atlas/descr/${currentLanguage}/${atlas.json}`);
                        regionNames[key] = response.labels || [];
                    } catch (err) {
                        console.error(`Failed to load regions for atlas ${key}:`, err);
                        regionNames[key] = []; // Fallback to an empty array if the fetch fails
                    }
                })
            );
            setAtlasRegionNames(regionNames);
        };
        preloadAtlasRegionNames();
    }, [showAdvancedSettings, currentLanguage]);

    useEffect(()=>{
        if(!advancedLastAtlas) return
        const selectedAtlasFiles = atlasFiles[advancedLastAtlas];
        fetchJSON("/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json).then((jsonData: ColorMap) => {
            setListRegions(jsonData.labels)
        });
    }, [advancedLastAtlas])

    useEffect(()=>{
        if(selectedAtlas){
            updateParameters({atlas:selectedAtlas})
        } else {
            updateParameters({atlas:undefined})
        }
    }, [selectedAtlas])

    useEffect(() => {
        createSession()
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        }
    }, [])

    useEffect(() => {
        const fetchPresets = async () => {
            try {
                const response = await fetch('/api/advanced-game/settings-list', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                    },
                });
                if (!response.ok) {
                    console.error("Failed to fetch presets");
                    return;
                }
                const result = await response.json();
                setAdvancedPresets(result);
            } catch (err) {
                console.error("Error fetching presets:", err);
            }
        };

        fetchPresets();
    }, [authToken, ]);

    const handleSaveAdvancedSettings = async () => {
        setAdvancedSettingsError(null);
        setIsSavedAdvanced(false);
        const name = prompt(t("enter_settings_name") || "Enter a name for your advanced settings:");
        if (!name) {
            setAdvancedSettingsError(t("name_required") || "Name is required.");
            return;
        }
        try {
            // Check if the name already exists
            const response = await fetch(`/api/advanced-game/check-name?name=${encodeURIComponent(name)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            if (!response.ok) {
                const result = await response.json();
                setAdvancedSettingsError(result.message || t("failed_to_check_name") || "Failed to check name availability.");
                return;
            }

            const result = await response.json();
            let existingId = null;
            if (result.exists) {
                const overwrite = confirm(
                    t("name_already_exists_overwrite") || 
                    "Name already exists. Do you want to overwrite the existing settings?"
                );
                if (!overwrite) {
                    setAdvancedSettingsError(t("overwrite_cancelled") || "Overwrite cancelled.");
                    return;
                }
                existingId = result.id;
            }

            // Save the advanced settings
            const saveResponse = await fetch(existingId?'/api/advanced-game/update':'/api/advanced-game/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify(existingId?
                {
                    id: existingId,
                    settings: advancedSettingsJSONRef.current
                }
                :{
                    name,
                    settings: advancedSettingsJSONRef.current,
                    public: false, // Default to private
                }),
            });

            if (!saveResponse.ok) {
                const saveResult = await saveResponse.json();
                setAdvancedSettingsError(saveResult.message || t("failed_to_save_settings") || "Failed to save settings.");
                return;
            }

            const saveResult = await saveResponse.json();
            setAdvancedSettingsError(null);
            setIsSavedAdvanced(true);
            setForcePresetReload(prev => prev + 1); // Trigger a reload of presets
        } catch (err) {
            console.error("Error saving advanced settings:", err);
            setAdvancedSettingsError(t("unexpected_error") || "An unexpected error occurred.");
        }
    }

    const parseJSONByAtlas = (json: string) => {
        try {
            const parsedJSON = JSON.parse(json);
            const groupedByAtlas: { atlas: string; duration: number; blindMode: boolean; regions: { regionId: number; duration: number }[] }[] = [];
            let currentAtlas: { atlas: string; duration: number; blindMode: boolean; regions: { regionId: number; duration: number }[] } | null = null;

            parsedJSON.forEach((action: any) => {
                if (action.action === "load-atlas") {
                    if (currentAtlas) {
                        groupedByAtlas.push(currentAtlas);
                    }
                    currentAtlas = {
                        atlas: action.atlas,
                        duration: action.duration,
                        blindMode: action.blindMode || false,
                        regions: [],
                    };
                } else if (action.action === "guess" && currentAtlas) {
                    currentAtlas.regions.push({
                        regionId: action.regionId,
                        duration: action.duration,
                    });
                }
            });

            if (currentAtlas) {
                groupedByAtlas.push(currentAtlas);
            }

            return groupedByAtlas;
        } catch (err) {
            console.error("Failed to parse JSON:", err);
            return [];
        }
    };

    const removeAtlas = (atlasIndex: number) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        groupedByAtlas.splice(atlasIndex, 1); // Remove the atlas at the specified index
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const renderAtlasBlocks = () => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);

        return groupedByAtlas.map((atlas, atlasIndex) => {
            
            const atlasName = atlasFiles[atlas.atlas]?.name || atlas.atlas;
            const totalRegions = atlas.regions.length; // Calculate the total number of regions
            const regionNames = atlasRegionNames[atlas.atlas] || []; // Get preloaded region names

            return (<>
                <div key={`atlas_${atlasIndex}`}>
                    <div className="atlas-header" onClick={() => toggleAtlasCollapse(atlasIndex)}>
                        <div className="atlas-header-left">
                            <span className={`arrow ${expandedAtlases[atlasIndex] ? "expanded" : "collapsed"}`}>
                                ▶
                            </span>
                            <div>{t(atlasName)}</div>
                            <span className="region-count">
                                ({t("regions") || "Regions"}: {totalRegions})
                            </span>
                        </div>
                        <div className="atlas-header-right">
                            <label className="header-label">
                                {t("loading_duration") || "Loading Duration"}:
                                <input
                                    type="number"
                                    min={5}
                                    max={30}
                                    value={atlas.duration}
                                    onChange={(e) => updateAtlasDuration(atlasIndex, Number(e.target.value))}
                                    onClick={(e) => { e.stopPropagation(); }}
                                />
                            </label>
                            <label className="header-label">
                                {t("blind_mode") || "Blind Mode"}:
                                <input
                                    type="checkbox"
                                    checked={atlas.blindMode}
                                    onChange={(e) => updateAtlasBlindMode(atlasIndex, e.target.checked)}
                                    onClick={(e) => { e.stopPropagation(); }}
                                />
                            </label>
                            <button
                                className="remove-atlas-button"
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent collapsing/expanding when clicking the button
                                    removeAtlas(atlasIndex);
                                }}
                                title={t("remove_atlas") || "Remove Atlas"}
                            >
                                <i className="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    {expandedAtlases[atlasIndex] && (
                        <div className="region-blocks">
                            {atlas.regions.map((region, regionIndex) => (
                                <div key={`region_${atlasIndex}_${regionIndex}`} className="region-block">
                                    <div className="atlas-block-left">
                                        <span>
                                            {t("region_name") || "Region"} {region.regionId}: {region.regionId ? (regionNames[region.regionId] || t("unknown_region") || "Unknown Region") : (t("random_region") || "Random Region")}
                                        </span>
                                    </div>
                                    <div className="atlas-block-right">
                                        <label className="block-label">
                                            {t("region_duration") || "Duration"}:&nbsp;
                                            <input
                                                type="number"
                                                min={5}
                                                max={30}
                                                value={region.duration}
                                                onChange={(e) => updateRegionDuration(atlasIndex, regionIndex, Number(e.target.value))}
                                            />
                                        </label>
                                        <button onClick={() => removeRegion(atlasIndex, regionIndex)} className="remove-block-button">
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <div className='region-picker-ui'>
                                {renderRegionPicker(atlas.atlas)}
                            </div>
                        </div>
                    )}
                </div>
            </>)
        });
    };

    const renderRegionPicker = (atlasKey: string) => {
        const regionNames = atlasRegionNames[atlasKey] || []; // Get preloaded region names
        return (<>
            <label htmlFor="region-picker">
                {t("add_new_region") || "Add New Region"}
            </label>
            <select
            id="region-picker"
            className="region-picker"
            value="" // Always reset to the blank option after a change
            onChange={(e) => {
                const newRegion = e.target.value;
                if(newRegion === "") return;
                // Update the JSON with the new region
                try {
                    const parsedJSON = JSON.parse(advancedSettingsJSON);
                    const newRegionLine : {action: string, duration: number, regionId?: number} = { 
                        action: "guess", 
                        duration: advancedDurationPerRegion || DEFAULT_DURATION_PER_REGION 
                    }
                    if(newRegion !== "random") newRegionLine.regionId = Number(newRegion)
                    const updatedJSON = [
                        ...parsedJSON,
                        newRegionLine,
                    ];
                    setAdvancedSettingsJSON(JSON.stringify(updatedJSON, null, 2));
                } catch (err) {
                    setAdvancedSettingsError(t("invalid_json") || "Invalid JSON format");
                }
                e.target.value = "";
                e.target.blur();
            }}
            >
            <option value=""></option>
            <option value="random">{t("random_region") || "Random Region"}</option>
                {regionNames.filter((_, value) => value !== 0).map((key, value) => (
                    <option value={value+1} key={"region_"+value}>
                        {key}
                    </option>
                ))}
            </select>
        </>)
    }

    const renderAtlasPicker = () => {
        return (<>
            <label htmlFor="atlas-picker" className="atlas-picker-header">
                {t("add_atlas") || "Add Atlas"}
            </label>
            <select
                id="atlas-picker"
                value={""}
                className='atlas-picker'
                onChange={addAtlas}
            >
                <option value="" key="atlas_blank"></option>
                {atlasCategories.map((category) => (
                    <optgroup label={t(category)} key={`category_${category}`}>
                        {Object.entries(atlasFiles)
                            .filter(([key, atlas]) => atlas.atlas_category === category)
                            .sort(([, a], [, b]) => (a.difficulty || 0) - (b.difficulty || 0))
                            .map(([key, atlas]) => (
                            <option value={key} key={`atlas__${category}_${key}`}>
                                {t(atlas.name)}
                            </option>
                            ))}
                    </optgroup>
                ))}
            </select>
        </>)
    }

    const renderAdvancedButtons = () => {
        return (<>
            {advancedSettingsError && <div style={{ color: "red", marginBottom: "10px" }}>{advancedSettingsError}</div>}
            <div className="advanced-settings-buttons">
                {advancedMode === "code" && <button
                    className="advanced-settings-validation"
                    style={{backgroundColor:(isValidatedJSON?"#4caf50":"orange")}}
                    onClick={() => {
                        try {
                            const parsedJSON = JSON.parse(advancedSettingsJSON);
                            // Validate the JSON structure
                            const success = validateExternalGameCommands(parsedJSON);
                            if (!success) {
                                setAdvancedSettingsError(t("invalid_json_structure") || "Invalid JSON structure");
                                return;
                            }
                            setAdvancedSettingsError(null);
                            updateParameters({ commands: parsedJSON }); // Send the validated JSON to the server
                        } catch (err) {
                            setAdvancedSettingsError(String(err) || t("invalid_json"));
                        }
                    }}
                >
                {t("validate_settings") || "Validate Settings"}
                </button>}
                <button
                    style={{backgroundColor:(isValidatedJSON?(isSavedAdvanced?"#4caf50":"#21669f"):"#6665"), 
                        cursor:(isValidatedJSON?(isSavedAdvanced?"not-allowed":"pointer"):"not-allowed")}}
                    disabled={!isValidatedJSON}
                    onClick={isValidatedJSON?handleSaveAdvancedSettings:()=>{}}
                    >💾</button>
                <button
                    style={{backgroundColor:(isValidatedJSON?"#21669f":"#6665"), 
                        cursor:(isValidatedJSON?(isSavedAdvanced?"not-allowed":"pointer"):"not-allowed")}}
                    disabled={!isValidatedJSON}
                    onClick={()=>{setAdvancedMode(advancedMode === "ui" ? "code" : "ui")}}
                    >{
                        advancedMode === "ui" ? 
                        <i className="fas fa-code"></i> :
                        <i className="fas fa-desktop"></i>
                    }</button>
            </div>
        </>)
    }

    const updateAtlasDuration = (atlasIndex: number, duration: number) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        groupedByAtlas[atlasIndex].duration = duration;
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const updateAtlasBlindMode = (atlasIndex: number, blindMode: boolean) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        groupedByAtlas[atlasIndex].blindMode = blindMode;
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const updateRegionDuration = (atlasIndex: number, regionIndex: number, duration: number) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        groupedByAtlas[atlasIndex].regions[regionIndex].duration = duration;
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const addRegion = (atlasIndex: number) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        groupedByAtlas[atlasIndex].regions.push({ regionId: 0, duration: DEFAULT_DURATION_PER_REGION });
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const removeRegion = (atlasIndex: number, regionIndex: number) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        groupedByAtlas[atlasIndex].regions.splice(regionIndex, 1);
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const updateJSONFromGroupedData = (groupedByAtlas: any[]) => {
        const updatedJSON = groupedByAtlas.flatMap((atlas) => [
            { action: "load-atlas", atlas: atlas.atlas, duration: atlas.duration, blindMode: atlas.blindMode },
            ...atlas.regions.map((region: {regionId: number, duration: number}) => ({ action: "guess", regionId: region.regionId, duration: region.duration })),
        ]);
        setAdvancedSettingsJSON(JSON.stringify(updatedJSON, null, 2));
    };

    const addAtlas = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newAtlas = e.target.value;
        setAdvancedLastAtlas(newAtlas);

        // Update the JSON with the new atlas
        try {
            setListRegions(null)
            const parsedJSON = JSON.parse(advancedSettingsJSON);
            const updatedJSON = [
                ...parsedJSON,
                { action: "load-atlas", atlas: newAtlas, duration: LOAD_ATLAS_DURATION, blindMode: false }
            ]
            setAdvancedSettingsJSON(JSON.stringify(updatedJSON, null, 2));

            // Close all atlases and open the last one
            const groupedByAtlas = parseJSONByAtlas(JSON.stringify(updatedJSON));
            const lastAtlasIndex = groupedByAtlas.length - 1;
            setExpandedAtlases({ [lastAtlasIndex]: true });
        } catch (err) {
            setAdvancedSettingsError(t("invalid_json") || "Invalid JSON format");
        }
        e.target.blur();
    };

    const toggleAtlasCollapse = (atlasIndex: number) => {
        setExpandedAtlases((prev) => ({
            ...prev,
            [atlasIndex]: !prev[atlasIndex],
        }));
    };

    const renderPresetPicker = () => {
        return (
            <select
                id="preset-picker"
                className="preset-picker"
                value=""
                onChange={(e) => {
                    const selectedPreset = advancedPresets.find(preset => preset.id === Number(e.target.value));
                    if (selectedPreset) {
                        setAdvancedSettingsJSON(selectedPreset.settings);
                        setIsValidatedJSON(true); // Reset validation state
                    }
                }}
            >
                <option value="" key="preset_blank">{t("select_preset") || "Select a preset..."}</option>
                {advancedPresets.map(preset => (
                    <option value={preset.id} key={`preset_${preset.id}`}>
                        {preset.name}
                    </option>
                ))}
            </select>
        );
    };

    return (
        <div className="page-container">
            <title>NeuroGuessr - Create multiplayer game</title>
            {!sessionCode && <div>'Creating multiplayer session...'</div>}
            {sessionCode && (
                <div style={{ marginTop: 24 }}>
                    <div style={{display:"flex", flexDirection:"row", alignItems:"flex-start", justifyContent:"space-between"}}>
                    </div>
                    <div id="single-player-options" className="single-player-options-container">
                        {!showAdvancedSettings && <><section className="atlas-selection">
                            <h2><img src="/interface/numero-1.png" alt="Atlas Icon" /> <span>{t("select_atlas")}</span></h2>
                            <GameSelectorAtlas />
                        </section>
                        <section className="mode-selection">
                            <h2><img src="/interface/numero-2.png" alt="Parameters Icon" /> <span>{t("select_params")}</span></h2>
                            <div className="mode-buttons">
                                <label htmlFor="numRegionsSlider" style={{ fontSize: 18, marginRight: 12 }}>
                                    {t("number_regions")} <b>{numRegions}</b>
                                </label>
                                <input
                                    id="numRegionsSlider"
                                    type="range"
                                    min={5}
                                    max={30}
                                    value={numRegions}
                                    onChange={e => setNumRegions(Number(e.target.value))}
                                    onMouseUp={(e) => updateParameters({regionsNumber: Number((e.currentTarget as HTMLInputElement).value)})}
                                    onTouchEnd={(e) => updateParameters({regionsNumber: Number((e.currentTarget as HTMLInputElement).value)})}
                                    style={{ width: 200, verticalAlign: 'middle' }}
                                />
                            </div>
                            <div className="mode-buttons">
                                <label htmlFor="regionsDurationSlider" style={{ fontSize: 18, marginRight: 12 }}>
                                    {t("duration_per_region")}: <b>{durationPerRegion}</b>
                                </label>
                                <input
                                    id="regionsDurationSlider"
                                    type="range"
                                    min={5}
                                    max={30}
                                    value={durationPerRegion}
                                    onChange={e => setDurationPerRegion(Number(e.target.value))}
                                    onMouseUp={(e) => updateParameters({durationPerRegion: Number((e.currentTarget as HTMLInputElement).value)})}
                                    onTouchEnd={(e) => updateParameters({durationPerRegion: Number((e.currentTarget as HTMLInputElement).value)})}
                                    style={{ width: 200, verticalAlign: 'middle' }}
                                />
                            </div>
                            <div className="blind-mode-container">
                                <label className="blind-mode-label" htmlFor="blind-mode-checkbox">
                                    <input
                                        id="blind-mode-checkbox"
                                        type="checkbox"
                                        checked={blindMode}
                                        onChange={() => { setBlindMode(!blindMode); updateParameters({blindMode: !blindMode}) }}
                                        style={{ marginRight: "10px", cursor: "pointer" }}
                                        data-umami-event="toggle blind mode multiplayer"
                                        data-umami-event-blind-mode-state={blindMode ? "on" : "off"}
                                    />
                                    <span>{t("blind_mode") || "Blind Mode"}</span>
                                    <div className="blind-mode-description" style={{
                                        fontSize: "0.9rem",
                                        color: "#666",
                                        marginLeft: "10px"
                                    }}>
                                        {t("blind_mode_description") || "No region highlighting. Challenge yourself for 1.5x points!"}
                                    </div>
                                </label>
                                
                            </div>
                            <div className="mode-buttons">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={isPublic}
                                        onChange={(e) => { setIsPublic(e.target.checked); updateParameters({public: e.target.checked})}}
                                        style={{ marginRight: 8 }}
                                    />
                                    {t('public_lobby') || 'Public lobby (show in list)'}
                                </label>
                            </div>
                            {false && "FOR v2" && <div className="mode-buttons">
                                <label htmlFor="gameoverOnErrorCheckbox" style={{ fontSize: 18, marginRight: 12 }}>
                                    <input
                                        id="gameoverOnErrorCheckbox"
                                        type="checkbox"
                                        checked={gameoverOnError}
                                        onChange={e => {
                                            setGameoverOnError(e.target.checked);
                                            updateParameters({ gameoverOnError: e.target.checked });
                                        }}
                                        style={{ marginRight: 8 }}
                                    />
                                    {t("gameover_first_error")}
                                </label>
                            </div>}
                            {<button
                                className="advanced-settings-show"
                                onClick={() => { handleShowAdvancedBox() }}
                            >
                                {t("show_advanced_settings")}
                            </button>}
                        </section></>}
                        {showAdvancedSettings && advancedMode === "ui" && (
                            <div className="advanced-settings-ui">
                                <div className="advanced-settings-header">
                                    <h3>{t("advanced_settings") || "Advanced Multiplayer Settings"}</h3>
                                    { renderPresetPicker() }
                                </div>
                                <div className="atlas-block">
                                    {renderAtlasBlocks()}
                                    <div className='atlas-picker-ui'>
                                        {renderAtlasPicker()}
                                        {totalDuration > 0 && <div className="total-duration">
                                            <label htmlFor="total-duration">{t("total_duration") || "Total Duration"}:</label>&nbsp;
                                            <span id="total-duration">
                                                {Math.floor(totalDuration / 60) > 0 ? 
                                                    `${Math.floor(totalDuration / 60)} ${t("min") || "min"} ${totalDuration % 60} ${totalDuration < 60 ? t("sec") : ""}` : 
                                                    `${totalDuration} ${t("sec")}`}
                                            </span>
                                        </div>}
                                    </div>
                                </div>
                                {renderAdvancedButtons()}
                            </div>
                        )}
                        {showAdvancedSettings  && advancedMode === "code" && (<div className="advanced-settings-overall">
                            <div className="advanced-settings-header">
                                <h3>{t("advanced_settings") || "Advanced Multiplayer Settings"}</h3>
                                { renderPresetPicker() }
                            </div>
                            <div className="advanced-settings-container">
                                <div className="advanced-settings-area">
                                    <textarea
                                        ref={textareaRef}
                                        value={advancedSettingsJSON}
                                        onChange={(e) => { setAdvancedSettingsJSON(e.target.value) }}
                                        placeholder={t("enter_json") || "Enter JSON here..."}
                                        className="advanced-settings-textarea"
                                    />
                                    { renderAdvancedButtons() }
                                </div>
                                <div className="advanced-settings-picker">
                                    <div>
                                        { renderAtlasPicker() }
                                    </div>
                                    {advancedLastAtlas && listRegions && <div>
                                            <label htmlFor="duration-picker" className='duration-picker-header'>
                                                {t("select_duration")}
                                            </label>
                                            <input
                                                className="region-duration-input"
                                                type="number"
                                                min={5}
                                                max={30}
                                                value={advancedDurationPerRegion}
                                                onChange={(e) => setAdvancedDurationPerRegion(Number(e.target.value))}
                                            />
                                    </div>}
                                    {advancedLastAtlas && <div>
                                        {renderRegionPicker(advancedLastAtlas || "")}
                                    </div>}
                                </div>
                            </div>
                        </div>)}
                    </div>
                    <div id="single-player-options" className="single-player-options-container">
                        <section className="lobby-wait">
                            <h2><img src="/interface/numero-1.png" alt="Atlas Icon" /> <span>{t("wait_players_in_lobby")}</span></h2>
                            <div>
                                <div style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: 4, userSelect: 'all' }}>{sessionCode}
                                    <button
                                        title="Copy game number"
                                        data-umami-event="copy game code button"
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: copiedIcon === "code" ? "#2196f3" : "inherit" }}
                                        onClick={() => {
                                            if (sessionCode && sessionToken) {
                                                copyToClipboard(sessionCode);
                                                setCopiedIcon("code");
                                                setTimeout(() => setCopiedIcon(null), 1000);
                                            }
                                        }}
                                    >
                                        {/* Simple copy icon SVG */}
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                    </button>
                                    <button
                                        title="Copy game link (link icon)"
                                        data-umami-event="copy game link button"
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: copiedIcon === "link" ? "#2196f3" : "inherit", marginLeft: 4 }}
                                        onClick={() => {
                                            if (sessionCode && sessionToken) {
                                                const url = `${window.location.origin}/multiplayer/${sessionCode}`;
                                                copyToClipboard(url);
                                                setCopiedIcon("link");
                                                setTimeout(() => setCopiedIcon(null), 1000);
                                            }
                                        }}
                                    >
                                        {/* Link icon SVG */}
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M10 13a5 5 0 0 1 7.07 0l1.41 1.41a5 5 0 0 1 0 7.07 5 5 0 0 1-7.07 0l-1.41-1.41" />
                                            <path d="M14 11a5 5 0 0 0-7.07 0l-1.41 1.41a5 5 0 0 0 0 7.07 5 5 0 0 0 7.07 0l1.41-1.41" />
                                        </svg>
                                    </button>
                                </div>
                                <QRCodeSVG value={`${window.location.origin}/multiplayer/${sessionCode}`}
                                    bgColor="#00000000" fgColor="#FFFFFF" />
                                <h3>{t("game_code")}</h3>
                            </div>
                        </section>
                        <div>
                            <h2>&nbsp;</h2>
                            <h3>{t("players_in_lobby")}</h3>
                            <ul style={{ fontSize: 20, listStyle: 'none', padding: 0 }}>
                                {lobbyUsers.map(u => <li key={u}>{u}</li>)}
                            </ul>
                            <button
                                className={(((!showAdvancedSettings && selectedAtlas=="") || (showAdvancedSettings && !isValidatedJSON)) || lobbyUsers.length <= 1)?"play-button disabled":"play-button enabled"}
                                data-umami-event="start multiplayer button" data-umami-event-start-multi-altas={selectedAtlas}
                                data-umami-event-start-multi-effective={!loading && selectedAtlas && lobbyUsers.length > 1}
                                data-umami-event-start-multi-lobbysize={lobbyUsers.length}
                                onClick={(e)=>{
                                    if(!loading && (selectedAtlas || (showAdvancedSettings && isValidatedJSON)) && lobbyUsers.length > 1){
                                        navigate(`/multiplayer/${sessionCode}/${sessionToken}`)
                                    } 
                                }}
                            >
                                {t("start_game_button")}
                        </button></div>
                    </div>
                </div>
            )}
            {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
        </div>
    );
};

export default MultiplayerConfigScreen;
