import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AtlasRegion } from '../types';
import "./SearchBar.css"
import { navigate } from 'vike/client/router'

function Searchbar() {
  const { t, atlasRegions, pageContext, setAskedAtlas, setAskedRegion, askedAtlas } = useApp();
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
        if(askedAtlas && isNeurotheka){
          if (a.atlas === askedAtlas && b.atlas !== askedAtlas) return -1;
          if (a.atlas !== askedAtlas && b.atlas === askedAtlas) return 1;
        }
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
      navigate(`/neurotheka/${atlas}/${region}`);
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
            {suggestionList.map((region) => {
              const isCurrentAtlas = (region.atlas === askedAtlas && isNeurotheka);
              const suggestionClassName = isCurrentAtlas ? "search-suggestion current-atlas" : "search-suggestion";
              return(<div
                key={region.atlasName+"_"+region.name+"_"+region.id}
                className={suggestionClassName}
                onClick={()=>{handleSearchValidate(region.atlas, region.id)}}
                dangerouslySetInnerHTML={{
                  __html: `${region.name} <span style="color: #808588;">(${region.atlasName})</span>`
                }}
              />)
            })}
          </div>}
        </div>
      </div>
    </>
  )
}

export default Searchbar
