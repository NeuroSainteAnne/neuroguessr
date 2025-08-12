import neuroGuessrImage from "../../../public/interface/neuroguessr-360.png"

export default {
  title: 'neuroguessr_multiplayer_title',
  description: 'neuroguessr_multiplayer_description',
  image: neuroGuessrImage,
  // Disable prerendering for multiplayer pages with session codes
  // This allows SSR for dynamic routes while keeping SSG for static /multiplayer
  prerender: (pageContext) => {
    // Only prerender the base /multiplayer page, not session-specific URLs
    return pageContext.urlPathname === '/multiplayer'
  }
}