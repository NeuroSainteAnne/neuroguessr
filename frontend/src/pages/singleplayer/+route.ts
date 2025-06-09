import { PageContext } from "vike/types"

export { route }
 
function route(pageContext: PageContext) {
  const parts = pageContext.urlPathname.split('/')
  if (parts[1] !== 'singleplayer') {
    return false
  } else {
    return {
      routeParams: {
        atlas: parts[2] || "",
        mode: parts[3] || ""
      }
    }
  }
}
