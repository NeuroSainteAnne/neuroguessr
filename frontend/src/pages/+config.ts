import vikeReact from 'vike-react/config'

// https://vike.dev/config
export default {
  favicon: '/favico/favicon.ico',
  extends: [vikeReact],
  onRenderClient: 'import:../renderer/+onRenderClient:onRenderClient',
  onRenderHtml: 'import:../renderer/+onRenderHtml:onRenderHtml',
  Head: true
}