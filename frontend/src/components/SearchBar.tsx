import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AtlasRegion } from '../types';
import "./SearchBar.css"

function Searchbar() {
  const { t, atlasRegions, pageContext, setAskedAtlas, setAskedRegion } = useApp();
  const searchInput = useRef<HTMLInputElement>(null);
  const handleSearchUpdate = () => {
    searchAtlasRegions(searchInput.current?.value || "");
  }
  const [suggestionList, setSuggestionList] = useState<AtlasRegion[]>([])

  // Get the current path from pageContext
  const currentPath = pageContext?.urlPathname || '';
  const isNeurotheka = currentPath.includes('/neurotheka');
  
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
  function handleSearchValidate(atlas: string, region: number) {
    if(isNeurotheka){
      // Update state and URL without page reload
      setAskedAtlas(atlas)
      setAskedRegion(region)
      setSuggestionList([])
      // Use history.pushState to update URL without page reload
      window.history.pushState(null, '', `/neurotheka/${atlas}/${region}`);
    } else {
      // If not already on neurotheka page, do a full page navigation
      window.location.href = `/neurotheka/${atlas}/${region}`;
    }
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
                onClick={()=>{handleSearchValidate(region.atlas, region.id)}}
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
