import { PageContext } from "vike/types"

export { route }
 
function route(pageContext: PageContext) {
  const parts = pageContext.urlPathname.split('/')
  if (parts[1] !== 'multiplayer') {
    return false
  } else {
    return {
      routeParams: {
        askedSessionCode: parts[2] || "",
        askedSessionToken: parts[3] || ""
      }
    }
  }
}
