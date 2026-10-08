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
        mode: parts[2] || "",
        atlas: parts[3] || "",
        region: parts[4] || "",
        blind: queryParams.get('blind') || "false",
        replay_session: queryParams.get('replay_session') || ""
      }
    }
  }
}
