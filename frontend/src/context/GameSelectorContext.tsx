import React, { createContext, useContext, useState } from 'react';

type GameSelectorContextType = {
  selectedAtlas: string;
  setSelectedAtlas: React.Dispatch<React.SetStateAction<string>>;
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  selectedMode: string;
  setSelectedMode: React.Dispatch<React.SetStateAction<string>>;
};

const GameSelectorContext = createContext<GameSelectorContextType | undefined>(undefined);

export function GameSelectorProvider({ children }: { children: React.ReactNode }) {
  const [selectedAtlas, setSelectedAtlas] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("cortical_regions");
  const [selectedMode, setSelectedMode] = useState<string>("");

  return (
    <GameSelectorContext.Provider value={{
      selectedAtlas,
      setSelectedAtlas,
      selectedCategory,
      setSelectedCategory,
      selectedMode,
      setSelectedMode
    }}>
      {children}
    </GameSelectorContext.Provider>
  );
}

export function useGameSelector() {
  const context = useContext(GameSelectorContext);
  if (context === undefined) {
    throw new Error('useGameSelector must be used within a GameSelectorProvider');
  }
  return context;
}