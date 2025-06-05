/// <reference types="vite/client" />

type AppCallback = {
  handleChangeLanguage: (lang: string) => void;
  activateGuestMode: () => void;
  setIsLoggedIn: (isLoggedIn: boolean) => void;
  updateToken: (token: string|null) => void;
  launchNeurotheka: (region: Partial<AtlasRegion>) => void;
  launchSinglePlayerGame: (atlas: string, mode: string) => void;
  logout: () => void;
  setHeaderText: (text: string) => void;
  setHeaderTextMode: (mode: string) => void;
  setHeaderStreak: (streak: string) => void;
  setHeaderTime: (time: string) => void;
  setHeaderScore: (score: string) => void;
  setHeaderErrors: (errors: string) => void;
  setViewerOption: (option: DisplayOptions) => void;
};

type AtlasRegion = {
  id: number;
  name: string;
  atlas: string;
  atlasName: string;
}

type DisplayOptions = {
  displayType: "MultiPlanarRender" | "Axial" | "Sagittal" | "Coronal" | "Render" | "MultiPlanar";
  radiologicalOrientation: boolean;
  displayAtlas: boolean;
  displayOpacity: number;
}

interface MultiplayerParametersType {
    atlas?: string
    regionsNumber: number;
    durationPerRegion: number;
    gameoverOnError: boolean;
}

type ColorMap = {
  R: number[];
  G: number[];
  B: number[];
  A: number[];
  I: number[];
  min?: number;
  max?: number;
  labels?: string[];
  centers?: number[][];
};


interface CustomTokenPayload {
  username?: string;
  firstname?: string;
  lastname?: string;
  publishToLeaderboard?: boolean|null;
}