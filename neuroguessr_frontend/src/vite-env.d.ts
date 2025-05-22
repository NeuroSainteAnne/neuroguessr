/// <reference types="vite/client" />

type AppCallback = {
  startGame: (game: string) => void;
  gotoPage: (page: string) => void;
};