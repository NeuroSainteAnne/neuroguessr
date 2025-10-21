import { PageContext } from "vike/types"

export { route }
 
function route(pageContext: PageContext) {
  const parts = pageContext.urlPathname.split('/')
  if (parts[1] !== 'challenge-results') {
    return false
  } else {
    return {
      routeParams: {
        challengeId: parts[2] || ""
      }
    }
  }
}
