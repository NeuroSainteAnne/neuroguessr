import { GameSelectorAtlas } from "../../GameSelectorAtlas"; 
import "./SingleSelector.css"; 

// This file is now just a clean wrapper for the Atlas+Mode selector component.
// All logic (Modes, Play button, etc.) has been moved to GameSelectorAtlas.tsx 
// to support the Split View design.

export function SingleSelector() {
    return (
        <GameSelectorAtlas />
    );
}