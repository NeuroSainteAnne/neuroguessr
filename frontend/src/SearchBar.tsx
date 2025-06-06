import React from 'react';
import type { TFunction } from 'i18next'
import atlasFiles from './atlas_files'
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Searchbar({ t, callback, atlasRegions }:
  { t: TFunction<"translation", undefined>, callback: AppCallback, atlasRegions: AtlasRegion[] }) {
  const searchInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const handleSearchUpdate = () => {
    searchAtlasRegions(searchInput.current?.value || "");
  }
  const [suggestionList, setSuggestionList] = useState<AtlasRegion[]>([])

  // Search across all atlas regions
  function searchAtlasRegions(query: string) {
    const lowerQuery = query.toLowerCase();
    const matches = atlasRegions
      .filter(region => region.name.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        const aIndex = a.name.toLowerCase().indexOf(lowerQuery);
        const bIndex = b.name.toLowerCase().indexOf(lowerQuery);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.name.length - b.name.length;
      });
    setSuggestionList(matches)
  }

  return (
    <>
      <link rel="stylesheet" href="/assets/styles/SearchBar.css" />
      <div className="search-bar-container-main">
        <div className="search-container main-search">
          <input
            type="text"
            id="atlas-search"
            className="search-input"
            placeholder={t("search_placeholder")}
            onChange={handleSearchUpdate}
            ref={searchInput}
            autoComplete="off" spellCheck="false"
          />
          {suggestionList.length > 0 && 
            <div id="search-suggestions" className="search-suggestions">
            {suggestionList.map((region) => (
              <div
                key={region.atlasName+"_"+region.name+"_"+region.id}
                className="search-suggestion"
                onClick={() => { navigate(`/neurotheka/${region.atlas}/${region.id}`); setSuggestionList([]); }}
                dangerouslySetInnerHTML={{
                  __html: `${region.name} <span style="color: #808588;">(${region.atlasName})</span>`
                }}
              />
            ))}
          </div>}
        </div>
      </div>
    </>
  )
}

export default Searchbar
