import './Searchbar.css'

function Searchbar() {
  return (
    <>
        <div className="search-bar-container-main">
            <div className="search-container main-search">
                <input
                    type="text"
                    id="atlas-search"
                    data-i18n="[placeholder]search_placeholder"
                    className="search-input"
                    placeholder="Search for a brain region"
                />
                <div id="search-suggestions" className="search-suggestions"></div>
            </div>
        </div>
    </>
  )
}

export default Searchbar
