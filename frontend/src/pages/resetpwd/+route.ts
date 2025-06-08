import { PageContext } from "vike/types"

export { route }
 
function route(pageContext: PageContext) {
  const parts = pageContext.urlPathname.split('/')
  if (parts[1] !== 'resetpwd') {
    return false
  } else {
    return {
      routeParams: {
        userId: parts[2] || "",
        token: parts[3] || ""
      }
    }
  }
}
