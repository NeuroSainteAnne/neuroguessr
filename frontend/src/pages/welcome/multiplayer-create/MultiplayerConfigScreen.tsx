import React, { useEffect, useRef, useState } from 'react';
import { GameSelectorAtlas } from '../GameSelectorAtlas';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../../../context/AppContext';
import { useSocket } from '../../../context/SocketContext';
import { ColorMap, ExternalGameCommands, MultiplayerParametersType } from '../../../types/types';
import { isTokenValid, refreshToken } from '../../../utils/helper_login';
import { useGameSelector } from '../../../context/GameSelectorContext';
import { navigate } from 'vike/client/router';
import { Socket } from 'socket.io-client';
import "./MultiplayerConfigScreen.css"
import Joi from "joi";
import atlasFiles, { atlasCategories } from '../../../utils/atlas_files';
import { fetchJSON } from '../../../utils/helper_nii';
import { consoleLog } from '../../../utils/logging';

const externalGameCommandsSchema = Joi.array().items(
  Joi.object({
    action: Joi.string().valid("load-atlas", "guess", "countdown").required(),
    atlas: Joi.string().optional(),
    regionId: Joi.number().integer().optional(),
    duration: Joi.number().integer().min(1).when('action', {
      is: 'countdown',
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
    startTime: Joi.string().isoDate().when('action', {
      is: 'countdown',
      then: Joi.optional(),
      otherwise: Joi.forbidden()
    }),
    blindMode: Joi.boolean().optional(),
  }).required()
);

const validateExternalGameCommands = (commands: ExternalGameCommands[]): Joi.ValidationResult => {
  if (!commands.length) throw "No command given"
  
  // Check if first command is countdown
  if (commands[0]?.action !== "countdown") {
    throw "First command must be a countdown action"
  }
  
  // Check if countdown startTime is in the future
  if (commands[0]?.startTime) {
    const startTime = new Date(commands[0].startTime);
    const now = new Date();
    if (startTime <= now) {
      throw "Countdown start time must be in the future"
    }
  }
  
  return externalGameCommandsSchema.validate(commands, { abortEarly: false });
};

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;
const DEFAULT_LOAD_ATLAS_DURATION = 5;
const DEFAULT_COUNTDOWN_TIME = 5;

function convertToLocale(defaultTime: Date) {
    const year = defaultTime.getFullYear();
    const month = String(defaultTime.getMonth() + 1).padStart(2, '0');
    const day = String(defaultTime.getDate()).padStart(2, '0');
    const hours = String(defaultTime.getHours()).padStart(2, '0');
    const minutes = String(defaultTime.getMinutes()).padStart(2, '0');
    const localString = `${year}-${month}-${day}T${hours}:${minutes}`;
    return localString;
}

const validateCountdownStartTime = (advancedSettingsJSON: string): { isValid: boolean; error?: string } => {
    try {
        const parsedJSON = JSON.parse(advancedSettingsJSON);
        if (parsedJSON.length > 0 && parsedJSON[0].action === "countdown" && parsedJSON[0].startTime) {
            const startTime = new Date(parsedJSON[0].startTime);
            const now = new Date();
            if (startTime <= now) {
                return { isValid: false, error: "Countdown start time must be in the future" };
            }
        }
        return { isValid: true };
    } catch (err) {
        return { isValid: false, error: "Invalid game configuration" };
    }
};

const MultiplayerConfigScreen = () => {
    const { t, authToken, userUsername, userIsAdmin, currentLanguage, copyToClipboard, refreshNextChallenge } = useApp();
    const { selectedAtlas } = useGameSelector();
    const { createSocket, getSocket } = useSocket();
    const [sessionCode, setSessionCode] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);
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
    const [saveAsChallengeLoading, setSaveAsChallengeLoading] = useState(false);
    const [challengeSavedSuccessfully, setChallengeSavedSuccessfully] = useState(false);
    const [lastCreatedChallengeType, setLastCreatedChallengeType] = useState<'realtime' | 'classic' | null>(null);
    const [isSavedAdvanced, setIsSavedAdvanced] = useState(false);
    const [listRegions, setListRegions] = useState<string[]|null>(null)
    const [advancedDurationPerRegion, setAdvancedDurationPerRegion] = useState<number>(DEFAULT_DURATION_PER_REGION);
    const [advancedPresets, setAdvancedPresets] = useState<{ id: number; name: string; settings: string }[]>([]);
    const [expandedAtlases, setExpandedAtlases] = useState<{ [key: number]: boolean }>({});
    const [atlasRegionNames, setAtlasRegionNames] = useState<{ [atlasKey: string]: string[] }>({});
    const [totalDuration, setTotalDuration] = useState<number>(0);
    const [countdownMode, setCountdownMode] = useState<"duration" | "startTime">("duration");
    const [countdownStartTime, setCountdownStartTime] = useState<string>("");
    const [enableRecurrence, setEnableRecurrence] = useState<boolean>(false);
    const [recurrenceType, setRecurrenceType] = useState<"hour" | "day" | "week" | "month" | "year">("week");
    const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1);
    
    // Challenge Creation Modal states (unified)
    const [showClassicChallengeModal, setShowClassicChallengeModal] = useState<boolean>(false);
    const [challengeModalType, setChallengeModalType] = useState<'classic' | 'realtime'>('classic');
    const challengeTypeSwitcherRef = useRef<HTMLDivElement>(null);
    const [challengeTypeSliderStyle, setChallengeTypeSliderStyle] = useState<React.CSSProperties>({ opacity: 0 });
    const [classicChallengeName, setClassicChallengeName] = useState<string>("");
    const [classicChallengeStartDate, setClassicChallengeStartDate] = useState<string>("");
    const [classicChallengeEndDate, setClassicChallengeEndDate] = useState<string>("");
    const [creatingClassicChallenge, setCreatingClassicChallenge] = useState<boolean>(false);
    const [classicChallengeError, setClassicChallengeError] = useState<string | null>(null);
    const [lastCreatedClassicChallenge, setLastCreatedClassicChallenge] = useState<{
        name: string;
        startDate: string;
        endDate: string;
    } | null>(null);
    
    // Admin change session code states
    const [showChangeCodeInput, setShowChangeCodeInput] = useState<boolean>(false);
    const [newCodeInput, setNewCodeInput] = useState<string>("");
    const [changeCodeLoading, setChangeCodeLoading] = useState<boolean>(false);
    
    // Session cleanup state
    const shouldKeepSessionRef = useRef<boolean>(false);
    
    // Refs to store current session values for cleanup
    const sessionCodeRef = useRef<string | null>(null);
    const sessionTokenRef = useRef<string | null>(null);
    const authTokenRef = useRef<string | null>(null);

    const createSession = async () => {
        setLoading(true);
        setError(null);
        consoleLog("verbose", "Starting multiplayer session creation");
        // Check if the player is logged in
        if (!authToken) {
            consoleLog("verbose", "Session creation failed: no auth token");
            setError('Please log in');
            return;
        }
        if (!isTokenValid(authToken)) {
            consoleLog("verbose", "Session creation failed: invalid auth token");
            setError('Please log in');
            return;
        }
        if (!refreshToken()) {
            consoleLog("verbose", "Session creation failed: token refresh failed");
            setError('Please log in again');
            return;
        }
        consoleLog("verbose", `Creating session with atlas: ${selectedAtlas}, public: ${isPublic}, blindMode: ${blindMode}`);
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
                consoleLog("verbose", `Session creation failed: ${result.message}`);
                setError(result.message || 'Failed to create session');
                setLoading(false);
                return;
            }
            const result = await response.json();
            consoleLog("verbose", `Session created successfully: ${result.sessionCode}, ID: ${result.sessionId}`);
            setSessionCode(result.sessionCode);
            setSessionToken(result.sessionToken);
        } catch (err) {
            consoleLog("verbose", `Session creation network error: ${err}`);
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    const destroySession = async () => {
        const currentSessionCode = sessionCodeRef.current;
        const currentSessionToken = sessionTokenRef.current;
        const currentAuthToken = authTokenRef.current;
        
        if (!currentSessionCode || !currentSessionToken || !currentAuthToken) return;
        
        try {
            if (socketRef.current && socketRef.current.connected) {
                // Emit a destroy session event
                socketRef.current.emit('destroy-session', {
                    sessionCode: currentSessionCode,
                    sessionToken: currentSessionToken,
                    userToken: currentAuthToken
                });
            }
            
            // Also try to destroy via HTTP API as fallback
            await fetch('/api/multi/destroy-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentAuthToken}`
                },
                body: JSON.stringify({ 
                    sessionCode: currentSessionCode, 
                    sessionToken: currentSessionToken 
                })
            });
            
            consoleLog("verbose", `Session ${currentSessionCode} destroyed on component unmount`);
        } catch (err) {
            consoleLog("verbose", `Failed to destroy session on unmount: ${err}`);
        }
    }

    const changeSessionCode = async () => {
        if (!authToken || !userIsAdmin) {
            setError('Admin privileges required');
            return;
        }
        
        if (!sessionCode || !sessionToken) {
            setError('No active session to change');
            return;
        }

        if(!socketRef.current || !socketRef.current.connected){
            setError('Not connected to server');
            return;
        }
        
        if (!newCodeInput || newCodeInput.length !== 8 || !/^\d{8}$/.test(newCodeInput)) {
            setError('Please enter a valid 8-digit code');
            return;
        }
        setChangeCodeLoading(true);
        setError(null);
        
        try {
            socketRef.current.emit('change-session-code', {
                currentSessionCode: sessionCode,
                newSessionCode: newCodeInput,
                sessionToken: sessionToken,
                userToken: authToken
            });
            
        } catch (err) {
            setChangeCodeLoading(false);
            setError('Network error');
            consoleLog("verbose", `Session code change network error: ${err}`);
        }
    };

    useEffect(() => {
        if (sessionCode && sessionToken && userUsername && authToken) {
            // Get or create socket connection
            const socket = createSocket((newSocket: Socket) => {
                consoleLog('normal', `Socket connected, joining lobby ${sessionCode}`);
                
                // Join the lobby
                newSocket.emit('join-lobby', {
                    sessionCode,
                    userName: userUsername,
                    isAnonymous: false,
                    token: authToken
                });
            });
            socketRef.current = socket;

            // Connection error
            socket.on('connect_error', (err: any) => {
                setError(`Connection error: ${err.message}`);
                setSaveAsChallengeLoading(false);
            });
            socket.on('error', (data: any) => {
                setError(data.message);
                setSaveAsChallengeLoading(false);
                setChangeCodeLoading(false);
            });
            socket.on('fatal-error', (data: any) => {
                setError(data.message);
                setSaveAsChallengeLoading(false);
                setChangeCodeLoading(false);
            });
            socket.on('lobby-users', (data: any) => {
                consoleLog("verbose", `Received lobby users update: ${data.users?.length} users`);
                if (Array.isArray(data.users)) {
                    setLobbyUsers(data.users);
                }
            });
            socket.on('player-joined', (data: any) => {
                consoleLog("verbose", `Player joined lobby: ${data.userName}`);
                if (data.userName) {
                    setLobbyUsers(prev => {
                        const updated = Array.from(new Set([...prev, data.userName]));
                        return updated;
                    });
                }
            });
            socket.on('player-left', (data: any) => {
                consoleLog("verbose", `Player left lobby: ${data.userName}`);
                if (data.userName) {
                    setLobbyUsers(prev => prev.filter(u => u !== data.userName));
                }
            });
            socket.on('parameters-updated', (data: any) => {
                consoleLog("verbose", `Game parameters updated, total duration: ${data?.parameters?.totalDuration}s`);
                if(data && data.parameters && data.parameters.totalDuration) {
                    setTotalDuration(data.parameters.totalDuration);
                }
            });
            socket.on('parameters-has-updated', (data: any) => {
                consoleLog("verbose", `Parameters validation result: ${data?.success ? 'valid' : 'invalid'}`);
                if (data && data.success) {
                    setIsValidatedJSON(true)
                }
            });
            
            socket.on('save-as-realtime-challenge', (data: any) => {
                setSaveAsChallengeLoading(false);
                if (data && data.message === "success") {
                    // Challenge saved successfully
                    setError(null);
                    setChallengeSavedSuccessfully(true);
                    setLastCreatedChallengeType('realtime');
                    refreshNextChallenge();
                    consoleLog("verbose", "Real-time challenge saved successfully");
                    // Optionally show success message or redirect
                } else {
                    setError("Failed to save real-time challenge");
                }
            });
            
            socket.on('realtime-challenge-prepared', () => {
                consoleLog("verbose", "Real-time challenge has been prepared and will start at the scheduled time");
                // Optionally show preparation message
            });
            
            socket.on('session-code-changed', (data: any) => {
                consoleLog("verbose", `Session code changed from ${data.oldCode} to ${data.newCode}`);
                setSessionCode(data.newCode);
                setChangeCodeLoading(false);
                setShowChangeCodeInput(false);
                setNewCodeInput("");
                setError(null);
            });
            
            // Don't disconnect on unmount - let the socket persist for navigation
            return () => {
                // Clean up event listeners but keep the socket connected
                socket.off('connect');
                socket.off('connect_error');
                socket.off('error');
                socket.off('fatal-error');
                socket.off('lobby-users');
                socket.off('player-joined');
                socket.off('player-left');
                socket.off('parameters-updated');
                socket.off('parameters-has-updated');
                socket.off('save-as-realtime-challenge');
                socket.off('realtime-challenge-prepared');
                socket.off('session-code-changed');
            };
        }
        return undefined;
    }, [sessionCode, sessionToken, userUsername, authToken, createSocket]);

    const updateParameters = async (newParameters : Partial<MultiplayerParametersType>) => {
        const socket = getSocket();
        if(!socket || !socket.connected) return;
        parametersRef.current = {...parametersRef.current, ...newParameters}
        consoleLog("verbose", `Updating multiplayer parameters:`, parametersRef.current);
        if(parametersRef && parametersRef.current && !parametersRef.current.commands){
            let countdownCommand: any = { action: "countdown" };
            if (countdownMode === "startTime" && countdownStartTime) {
                countdownCommand.startTime = countdownStartTime;
            } else {
                countdownCommand.duration = DEFAULT_COUNTDOWN_TIME;
            }
            
            const generatedCommands = [
                countdownCommand,
                ...(parametersRef.current.atlas ? [{ action: "load-atlas", atlas: parametersRef.current.atlas, duration: DEFAULT_LOAD_ATLAS_DURATION }] : []),
                ...(parametersRef.current.atlas ? Array.from({ length: parametersRef.current.regionsNumber }, () => ({
                    action: "guess",
                    duration: durationPerRegion,
                })) : []),
            ];
            consoleLog("verbose", `Generated game commands: ${generatedCommands.length} total`);
            setAdvancedSettingsJSON(JSON.stringify(generatedCommands, null, 2))
        }
        // Send updated parameters to the server
        if (sessionCode && sessionToken) {
            consoleLog("verbose", `Sending parameter update to server for session ${sessionCode}`);
            try {
                socket.emit('update-parameters', {
                    sessionCode,
                    sessionToken,
                    parameters: parametersRef.current
                });
            } catch (err) {
                consoleLog("verbose", `Failed to send parameter update: ${err}`);
                setError('Failed to update parameters');
                throw String(err)
            }
        }
    }

    const handleSaveAsChallenge = async () => {
        if (!classicChallengeName.trim()) {
            setClassicChallengeError(t("challenge_name_required") || "Challenge name is required");
            return;
        }

        if (!countdownStartTime) {
            setClassicChallengeError(t("start_time_required") || "Start time is required");
            return;
        }

        const startTime = new Date(countdownStartTime);
        if (startTime <= new Date()) {
            setClassicChallengeError(t("start_time_future") || "Start time must be in the future");
            return;
        }

        if (!socketRef.current || !socketRef.current.connected) {
            setClassicChallengeError("Not connected to server");
            return;
        }

        if (!sessionCode || !sessionToken) {
            setClassicChallengeError("Session information missing");
            return;
        }

        setSaveAsChallengeLoading(true);
        setClassicChallengeError(null);

        // Build commands from current parameters + startTime
        const params = parametersRef.current;
        let commands: any[];
        if (params.commands && params.commands.length > 0) {
            // Already has custom commands — just update the countdown startTime
            commands = [...params.commands];
            if (commands[0].action === 'countdown') {
                commands[0] = { action: 'countdown', startTime: startTime.toISOString() };
            } else {
                commands.unshift({ action: 'countdown', startTime: startTime.toISOString() });
            }
        } else {
            // Simple mode — generate commands from parameters
            const durationPerRegion = params.durationPerRegion ?? DEFAULT_DURATION_PER_REGION;
            commands = [
                { action: 'countdown', startTime: startTime.toISOString() },
                ...(params.atlas ? [{ action: 'load-atlas', atlas: params.atlas, duration: DEFAULT_LOAD_ATLAS_DURATION, blindMode: params.blindMode ?? false }] : []),
                ...(params.atlas ? Array.from({ length: params.regionsNumber ?? 10 }, () => ({
                    action: 'guess',
                    duration: durationPerRegion,
                })) : []),
            ];
        }

        // Push updated parameters with commands to the server
        const updatedParams = { ...params, commands };
        parametersRef.current = updatedParams;
        socketRef.current.emit('update-parameters', {
            sessionCode,
            sessionToken,
            parameters: updatedParams
        });

        const recurrence = enableRecurrence ? { type: recurrenceType, interval: recurrenceInterval } : undefined;

        // Wait one tick for the server to process update-parameters before saving
        setTimeout(() => {
            if (!socketRef.current || !socketRef.current.connected) {
                setSaveAsChallengeLoading(false);
                setClassicChallengeError("Lost connection to server");
                return;
            }
            socketRef.current.emit('save-as-realtime-challenge', {
                sessionCode,
                sessionToken,
                userToken: authToken,
                name: classicChallengeName.trim(),
                recurrent: recurrence
            });
            shouldKeepSessionRef.current = true;
            setShowClassicChallengeModal(false);
        }, 300);
    }

    const handleCreateClassicChallenge = async () => {
        if (!userIsAdmin) {
            setClassicChallengeError('Admin privileges required');
            return;
        }

        if (!classicChallengeName.trim()) {
            setClassicChallengeError('Challenge name is required');
            return;
        }

        if (!classicChallengeStartDate || !classicChallengeEndDate) {
            setClassicChallengeError('Start date and end date are required');
            return;
        }

        const startDate = new Date(classicChallengeStartDate);
        const endDate = new Date(classicChallengeEndDate);
        const now = new Date();

        if (startDate <= now) {
            setClassicChallengeError('Start date must be in the future');
            return;
        }

        if (endDate <= startDate) {
            setClassicChallengeError('End date must be after start date');
            return;
        }

        if (!selectedAtlas && !showAdvancedSettings) {
            setClassicChallengeError('Please select an atlas or configure advanced settings');
            return;
        }

        setCreatingClassicChallenge(true);
        setClassicChallengeError(null);

        try {
            const challengeData = {
                sessionCode: sessionCode,
                sessionToken: sessionToken,
                name: classicChallengeName.trim(),
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                public: isPublic,
                userToken: authToken
            };

            if (!socketRef.current || !socketRef.current.connected) {
                setClassicChallengeError('Not connected to server');
                return;
            }

            // Use socket event instead of REST API
            socketRef.current.emit('create-classic-challenge', challengeData);

            // Store challenge details for success modal
            setLastCreatedClassicChallenge({
                name: classicChallengeName.trim(),
                startDate: classicChallengeStartDate,
                endDate: classicChallengeEndDate
            });
            
            // do not destroy challenge
            shouldKeepSessionRef.current = true;

            // Reset modal and show success
            setShowClassicChallengeModal(false);
            setClassicChallengeName("");
            //setClassicChallengeDescription("");
            setClassicChallengeStartDate("");
            setClassicChallengeEndDate("");
            
            // Show success message
            setChallengeSavedSuccessfully(true);
            setLastCreatedChallengeType('classic');

        } catch (err) {
            consoleLog("verbose", `Failed to create classic challenge: ${err}`);
            setClassicChallengeError(err instanceof Error ? err.message : 'Failed to create classic challenge');
        } finally {
            setCreatingClassicChallenge(false);
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
            
            // Check if first command is countdown when there are commands
            if (parsedJSON.length > 0 && parsedJSON[0].action !== "countdown") {
                setAdvancedSettingsError(t("first_command_must_be_countdown") || "First command must be a countdown action");
                return;
            }
            
            // Update countdown mode based on JSON content
            if (parsedJSON.length > 0 && parsedJSON[0].action === "countdown") {
                const countdownCommand = parsedJSON[0];
                if (countdownCommand.startTime) {
                    setCountdownMode("startTime");
                    // Convert ISO time to local time format for datetime-local input
                    const date = new Date(countdownCommand.startTime);
                    const localTime = convertToLocale(date);
                    setCountdownStartTime(localTime);
                } else {
                    setCountdownMode("duration");
                }
            }
            
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
        if(selectedAtlasFiles) {
            fetchJSON("/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json).then((jsonData: ColorMap) => {
                setListRegions(jsonData.labels)
            });
        }
    }, [advancedLastAtlas])

    useEffect(()=>{
        if(selectedAtlas){
            updateParameters({atlas:selectedAtlas})
        } else {
            updateParameters({atlas:undefined})
        }
    }, [selectedAtlas])

    // Keep refs updated with current state values
    useEffect(() => {
        sessionCodeRef.current = sessionCode;
    }, [sessionCode]);

    useEffect(() => {
        sessionTokenRef.current = sessionToken;
    }, [sessionToken]);

    useEffect(() => {
        authTokenRef.current = authToken;
    }, [authToken]);

    useEffect(() => {
        createSession()
        
        // Cleanup function to destroy session when component unmounts
        return () => {
            // Only destroy the session if we're not explicitly keeping it
            if (!shouldKeepSessionRef.current) {
                destroySession();
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

            await saveResponse.json();
            setAdvancedSettingsError(null);
            setIsSavedAdvanced(true);
        } catch (err) {
            console.error("Error saving advanced settings:", err);
            setAdvancedSettingsError(t("unexpected_error") || "An unexpected error occurred.");
        }
    }

    const parseJSONByAtlas = (json: string) => {
        try {
            const parsedJSON = JSON.parse(json);
            const groupedByAtlas: { atlas: string; duration: number; blindMode: boolean; regions: { regionId?: number; duration: number }[] }[] = [];
            let currentAtlas: { atlas: string; duration: number; blindMode: boolean; regions: { regionId?: number; duration: number }[] } | null = null;

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

            return (
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
                                    className="adv-number-input"
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
                                <img src="/interface/trash.png" alt="Delete" style={{width: '16px', height: '16px'}} />
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
                                                className="adv-number-input"
                                                type="number"
                                                min={5}
                                                max={30}
                                                value={region.duration}
                                                onChange={(e) => updateRegionDuration(atlasIndex, regionIndex, Number(e.target.value))}
                                            />
                                        </label>
                                        <button onClick={() => removeRegion(atlasIndex, regionIndex)} className="remove-block-button">
                                            <img src="/interface/trash.png" alt="Delete" style={{width: '16px', height: '16px'}} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <div className='region-picker-ui'>
                                {renderRegionPicker(atlas.atlas, atlasIndex)}
                            </div>
                        </div>
                    )}
                </div>
            )
        });
    };

    const renderRegionPicker = (atlasKey: string, atlasIndex: number) => {
        const regionNames = atlasRegionNames[atlasKey] || []; // Get preloaded region names
        return (<>
            <label htmlFor={`region-picker_${atlasIndex}`}>
                {t("add_new_region") || "Add New Region"}
            </label>
            <div className="custom-select-wrapper">
                <select
                    id={`region-picker_${atlasIndex}`}
                    className="region-picker custom-select"
                    value="" // Always reset to the blank option after a change
                    onChange={(e) => {
                        const newRegion = e.target.value;
                        if(newRegion === "") return;
                        // Update the JSON with the new region
                        try {
                            const parsedJSON = JSON.parse(advancedSettingsJSON);
                            const newRegionLine : {action: string, duration: number, regionId: number} = {
                                action: "guess",
                                duration: advancedDurationPerRegion || DEFAULT_DURATION_PER_REGION,
                                regionId: 0
                            }
                            if(newRegion !== "random") newRegionLine.regionId = Number(newRegion)
                            if(atlasIndex === -1){
                                setAdvancedSettingsJSON(
                                    JSON.stringify([...parsedJSON, newRegionLine], null, 2)
                                );
                            } else {
                                const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
                                if(groupedByAtlas[atlasIndex]) {
                                    groupedByAtlas[atlasIndex].regions.push({regionId: newRegionLine.regionId, duration: newRegionLine.duration});
                                }
                                updateJSONFromGroupedData(groupedByAtlas);
                            }
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
            </div>
        </>)
    }

    const renderAtlasPicker = () => {
        return (<>
            <label htmlFor="atlas-picker" className="atlas-picker-header">
                {t("add_atlas") || "Add Atlas"}
            </label>
            <div className="custom-select-wrapper">
                <select
                    id="atlas-picker"
                    value={""}
                    className='atlas-picker custom-select'
                    onChange={addAtlas}
                >
                    <option value="" key="atlas_blank"></option>
                    {atlasCategories.map((category) => (
                        <optgroup label={t(category)} key={`category_${category}`}>
                            {Object.entries(atlasFiles)
                                .filter(([_key, atlas]) => atlas.atlas_category === category)
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
        </>)
    }

    const renderAdvancedButtons = () => {
        return (<>
            {advancedSettingsError && <div style={{ color: "var(--error-color)", marginBottom: "10px", fontSize: '0.9rem' }}>{advancedSettingsError}</div>}
            <div className="advanced-settings-buttons">
                {advancedMode === "code" && (
                    <button
                        className={`adv-icon-btn${isValidatedJSON ? " adv-icon-btn--success" : ""}`}
                        onClick={() => {
                            try {
                                const parsedJSON = JSON.parse(advancedSettingsJSON);
                                if (parsedJSON.length > 0 && parsedJSON[0].action !== "countdown") {
                                    setAdvancedSettingsError(t("first_command_must_be_countdown") || "First command must be a countdown action");
                                    return;
                                }
                                const success = validateExternalGameCommands(parsedJSON);
                                if (!success) {
                                    setAdvancedSettingsError(t("invalid_json_structure") || "Invalid JSON structure");
                                    return;
                                }
                                setAdvancedSettingsError(null);
                                updateParameters({ commands: parsedJSON });
                            } catch (err) {
                                setAdvancedSettingsError(String(err) || t("invalid_json"));
                            }
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{t("validate_settings") || "Valider"}</span>
                    </button>
                )}
                <button
                    className={`adv-icon-btn${!isValidatedJSON ? " adv-icon-btn--disabled" : isSavedAdvanced ? " adv-icon-btn--success" : ""}`}
                    disabled={!isValidatedJSON}
                    onClick={isValidatedJSON ? handleSaveAdvancedSettings : () => {}}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                    </svg>
                    <span>{t("save") || "Sauvegarder"}</span>
                </button>
                <button
                    className={`adv-icon-btn adv-icon-btn--toggle${!isValidatedJSON ? " adv-icon-btn--disabled" : ""}`}
                    disabled={!isValidatedJSON}
                    onClick={() => setAdvancedMode(advancedMode === "ui" ? "code" : "ui")}
                >
                    <img
                        src={advancedMode === "ui" ? "/interface/code.png" : "/interface/desktop.png"}
                        alt={advancedMode === "ui" ? "Code" : "UI"}
                        style={{ width: '16px', height: '16px' }}
                    />
                    <span>{advancedMode === "ui" ? "Code" : "UI"}</span>
                </button>
            </div>
            <div className="blind-mode-container" style={{ marginTop: 8 }}>
                <label className="blind-mode-label" htmlFor="public-lobby-checkbox-adv">
                    <input
                        id="public-lobby-checkbox-adv"
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => { setIsPublic(e.target.checked); updateParameters({public: e.target.checked}) }}
                        style={{ marginRight: "10px", cursor: "pointer" }}
                    />
                    <span>{t('public_lobby') || 'Public mode'}</span>
                    <div className="blind-mode-description">
                        {t('public_lobby_description') || 'This game will appear in the public lobby list and anyone can join.'}
                    </div>
                </label>
            </div>
        </>)
    }

    const renderQRCodeContainer = ({qrCodeColor = "#FFFFFF", textColor = "inherit", 
        showDescription = false, customDescription} : {qrCodeColor?: string, textColor?: string, showDescription?: boolean, customDescription?: string}) => {
        
        // Convert countdownStartTime to readable format
        const getReadableStartTime = () => {
            if (!countdownStartTime) return "";
            try {
                const date = new Date(countdownStartTime);
                return date.toLocaleString(currentLanguage === 'fr' ? 'fr-FR' : 'en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                });
            } catch (err) {
                return countdownStartTime; // Fallback to original if parsing fails
            }
        };

        return (
            <div className="qr-code-container">
                <div style={{ 
                    fontSize: 32, 
                    fontWeight: 'bold', 
                    letterSpacing: 4, 
                    userSelect: 'all',
                    marginBottom: showDescription ? '15px' : undefined,
                    color: textColor
                }}>
                    {sessionCode}
                    <button
                        title="Copy game number"
                        data-umami-event="copy game code button"
                        style={{ 
                            border: 'none', 
                            background: 'none', 
                            cursor: 'pointer', 
                            padding: 0, 
                            color: copiedIcon === "code" ? "#2196f3" : textColor 
                        }}
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
                        style={{ 
                            border: 'none', 
                            background: 'none', 
                            cursor: 'pointer', 
                            padding: 0, 
                            color: copiedIcon === "link" ? "#2196f3" : textColor, 
                            marginLeft: 4 
                        }}
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
                <QRCodeSVG 
                    value={`${window.location.origin}/multiplayer/${sessionCode}`}
                    bgColor="#00000000" 
                    fgColor={qrCodeColor} 
                />
                <h3 style={{ 
                    color: textColor, 
                    margin: showDescription ? '10px 0' : undefined 
                }}>
                    {t("game_code")}
                </h3>
                {showDescription && (
                    <p style={{ 
                        color: textColor === "#333" ? '#666' : '#ccc', 
                        fontSize: '16px', 
                        marginTop: '15px',
                        lineHeight: '1.5'
                    }}>
                        {customDescription || (t("challenge_ready_message", {startTime: getReadableStartTime()}))}
                    </p>
                )}
            </div>
        );
    }

    const updateAtlasDuration = (atlasIndex: number, duration: number) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        if(groupedByAtlas[atlasIndex]) {
            groupedByAtlas[atlasIndex].duration = duration;
        }
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const getCountdownDuration = (): number => {
        try {
            const parsedJSON = JSON.parse(advancedSettingsJSON);
            const countdownCommand = parsedJSON.find((command: any) => command.action === "countdown");
            return countdownCommand ? countdownCommand.duration : DEFAULT_COUNTDOWN_TIME;
        } catch (err) {
            return DEFAULT_COUNTDOWN_TIME;
        }
    };

    const getCountdownStartTime = (): string => {
        try {
            const parsedJSON = JSON.parse(advancedSettingsJSON);
            const countdownCommand = parsedJSON.find((command: any) => command.action === "countdown");
            return countdownCommand && countdownCommand.startTime ? countdownCommand.startTime : "";
        } catch (err) {
            return "";
        }
    };

    const updateCountdownDuration = (duration: number, sourceJSON?: string) => {
        try {
            const parsedJSON = sourceJSON ? JSON.parse(sourceJSON) : JSON.parse(advancedSettingsJSON);
            const countdownIndex = parsedJSON.findIndex((command: any) => command.action === "countdown");
            
            if (countdownIndex !== -1 && countdownIndex !== 0) {
                // Remove countdown from wrong position and add at beginning
                parsedJSON.splice(countdownIndex, 1);
                parsedJSON.unshift({ action: "countdown", duration: duration });
            } else if (countdownIndex === 0) {
                // Update existing countdown at the correct position
                parsedJSON[0] = { action: "countdown", duration: duration };
            } else {
                // Add countdown command at the beginning if it doesn't exist
                parsedJSON.unshift({ action: "countdown", duration: duration });
            }
            
            setAdvancedSettingsJSON(JSON.stringify(parsedJSON, null, 2));
        } catch (err) {
            console.error("Failed to update countdown duration:", err);
        }
    };

    const updateCountdownStartTime = (startTime: string) => {
        try {
            const parsedJSON = JSON.parse(advancedSettingsJSON);
            const countdownIndex = parsedJSON.findIndex((command: any) => command.action === "countdown");
            
            if (countdownIndex !== -1 && countdownIndex !== 0) {
                // Remove countdown from wrong position and add at beginning
                parsedJSON.splice(countdownIndex, 1);
                parsedJSON.unshift({ action: "countdown", startTime: startTime });
            } else if (countdownIndex === 0) {
                // Update existing countdown at the correct position
                parsedJSON[0] = { action: "countdown", startTime: startTime };
            } else {
                // Add countdown command at the beginning if it doesn't exist
                parsedJSON.unshift({ action: "countdown", startTime: startTime });
            }
            
            setAdvancedSettingsJSON(JSON.stringify(parsedJSON, null, 2));
        } catch (err) {
            console.error("Failed to update countdown start time:", err);
        }
    };

    const updateAtlasBlindMode = (atlasIndex: number, blindMode: boolean) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        if(groupedByAtlas[atlasIndex]) {
            groupedByAtlas[atlasIndex].blindMode = blindMode;
        }
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const updateRegionDuration = (atlasIndex: number, regionIndex: number, duration: number) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        if(groupedByAtlas[atlasIndex] && groupedByAtlas[atlasIndex].regions[regionIndex]) {
            groupedByAtlas[atlasIndex].regions[regionIndex].duration = duration;
        }
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const removeRegion = (atlasIndex: number, regionIndex: number) => {
        const groupedByAtlas = parseJSONByAtlas(advancedSettingsJSON);
        if(groupedByAtlas[atlasIndex]) {
            groupedByAtlas[atlasIndex].regions.splice(regionIndex, 1);
        }
        updateJSONFromGroupedData(groupedByAtlas);
    };

    const updateJSONFromGroupedData = (groupedByAtlas: any[]) => {
        // Preserve existing countdown command
        const currentCountdownDuration = getCountdownDuration();
        const currentCountdownStartTime = getCountdownStartTime();
        
        let countdownCommand: any = { action: "countdown" };
        if (currentCountdownStartTime) {
            countdownCommand.startTime = currentCountdownStartTime;
        } else {
            countdownCommand.duration = currentCountdownDuration;
        }
        
        const updatedJSON = [
            countdownCommand,
            ...groupedByAtlas.flatMap((atlas) => [
                { action: "load-atlas", atlas: atlas.atlas, duration: atlas.duration, blindMode: atlas.blindMode },
                ...atlas.regions.map((region: {regionId: number, duration: number}) => ({ action: "guess", regionId: region.regionId, duration: region.duration })),
            ])
        ];
        setAdvancedSettingsJSON(JSON.stringify(updatedJSON, null, 2));
    };

    const addAtlas = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newAtlas = e.target.value;
        setAdvancedLastAtlas(newAtlas);

        // Update the JSON with the new atlas
        try {
            setListRegions(null)
            const parsedJSON = JSON.parse(advancedSettingsJSON);
            
            // Ensure countdown is preserved at the beginning
            const countdownCommand = parsedJSON.find((cmd: any) => cmd.action === "countdown");
            const nonCountdownCommands = parsedJSON.filter((cmd: any) => cmd.action !== "countdown");
            
            let defaultCountdown: any = { action: "countdown" };
            if (countdownMode === "startTime" && countdownStartTime) {
                defaultCountdown.startTime = countdownStartTime;
            } else {
                defaultCountdown.duration = DEFAULT_COUNTDOWN_TIME;
            }
            
            const updatedJSON = [
                countdownCommand || defaultCountdown,
                ...nonCountdownCommands,
                { action: "load-atlas", atlas: newAtlas, duration: DEFAULT_LOAD_ATLAS_DURATION, blindMode: false }
            ];
            
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
            <div className="custom-select-wrapper">
                <select
                    id="preset-picker"
                    className="preset-picker custom-select"
                    value=""
                    onChange={(e) => {
                        const selectedPreset = advancedPresets.find(preset => preset.id === Number(e.target.value));
                        if (selectedPreset) {
                            updateCountdownDuration(DEFAULT_COUNTDOWN_TIME, selectedPreset.settings);
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
            </div>
        );
    };

    // Helper to get default start/end dates for classic challenge
    const getDefaultClassicChallengeDates = () => {
        const now = new Date();
        // Add 5 minutes, round seconds to 0
        const start = new Date(now.getTime() + 5 * 60 * 1000);
        start.setSeconds(0, 0);
        // End date: 1 day after start
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        end.setSeconds(0, 0);
        // Format for datetime-local input
        const toLocal = (d: Date) => {
            const tzOffset = d.getTimezoneOffset() * 60000;
            const localISO = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
            return localISO;
        };
        return {
            start: toLocal(start),
            end: toLocal(end)
        };
    };

    // When opening the modal, set default dates
    const handleOpenClassicChallengeModal = () => {
        const { start, end } = getDefaultClassicChallengeDates();
        setClassicChallengeStartDate(start);
        setClassicChallengeEndDate(end);
        setChallengeModalType('classic');
        setClassicChallengeName('');
        setClassicChallengeError(null);
        setShowClassicChallengeModal(true);
    };

    // Slider for challenge type switcher (clone du lang-switcher)
    useEffect(() => {
        if (!challengeTypeSwitcherRef.current) return;
        const activeBtn = challengeTypeSwitcherRef.current.querySelector('.challenge-type-btn.active') as HTMLElement;
        if (!activeBtn) return;
        const containerRect = challengeTypeSwitcherRef.current.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        setChallengeTypeSliderStyle({
            left: btnRect.left - containerRect.left,
            width: btnRect.width,
            opacity: 1,
        });
    }, [challengeModalType, showClassicChallengeModal]);

    return (
        <div className="mc-page">
            <title>NeuroGuessr - Create multiplayer game</title>

            {!authToken && (
                <div className="mc-not-logged-in">
                    <div style={{ fontSize: '1.1rem', marginBottom: '16px' }}>
                        {t("multi_unavailable_login") ? (
                            <div dangerouslySetInnerHTML={{__html: t("multi_unavailable_login").replace('/login?returnURL=%2Fwelcome%2Fmultiplayer-create', `/login?returnURL=${encodeURIComponent('/welcome/multiplayer-create')}`)}} />
                        ) : (
                            <>Please <a href={`/login?returnURL=${encodeURIComponent('/welcome/multiplayer-create')}`}>log in</a> to create a multiplayer game</>
                        )}
                    </div>
                </div>
            )}

            {authToken && !sessionCode && (
                <div className="mc-loading">
                    <div className="mc-loading-dot" /><div className="mc-loading-dot" /><div className="mc-loading-dot" />
                </div>
            )}

            {sessionCode && !challengeSavedSuccessfully && (
                <div className="mc-layout">
                    {error && <div className="mc-error">{error}</div>}

                    {/* ── LEFT COLUMN : Atlas selector + Settings ── */}
                    <div className="mc-left">
                        <div className="mc-section-label">{t("select_region_family")}</div>
                        <GameSelectorAtlas />

                        {/* Config card */}
                        <div className="mc-section-label" style={{marginTop: 16}}>{t("game_settings") || "Paramètres"}</div>
                        <div className="mc-card">

                        {!showAdvancedSettings && <section className="mode-selection">
                            <div className={`default-atlas-badge ${selectedAtlas ? "atlas-selected" : "atlas-missing"}`}>
                                {selectedAtlas
                                    ? `${t("selected_atlas_label") || "Atlas"} : ${atlasFiles[selectedAtlas]?.name || selectedAtlas}`
                                    : (t("please_select_atlas") || "Please select an atlas above")}
                            </div>
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
                                    <div className="blind-mode-description">
                                        {t("blind_mode_description") || "No region highlighting. Challenge yourself for 1.5x points!"}
                                    </div>
                                </label>

                            </div>
                            <div className="blind-mode-container">
                                <label className="blind-mode-label" htmlFor="public-lobby-checkbox">
                                    <input
                                        id="public-lobby-checkbox"
                                        type="checkbox"
                                        checked={isPublic}
                                        onChange={(e) => { setIsPublic(e.target.checked); updateParameters({public: e.target.checked})}}
                                        style={{ marginRight: "10px", cursor: "pointer" }}
                                    />
                                    <span>{t('public_lobby') || 'Public mode'}</span>
                                    <div className="blind-mode-description">
                                        {t('public_lobby_description') || 'This game will appear in the public lobby list and anyone can join.'}
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
                            <button
                                className="advanced-settings-show"
                                onClick={() => { handleShowAdvancedBox() }}
                            >
                                {t("show_advanced_settings")}
                            </button>
                        </section>}
                        {showAdvancedSettings && advancedMode === "ui" && (
                            <div className="advanced-settings-ui">
                                <div className="advanced-settings-header">
                                    <h3>{t("advanced_settings") || "Advanced Multiplayer Settings"}</h3>
                                    { renderPresetPicker() }
                                </div>
                                <div className="atlas-block">
                                    <div className='atlas-picker-ui' key="countdown-config">
                                        <label style={{ marginRight: '0px' }}>
                                            {t("countdown_duration") || "Countdown Duration (seconds)"}:
                                        </label>
                                        <input
                                            className="adv-number-input"
                                            type="number"
                                            min={5}
                                            max={30}
                                            value={getCountdownDuration()}
                                            onChange={(e) => updateCountdownDuration(Number(e.target.value))}
                                            onClick={(e) => { e.stopPropagation(); }}
                                            placeholder={t("seconds") || "seconds"}
                                        />
                                    </div>
                                    {renderAtlasBlocks()}
                                    <div className='atlas-picker-ui' key="atlas-picker">
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
                        {showAdvancedSettings && advancedMode === "code" && (<div className="advanced-settings-overall">
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
                                        {renderRegionPicker(advancedLastAtlas || "", -1)}
                                    </div>}
                                </div>
                            </div>
                        </div>)}

                        </div>
                    </div>

                    {/* ── RIGHT COLUMN : Lobby ── */}
                    <div className="mc-right">
                        <div className="mc-section-label">{t("lobby") || "Lobby"}</div>
                        {/* Lobby card */}
                        <div className="mc-card mc-card--lobby">
                        <section className="lobby-wait">
                            <div className="lobby-wait-inner">
                                <div className="lobby-qr-section">
                                    <div className="lobby-code-display">
                                        {sessionCode}
                                        <button
                                            className={`lobby-code-copy-btn${copiedIcon === "code" ? " copied" : ""}`}
                                            title="Copy game code"
                                            data-umami-event="copy game code button"
                                            onClick={() => {
                                                if (sessionCode && sessionToken) {
                                                    copyToClipboard(sessionCode);
                                                    setCopiedIcon("code");
                                                    setTimeout(() => setCopiedIcon(null), 1000);
                                                }
                                            }}
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                            </svg>
                                        </button>
                                        <button
                                            className={`lobby-code-copy-btn${copiedIcon === "link" ? " copied" : ""}`}
                                            title="Copy game link"
                                            data-umami-event="copy game link button"
                                            onClick={() => {
                                                if (sessionCode && sessionToken) {
                                                    const url = `${window.location.origin}/multiplayer/${sessionCode}`;
                                                    copyToClipboard(url);
                                                    setCopiedIcon("link");
                                                    setTimeout(() => setCopiedIcon(null), 1000);
                                                }
                                            }}
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M10 13a5 5 0 0 1 7.07 0l1.41 1.41a5 5 0 0 1 0 7.07 5 5 0 0 1-7.07 0l-1.41-1.41" />
                                                <path d="M14 11a5 5 0 0 0-7.07 0l-1.41 1.41a5 5 0 0 0 0 7.07 5 5 0 0 0 7.07 0l1.41-1.41" />
                                            </svg>
                                        </button>
                                    </div>
                                    <QRCodeSVG
                                        value={`${window.location.origin}/multiplayer/${sessionCode}`}
                                        bgColor="#00000000"
                                        fgColor="#FFFFFF"
                                        size={120}
                                    />
                                    <div className="lobby-code-label">{t("game_code")}</div>
                                </div>
                                <div className="lobby-players-section">
                                    <h3>{t("players_in_lobby")}</h3>
                                    <ul className="lobby-players-list">
                                        {lobbyUsers.map(u => (
                                            <li key={u} className="lobby-player-item">
                                                <span className="lobby-player-dot"></span>
                                                {u}
                                            </li>
                                        ))}
                                    </ul>
                                    {lobbyUsers.length <= 1 && (
                                        <p className="lobby-waiting-hint">{t("waiting_for_players") || "Waiting for other players to join..."}</p>
                                    )}
                                    {userIsAdmin && (
                                        <div className="admin-change-code-widget">
                                            <h3>{t("admin_change_session_code")}</h3>
                                            <p>{t("change_code_description")}</p>
                                            {!showChangeCodeInput ? (
                                                <button className="play-button enabled" style={{width:'auto', padding:'6px 16px', fontSize:'0.85rem'}} onClick={() => setShowChangeCodeInput(true)}>
                                                    {t("change_session_code")}
                                                </button>
                                            ) : (
                                                <div className="admin-code-input-row">
                                                    <input
                                                        type="text"
                                                        className="admin-code-input"
                                                        placeholder={t("enter_new_code")}
                                                        value={newCodeInput}
                                                        onChange={(e) => setNewCodeInput(e.target.value)}
                                                        maxLength={8}
                                                    />
                                                    <button
                                                        className={changeCodeLoading ? "play-button disabled" : "play-button enabled"}
                                                        style={{width:'auto', padding:'6px 16px', fontSize:'0.85rem'}}
                                                        onClick={changeSessionCode}
                                                        disabled={changeCodeLoading}
                                                    >
                                                        {changeCodeLoading ? t("changing") : t("change")}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="lobby-start-section">
                                <button
                                    className={(((!showAdvancedSettings && selectedAtlas=="") || (showAdvancedSettings && !isValidatedJSON)) || lobbyUsers.length <= 1)?"play-button disabled":"play-button enabled"}
                                    data-umami-event="start multiplayer button" data-umami-event-start-multi-altas={selectedAtlas}
                                    data-umami-event-start-multi-effective={!loading && selectedAtlas && lobbyUsers.length > 1}
                                    data-umami-event-start-multi-lobbysize={lobbyUsers.length}
                                    onClick={()=>{
                                        if(!loading && (selectedAtlas || (showAdvancedSettings && isValidatedJSON)) && lobbyUsers.length > 1){
                                            if (showAdvancedSettings) {
                                                const validation = validateCountdownStartTime(advancedSettingsJSON);
                                                if (!validation.isValid) {
                                                    setError(validation.error || "Invalid countdown configuration");
                                                    return;
                                                }
                                            }
                                            shouldKeepSessionRef.current = true;
                                            navigate(`/multiplayer/${sessionCode}/${sessionToken}`)
                                        } else {
                                            shouldKeepSessionRef.current = true;
                                            navigate(`/multiplayer/${sessionCode}/${sessionToken}`)
                                        }
                                    }}
                                >
                                    {t("start_game_button")}
                                </button>

                                {userIsAdmin && (
                                    <button
                                        className={((!showAdvancedSettings && selectedAtlas=="") || (showAdvancedSettings && !isValidatedJSON))?"play-button disabled":"play-button admin-green enabled"}
                                        onClick={handleOpenClassicChallengeModal}
                                    >
                                        {t("create_challenge") || "Create Challenge"}
                                    </button>
                                )}
                            </div>
                        </section>
                        </div>

                    </div>
                </div>
            )}

            {/* Challenge Success UI */}
            {sessionCode && challengeSavedSuccessfully && (
                <div className="challenge-success-page">
                    <div className="challenge-success-icon">✓</div>
                    <p className="challenge-success-title">
                        {lastCreatedChallengeType === 'classic'
                            ? (t("classic_challenge_created_successfully") || "Classic Challenge Created Successfully!")
                            : (t("challenge_saved_successfully") || "Challenge Saved Successfully!")
                        }
                    </p>
                    <div className="challenge-success-body">
                        {lastCreatedChallengeType === 'classic' && lastCreatedClassicChallenge && (
                            <div className="challenge-details-card">
                                <div className="challenge-detail-row">
                                    <span className="challenge-detail-label">{t("challenge_name") || "Nom"}</span>
                                    <span className="challenge-detail-value">{lastCreatedClassicChallenge.name}</span>
                                </div>
                                <div className="challenge-detail-row">
                                    <span className="challenge-detail-label">{t("start_date") || "Début"}</span>
                                    <span className="challenge-detail-value">{new Date(lastCreatedClassicChallenge.startDate).toLocaleString()}</span>
                                </div>
                                <div className="challenge-detail-row">
                                    <span className="challenge-detail-label">{t("end_date") || "Fin"}</span>
                                    <span className="challenge-detail-value">{new Date(lastCreatedClassicChallenge.endDate).toLocaleString()}</span>
                                </div>
                                <div className="challenge-detail-row">
                                    <span className="challenge-detail-label">{t("game_code") || "Code"}</span>
                                    <span className="challenge-detail-value challenge-detail-code">{sessionCode}</span>
                                </div>
                            </div>
                        )}
                        <QRCodeSVG
                            value={`${window.location.origin}/multiplayer/${sessionCode}`}
                            bgColor="#00000000"
                            fgColor="#FFFFFF"
                            size={120}
                        />
                    </div>
                </div>
            )}

            {/* Unified Challenge Creation Modal */}
            {showClassicChallengeModal && (
                <div className="challenge-modal-overlay" onClick={() => { setShowClassicChallengeModal(false); setClassicChallengeError(null); }}>
                    <div className="challenge-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{t("create_challenge") || "Create Challenge"}</h2>

                        {/* Type selector — clone du lang-switcher */}
                        <div className="challenge-type-switcher" ref={challengeTypeSwitcherRef}>
                            <div className="challenge-type-slider" style={challengeTypeSliderStyle} />
                            <button
                                className={`challenge-type-btn ${challengeModalType === 'classic' ? 'active' : ''}`}
                                onClick={() => setChallengeModalType('classic')}
                                disabled={creatingClassicChallenge || saveAsChallengeLoading}
                            >
                                {t("classic_challenge") || "Classique"}
                            </button>
                            <button
                                className={`challenge-type-btn ${challengeModalType === 'realtime' ? 'active' : ''}`}
                                onClick={() => setChallengeModalType('realtime')}
                                disabled={creatingClassicChallenge || saveAsChallengeLoading}
                            >
                                {t("realtime_challenge") || "Temps réel"}
                            </button>
                        </div>

                        {classicChallengeError && (
                            <div className="challenge-error">{classicChallengeError}</div>
                        )}

                        {/* Name — common to both */}
                        <div className="challenge-modal-field">
                            <label>{t("challenge_name") || "Challenge Name"} *</label>
                            <input
                                type="text"
                                value={classicChallengeName}
                                onChange={(e) => setClassicChallengeName(e.target.value)}
                                placeholder={t("enter_challenge_name") || "Enter challenge name"}
                                disabled={creatingClassicChallenge || saveAsChallengeLoading}
                            />
                        </div>

                        {/* Classic fields */}
                        {challengeModalType === 'classic' && (<>
                            <div className="challenge-modal-field">
                                <label>{t("start_date") || "Start Date"} *</label>
                                <input
                                    type="datetime-local"
                                    value={classicChallengeStartDate}
                                    onChange={(e) => setClassicChallengeStartDate(e.target.value)}
                                    min={new Date().toISOString().slice(0, 19)}
                                    disabled={creatingClassicChallenge}
                                />
                            </div>
                            <div className="challenge-modal-field">
                                <label>{t("end_date") || "End Date"} *</label>
                                <input
                                    type="datetime-local"
                                    value={classicChallengeEndDate}
                                    onChange={(e) => setClassicChallengeEndDate(e.target.value)}
                                    min={classicChallengeStartDate || new Date().toISOString().slice(0, 19)}
                                    disabled={creatingClassicChallenge}
                                />
                            </div>
                        </>)}

                        {/* Realtime fields */}
                        {challengeModalType === 'realtime' && (<>
                            <div className="challenge-modal-field">
                                <label>{t("challenge_start_time") || "Start time"} *</label>
                                <input
                                    type="datetime-local"
                                    value={countdownStartTime}
                                    onChange={(e) => setCountdownStartTime(e.target.value)}
                                    min={new Date().toISOString().slice(0, 16)}
                                    disabled={saveAsChallengeLoading}
                                />
                            </div>
                            <div className="challenge-modal-field challenge-modal-recurrence">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={enableRecurrence}
                                        onChange={(e) => setEnableRecurrence(e.target.checked)}
                                        disabled={saveAsChallengeLoading}
                                    />
                                    {" "}{t("enable_recurrence") || "Récurrence"}
                                </label>
                                {enableRecurrence && (
                                    <div className="challenge-recurrence-row">
                                        <span>{t("every") || "Tous les"}</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={recurrenceInterval}
                                            onChange={(e) => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                                            disabled={saveAsChallengeLoading}
                                            style={{width: '60px'}}
                                        />
                                        <select
                                            value={recurrenceType}
                                            onChange={(e) => setRecurrenceType(e.target.value as any)}
                                            disabled={saveAsChallengeLoading}
                                        >
                                            <option value="hour">{t("hour") || "heure(s)"}</option>
                                            <option value="day">{t("day") || "jour(s)"}</option>
                                            <option value="week">{t("week") || "semaine(s)"}</option>
                                            <option value="month">{t("month") || "mois"}</option>
                                            <option value="year">{t("year") || "an(s)"}</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        </>)}

                        <div className="challenge-modal-actions">
                            <button
                                className="challenge-modal-cancel"
                                onClick={() => {
                                    setShowClassicChallengeModal(false);
                                    setClassicChallengeName("");
                                    setClassicChallengeStartDate("");
                                    setClassicChallengeEndDate("");
                                    setClassicChallengeError(null);
                                }}
                                disabled={creatingClassicChallenge || saveAsChallengeLoading}
                            >
                                {t("cancel") || "Cancel"}
                            </button>
                            <button
                                className="challenge-modal-submit"
                                onClick={challengeModalType === 'classic' ? handleCreateClassicChallenge : handleSaveAsChallenge}
                                disabled={creatingClassicChallenge || saveAsChallengeLoading}
                            >
                                {(creatingClassicChallenge || saveAsChallengeLoading) ? (t("creating") || "Creating...") : (t("create_challenge") || "Create Challenge")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MultiplayerConfigScreen;

