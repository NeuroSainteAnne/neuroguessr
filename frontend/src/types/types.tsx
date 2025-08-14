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

export interface ExternalGameCommands {
  action: "load-atlas" | "guess" | "countdown";
  atlas?: string;
  regionId?: number;
  duration?: number;
  startTime?: string; // ISO date string for countdown action
  blindMode?: boolean;
}

export interface MultiplayerParametersType {
    atlas?: string
    regionsNumber: number;
    durationPerRegion: number;
    gameoverOnError: boolean;
    blindMode: boolean;
    commands?: ExternalGameCommands[];
    totalDuration?: number;
    public?: boolean;
}

export type ColorMap = {
  R: number[];
  G: number[];
  B: number[];
  A: number[];
  I: number[];
  min?: number;
  max?: number;
  labels: string[];
  centers?: number[][][];
  autocenter?: {
    center?: number[],
    zoom?: number
  }
};


export interface CustomTokenPayload {
  username?: string;
  firstname?: string;
  lastname?: string;
  id?: number;
  admin?: boolean;
  publishToLeaderboard?: boolean|null;
}

export type PastRegion = {
  regionId: number;
  regionName: string;
  isCorrect: boolean;
  score: number;
  distance: number;
  clickedPosition?: {
    mm: number[];
    vox: number[];
  };
  regionCenter?: number[];
  atlas: string;
}

export type Challenge = {
  sessionCode: string;
  startTime: string;
  atlas?: string;
  totalDuration?: number;
  name?: string;
  creator: string;
  createdAt: string;
  isPublic?: boolean;
}

export type ImageMetadata = {
  // unique if of image
  id: string
  // data type
  datatypeCode: number
  // number of columns
  nx: number
  // number of rows
  ny: number
  // number of slices
  nz: number
  // number of volumes
  nt: number
  // space between columns
  dx: number
  // space between rows
  dy: number
  // space between slices
  dz: number
  // time between volumes
  dt: number
  // bits per voxel
  // TODO was documented as bpx
  bpv: number
}
