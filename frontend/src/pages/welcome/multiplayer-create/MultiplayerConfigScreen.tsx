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
    const { t, authToken, userUsername } = useApp();
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
    const [advancedSettingsJSON, setAdvancedSettingsJSON] = useState<string>("[]"); // Default to an empty array
    const [advancedSettingsError, setAdvancedSettingsError] = useState<string | null>(null);
    const [advancedLastAtlas, setAdvancedLastAtlas] = useState<string | null>(null);
    const [isValidatedJSON, setIsValidatedJSON] = useState(false);
    const [listRegions, setListRegions] = useState<string[]|null>(null)
    const [advancedDurationPerRegion, setAdvancedDurationPerRegion] = useState<number>(DEFAULT_DURATION_PER_REGION);
    const { currentLanguage } = useApp();

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
        if(!advancedSettingsJSON){
            setAdvancedSettingsJSON("[]")
            return;
        }
        try {
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
        } catch (err) {
            setAdvancedLastAtlas(null); // Reset if JSON is invalid
        }
    }, [advancedSettingsJSON])

    
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
                        {showAdvancedSettings && (<div className="advanced-settings-overall">
                            <h3>{t("advanced_settings") || "Advanced Multiplayer Settings"}</h3>
                            <div className="advanced-settings-container">
                                <div className="advanced-settings-area">
                                    <textarea
                                        ref={textareaRef}
                                        value={advancedSettingsJSON}
                                        onChange={(e) => { setAdvancedSettingsJSON(e.target.value) }}
                                        placeholder={t("enter_json") || "Enter JSON here..."}
                                        className="advanced-settings-textarea"
                                    />
                                    {advancedSettingsError && <div style={{ color: "red", marginBottom: "10px" }}>{advancedSettingsError}</div>}
                                    <button
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
                                    </button>
                                </div>
                                <div className="advanced-settings-picker">
                                    <div>
                                        <label htmlFor="atlas-picker" className="atlas-picker-header">
                                            {t("select_new_atlas") || "Select New Atlas"}
                                        </label>
                                        <select
                                            id="atlas-picker"
                                            value={advancedLastAtlas || ""}
                                            className='atlas-picker'
                                            onChange={(e) => {
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
                                                } catch (err) {
                                                    setAdvancedSettingsError(t("invalid_json") || "Invalid JSON format");
                                                }
                                            }}
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
                                    </div>
                                    {advancedLastAtlas && listRegions && <div>
                                        <div>
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
                                        </div>
                                        <label htmlFor="region-picker" className='region-picker-header'>
                                            {t("select_new_region") || "Select New Region"}
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
                                            e.target.value = ""
                                        }}
                                        >
                                        <option value=""></option>
                                        <option value="random">{t("random_region") || "Random Region"}</option>
                                        {listRegions.filter((_, value) => value !== 0).map((key, value) => (
                                            <option value={value} key={"region_"+value}>
                                                {key}
                                            </option>
                                        ))}
                                        </select>
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
                                                navigator.clipboard.writeText(sessionCode);
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
                                                navigator.clipboard.writeText(url);
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
