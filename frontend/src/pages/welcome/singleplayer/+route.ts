import { PageContext } from "vike/types"

export { route }
 
function route(pageContext: PageContext) {
  const parts = pageContext.urlPathname.split('/')
  if (parts[1] !== 'welcome') {
    return false
  } else {
    if(!parts[2] || parts[2] == 'singleplayer') {
      return {
        routeParams: {}
      }
    }
  }
  return false
}
