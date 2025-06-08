import { PageContext } from "vike/types"

export { route }
 
function route(pageContext: PageContext) {
  const parts = pageContext.urlPathname.split('/')
  if (parts[1] !== 'neurotheka') {
    return false
  } else {
    return {
      routeParams: {
        atlas: parts[2] || "",
        region: parts[3] || ""
      }
    }
  }
}
