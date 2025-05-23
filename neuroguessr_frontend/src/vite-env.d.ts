/// <reference types="vite/client" />

type AppCallback = {
  startGame: (game: string) => void;
  gotoPage: (page: string) => void;
  handleChangeLanguage: (lang: string) => void;
  setCurrentPage: (page: string) => void;
  activateGuestMode: () => void;
  setIsLoggedIn: (isLoggedIn: boolean) => void;
  loginWithToken: (token: string) => void;
  logout: () => void;
};