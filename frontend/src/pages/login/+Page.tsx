import React, { useEffect } from 'react';
import { useRef, useState } from 'react';
import config from '../../../config.json';
import { useApp } from '../../context/AppContext';
import './LoginScreen.css';
import { navigate } from 'vike/client/router'
import Altcha from '../../components/Altcha';
import { consoleLog } from '../../utils/logging';

function LoginScreen() {
    const { t, currentLanguage, updateToken } = useApp();
    const usernameInput = useRef<HTMLInputElement>(null);
    const passwordInput = useRef<HTMLInputElement>(null);
    const recoveryEmailInput = useRef<HTMLInputElement>(null);
    const [recoveryModalDisplay, setRecoveryModalDisplay] = useState<boolean>(false);
    const [loginErrorText, setLoginErrorText] = useState<string>("");
    const [loginSuccessText, setLoginSuccessText] = useState<string>("");
    const [recoveryErrorText, setRecoveryErrorText] = useState<string>("");
    const [recoverySuccessText, setRecoverySuccessText] = useState<string>("");
    const [captchaLoad, setCaptchaLoad] = useState(false);
    const activateCaptcha = config.recaptcha.activate || false;
    const [captchaToken, setCaptchaToken] = useState<string>("");


    useEffect(() => {
      setCaptchaLoad(true)
    }, []);
    
    const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const username = usernameInput.current?.value.trim();
        const password = passwordInput.current?.value.trim();
        
        consoleLog("verbose", `Login attempt for user: ${username}`);

        // Clear previous error messages
        setLoginErrorText('');

        if (!username || !password) {
          consoleLog("verbose", "Login failed: empty username or password");
          setLoginErrorText(t('error_empty_fields'));
          return;
        }

        consoleLog("verbose", "Sending login request to server");
        try {
          // Send login request to the server
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
          });

          const result = await response.json();
          consoleLog("verbose", `Login response received: ${response.ok ? 'success' : 'failure'}`);

          if (response.ok) {            // Handle successful login
            setLoginErrorText('');
            setLoginSuccessText(t('login_success'));
            updateToken(result.token);
            const urlParams = new URLSearchParams(window.location.search);
            const redirectParam = urlParams.get('redirect');
            const returnUrl = urlParams.get('returnURL');
            
            consoleLog("verbose", `Login successful, processing redirect: ${redirectParam || returnUrl || 'default'}`);
            
            if (redirectParam) {
              window.history.replaceState({}, document.title, window.location.pathname); // Clean the URL
              if(redirectParam == "multiplayer-game"){
                const askedSC = urlParams.get('redirect_asked_session_code') || "";
                const askedST = urlParams.get('redirect_asked_session_token') || undefined;
                consoleLog("verbose", `Redirecting to multiplayer game: ${askedSC}`);
                navigate(`multiplayer-game/${askedSC}${askedST?"/"+askedST:""}`);
              } else if(redirectParam == "welcome"){
                const askedSubpage = urlParams.get('redirect_subpage') || "";
                consoleLog("verbose", `Redirecting to welcome subpage: ${askedSubpage}`);
                navigate(`/welcome/${askedSubpage}`);
              } else {
                consoleLog("verbose", `Redirecting to: ${redirectParam}`);
                navigate(`/${redirectParam}`);
              }
            } else if (returnUrl) {
              window.history.replaceState({}, document.title, window.location.pathname); // Clean the URL
              consoleLog("verbose", `Redirecting to return URL: ${returnUrl}`);
              navigate(returnUrl);
            } else {
              consoleLog("verbose", "No redirect specified, going to welcome page");
              navigate("/welcome");
            }
          } else {
            // Handle login failure
            consoleLog("verbose", `Login failed: ${result.message || 'unknown error'}`);
            setLoginErrorText(result.message || t('login_failed'));
          }
        } catch (error) {
          // Handle network or server errors
          console.error('Error during login:', error);
          consoleLog("verbose", `Login network error: ${error}`);
          setLoginErrorText(t('server_error'));
        }
    }

    const handleRecovery = async () => {
        const email = recoveryEmailInput.current?.value.trim();
        
        consoleLog("verbose", `Password recovery attempt for email: ${email?.substring(0, 3)}***`);

        // Clear previous messages
        setRecoveryErrorText("");

        if (!email) {
          consoleLog("verbose", "Password recovery failed: empty email");
          setRecoveryErrorText(t('error_empty_email'));
          return;
        } else if(activateCaptcha && !captchaToken){
          consoleLog("verbose", "Password recovery failed: captcha not verified");
          setRecoveryErrorText(t('error_captcha'));
          return;
        } 

        consoleLog("verbose", "Sending password recovery request");
        
        try {
          let formData: {
              email: string;
              language: string;
              captcha_token?: string;
          } = {
              email: email.trim(),
              language: currentLanguage
          };
          if(activateCaptcha){
            formData.captcha_token = captchaToken;
          }
          // Send recovery request to the server
          const response = await fetch('/api/password-recovery', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
          });

          const result = await response.json();
          consoleLog("verbose", `Password recovery response: ${response.ok ? 'success' : 'failure'}`);

          if (response.ok) {
            if(result.preverified){
                consoleLog("verbose", `Pre-verified recovery, redirecting to: ${result.redirect_url}`);
                navigate(result.redirect_url);
            } else {
              consoleLog("verbose", "Recovery email sent successfully");
              setRecoverySuccessText(t('recovery_email_sent'));
              setTimeout(()=>{
                setRecoveryModalDisplay(false)
              }, 1000)
            }
          } else {
            consoleLog("verbose", `Password recovery failed: ${result.message}`);
            setRecoveryErrorText(result.message || t('recovery_failed'));
          }
        } catch (error) {
          console.error('Error during password recovery:', error);
          consoleLog("verbose", `Password recovery network error: ${error}`);
          setRecoveryErrorText(t('server_error'));
        }

    }

    const handleAltchaChange = (ev: Event | CustomEvent<any>) => {
      const altchaEvent = ev as CustomEvent;
      if (altchaEvent.detail) {
        if(altchaEvent.detail.state && altchaEvent.detail.state === "verified"){
          setCaptchaToken(altchaEvent.detail.payload);
          setRecoveryErrorText("");
        } else if(altchaEvent.detail.state && altchaEvent.detail.state === "verifying"){
          // continue
        } else {
          console.warn("Altcha error:", altchaEvent.detail);
          setRecoveryErrorText(t('error_captcha'));
        }
      } else {
        console.warn("No Altcha");
        setCaptchaToken("");
        setRecoveryErrorText(t('error_captcha'));
      }
    }
    
    return <>
            <title>NeuroGuessr - Login</title>
            <form id="login_form" onSubmit={handleLogin}>
                <div className="login-box">
                    <h2>{t("login_mode")}</h2>
                    <div className="login-fields">
                        <div className="login-field">
                            <label htmlFor="username">{t("login_username_or_email")}</label>
                            <input type="text" id="username" name="username" ref={usernameInput} required />
                        </div>
                        <div className="login-field">
                            <label htmlFor="password">{t("login_password")}</label>
                            <input type="password" id="password" name="password" ref={passwordInput} required />
                        </div>
                    </div>
                    {loginErrorText != "" && <p className="login-message error">{loginErrorText}</p>}
                    {loginSuccessText != "" && <p className="login-message">{loginSuccessText}</p>}
                    <p className="login-message info">{t("beta_version_login_message")}</p>
                    <button type="submit" className="login-submit" data-umami-event="login button">{t("login_button")}</button>
                    <div className="login-links">
                        <a href="/register">{t("registration_link")}</a>
                        <a onClick={()=>{setRecoveryModalDisplay(true)}}>{t("forgot_password_link")}</a>
                    </div>
                </div>
            </form>
            { recoveryModalDisplay &&
                <div id="password-recovery-modal" className="modal" onClick={() => setRecoveryModalDisplay(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <span className="close-button" id="close-password-recovery" onClick={()=>{setRecoveryModalDisplay(false)}}>&times;</span>
                        <h2>{t("password_recovery_title")}</h2>
                        <p>{t("password_recovery_instructions")}</p>

                        <input type="email" id="recovery-email" className="form-field" 
                            placeholder={t("enter_your_email")} required ref={recoveryEmailInput} />
                                          
                        { recoverySuccessText == "" && activateCaptcha && captchaLoad && <div className="altcha-container">
                            <Altcha onStateChange={handleAltchaChange}/>
                          </div> }
                        { recoverySuccessText == "" && (
                          <button 
                            id="send-recovery-email"
                            data-umami-event="send recovery email" 
                            onClick={()=>handleRecovery()}
                            disabled={activateCaptcha && !captchaToken}
                            className={activateCaptcha && !captchaToken ? "button-disabled form-button" : "form-button"}
                          >
                            {activateCaptcha && !captchaToken ? t("verify_captcha_first") : t("send_recovery_email")}
                          </button>
                        )}

                        {recoveryErrorText && <p id="recovery_error" className="recovery-message">{recoveryErrorText}</p>}
                        {recoverySuccessText && <p id="recovery_success" className="recovery-message">{recoverySuccessText}</p>}
                    </div>
                </div>
            }
        </>
}

export default LoginScreen
