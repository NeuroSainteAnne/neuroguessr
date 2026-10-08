import { SourceElement } from "../context/AppContext";

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
  brainOpacity: number;
  clipPlane: number; // -1 (fully clipped) to 1 (no clip), passed as depth to setClipPlane
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
    atlas?: string | undefined;
    regionsNumber: number;
    durationPerRegion: number;
    gameoverOnError: boolean;
    blindMode: boolean;
    commands?: ExternalGameCommands[] | undefined;
    totalDuration?: number | undefined;
    public?: boolean | undefined;
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
  info?: string[];
  info_detail?: string[];
  info_source?: SourceElement[][];
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
  id: number;
  regionId: number;
  isCorrect: boolean;
  score: number;
  distance: number;
  clickedPosition?: {
    mm: number[];
    vox: number[];
  } | undefined;
  regionCenter?: number[] | undefined;
  regionBoundary?: number[] | undefined;
  atlas: string;
  clickedRegionName?: string | undefined;
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

export interface ClassicChallenge {
  type: 'classic';
  id: number;
  sessionCode: string;
  name?: string;
  startDate: string;
  endDate: string;
  public: boolean;
  creator: string;
  atlas: string;
  totalDuration: number;
  status: 'upcoming' | 'active' | 'ended';
  createdAt: string;
  isNext?: boolean;
}

export interface RTChallenge {
  type: 'realtime';
  sessionCode: string;
  startTime: string;
  name?: string;
  isNext?: boolean;
}

export type Challenge = ClassicChallenge | RTChallenge;