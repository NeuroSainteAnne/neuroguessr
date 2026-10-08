import { PageContext } from "vike/types"

export { route }
 
function route(pageContext: PageContext) {
  const parts = pageContext.urlPathname.split('/')
  if (parts[1] !== 'welcome') {
    return false
  } else {
    if(!parts[2] || parts[2] == 'singleplayer' || parts[2] == 'multiplayer-create'){
      return {
        routeParams: {
          category: parts[3] || "",
          atlas: parts[4] || "",
          gameMode: parts[5] || ""
        }
      }
    }
  }
  return false
}
