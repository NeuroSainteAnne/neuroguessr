import { PageContext } from "vike/types"

export { route }
 
function route(pageContext: PageContext) {
  const parts = pageContext.urlPathname.split('/')
  if (parts[1] !== 'singleplayer') {
    return false
  } else {
    // Extract URL query parameters
    const url = pageContext.urlOriginal
    const queryString = url.includes('?') ? url.split('?')[1] : ''
    const queryParams = new URLSearchParams(queryString)
    
    return {
      routeParams: {
        atlas: parts[2] || "",
        mode: parts[3] || "",
        blind: queryParams.get('blind') || "false"
      }
    }
  }
}
