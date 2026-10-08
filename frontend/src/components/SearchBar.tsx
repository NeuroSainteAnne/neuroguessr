import { useRef, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { AtlasRegion } from '../types/types';
import "./SearchBar.css"
import { navigate } from 'vike/client/router'

function normalizeText(str: string): string {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function Searchbar({ inline = false }: { inline?: boolean }) {
  const { t, atlasRegions, pageContext, setAskedAtlas, setAskedRegion, askedAtlas } = useApp();
  const searchInput = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [suggestionList, setSuggestionList] = useState<AtlasRegion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const currentPath = pageContext?.urlPathname || '';
  const isNavigation = currentPath.includes('/singleplayer/navigation');

  // Register '/' shortcut: on non-inline instance, or on inline instance when in navigation (where only inline is rendered)
  useEffect(() => {
    if (inline && !isNavigation) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput = activeElement?.tagName === 'INPUT' ||
                      activeElement?.tagName === 'TEXTAREA' ||
                      (activeElement as HTMLElement)?.isContentEditable;
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [inline, isNavigation]);

  function searchAtlasRegions(query: string) {
    const normQuery = normalizeText(query);
    if (!normQuery) { setSuggestionList([]); setSelectedIndex(-1); return; }
    const matches = atlasRegions
      .filter(region => normalizeText(region.name).includes(normQuery))
      .sort((a, b) => {
        if (askedAtlas && isNavigation) {
          if (a.atlas === askedAtlas.atlas && b.atlas !== askedAtlas.atlas) return -1;
          if (a.atlas !== askedAtlas.atlas && b.atlas === askedAtlas.atlas) return 1;
        }
        const aIndex = normalizeText(a.name).indexOf(normQuery);
        const bIndex = normalizeText(b.name).indexOf(normQuery);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.name.length - b.name.length;
      });
    setSuggestionList(matches);
    setSelectedIndex(-1);
  }

  function handleSearchValidate(atlas: string, region: number) {
    if (isNavigation) {
      setAskedAtlas({ atlas });
      setAskedRegion(region);
      setSuggestionList([]);
      setSelectedIndex(-1);
      if (searchInput.current) searchInput.current.value = '';
      window.history.pushState(null, '', `/singleplayer/navigation/${atlas}/${region}`);
      window.dispatchEvent(new CustomEvent('navigation-region-selected'));
    } else {
      navigate(`/singleplayer/navigation/${atlas}/${region}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestionList.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(selectedIndex + 1, suggestionList.length - 1);
      setSelectedIndex(next);
      scrollSuggestionIntoView(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(selectedIndex - 1, 0);
      setSelectedIndex(prev);
      scrollSuggestionIntoView(prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = selectedIndex >= 0 ? selectedIndex : 0;
      const region = suggestionList[idx];
      if (region) handleSearchValidate(region.atlas, region.id);
    } else if (e.key === 'Escape') {
      setSuggestionList([]);
      setSelectedIndex(-1);
    }
  }

  function scrollSuggestionIntoView(index: number) {
    if (!suggestionsRef.current) return;
    const item = suggestionsRef.current.children[index] as HTMLElement;
    if (item) item.scrollIntoView({ block: 'nearest' });
  }

  const renderSuggestions = (listId?: string) => (
    <div id={listId} className="search-suggestions" ref={suggestionsRef}>
      {suggestionList.map((region, i) => {
        const isCurrentAtlas = askedAtlas && region.atlas === askedAtlas.atlas && isNavigation;
        let cls = "search-suggestion";
        if (isCurrentAtlas) cls += " current-atlas";
        if (i === selectedIndex) cls += " keyboard-selected";
        return (
          <div
            key={region.atlasName + "_" + region.name + "_" + region.id}
            className={cls}
            onMouseDown={() => handleSearchValidate(region.atlas, region.id)}
            dangerouslySetInnerHTML={{
              __html: `${region.name} <span style="color: #808588;">(${region.atlasName})</span>`
            }}
          />
        );
      })}
    </div>
  );

  if (inline) {
    return (
      <div className="search-container search-inline">
        <input
          type="text"
          className="search-input search-input-inline"
          placeholder={t("search_placeholder")}
          onChange={e => searchAtlasRegions(e.target.value)}
          onKeyDown={handleKeyDown}
          ref={searchInput}
          autoComplete="off" spellCheck="false"
        />
        {suggestionList.length > 0 && renderSuggestions()}
      </div>
    );
  }

  return (
    <>
      <div className="search-bar-container-main">
        <div className="search-container main-search">
          <input
            type="text"
            id="atlas-search"
            className="search-input"
            placeholder={t("search_placeholder")}
            onChange={e => searchAtlasRegions(e.target.value)}
            onKeyDown={handleKeyDown}
            ref={searchInput}
            autoComplete="off" spellCheck="false"
          />
          {suggestionList.length > 0 && renderSuggestions("search-suggestions")}
        </div>
      </div>
    </>
  );
}

export default Searchbar
