import { useApp } from '../../context/AppContext';
import GameSelector from './GameSelector';
import SearchBar from '../../components/SearchBar';
import './GameSelectorWithSearch.css';

export function GameSelectorWithSearch({ forceTab }: { forceTab?: string } = {}) {
  const { atlasRegions } = useApp();

  return (
    <div className="game-selector-with-search">
      <GameSelector forceTab={forceTab || ""} />
      {atlasRegions.length > 0 && <SearchBar />}
    </div>
  );
}
