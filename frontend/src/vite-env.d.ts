/// <reference types="vite/client" />

type AppCallback = {
  startGame: (game: string) => void;
  gotoPage: (page: string) => void;
  handleChangeLanguage: (lang: string) => void;
  activateGuestMode: () => void;
  setIsLoggedIn: (isLoggedIn: boolean) => void;
  loginWithToken: (token: string) => void;
  openNeurotheka: (region: AtlasRegion) => void;
  logout: () => void;
  setHeaderText: (text: string) => void;
  setHeaderTextMode: (mode: string) => void;
  setHeaderStreak: (streak: string) => void;
  setHeaderTime: (time: string) => void;
  setHeaderScore: (score: string) => void;
  setHeaderErrors: (errors: string) => void;
  setViewerOption: (option: DisplayOptions) => void;
  launchSinglePlayerGame: (atlas: string, mode: string) => void;
  launchMultiPlayerGame: (sessionCode: string, sessionToken: string|undefined) => void;
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