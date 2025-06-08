export type AtlasRegion = {
  id: number;
  name: string;
  atlas: string;
  atlasName: string;
}

export type DisplayOptions = {
  displayType: "MultiPlanarRender" | "Axial" | "Sagittal" | "Coronal" | "Render" | "MultiPlanar";
  radiologicalOrientation: boolean;
  displayAtlas: boolean;
  displayOpacity: number;
}

export interface MultiplayerParametersType {
    atlas?: string
    regionsNumber: number;
    durationPerRegion: number;
    gameoverOnError: boolean;
}

export type ColorMap = {
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


export interface CustomTokenPayload {
  username?: string;
  firstname?: string;
  lastname?: string;
  publishToLeaderboard?: boolean|null;
}