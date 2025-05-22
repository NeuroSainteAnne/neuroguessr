import type { TFunction } from 'i18next';
import './LoginScreen.css'

function LoginScreen({t, callback}:{ t: TFunction<"translation", undefined>, callback: AppCallback }) {
  return (
    <>
        <div>Placeholder for login screen</div>
        <div>Placeholder for <a onClick={(e)=>callback.gotoPage("register")}>register link</a></div>
    </>
  )
}

export default LoginScreen
