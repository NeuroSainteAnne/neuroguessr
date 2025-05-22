import type { TFunction } from 'i18next'
import './Searchbar.css'

function Searchbar({t, callback}:{ t: TFunction<"translation", undefined>, callback: AppCallback }) {
  return (
    <>
        <div className="search-bar-container-main">
            <div className="search-container main-search">
                <input
                    type="text"
                    id="atlas-search"
                    data-i18n="[placeholder]search_placeholder"
                    className="search-input"
                    placeholder={t("search_placeholder")}
                />
                <div id="search-suggestions" className="search-suggestions"></div>
            </div>
        </div>
    </>
  )
}

export default Searchbar
