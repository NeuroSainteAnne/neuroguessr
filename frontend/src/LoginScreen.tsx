import type { TFunction } from 'i18next';
import './LoginScreen.css'
import { useRef, useState } from 'react';

function LoginScreen({ t, callback }: { t: TFunction<"translation", undefined>, callback: AppCallback }) {
    const usernameInput = useRef<HTMLInputElement>(null);
    const passwordInput = useRef<HTMLInputElement>(null);
    const recoveryEmailInput = useRef<HTMLInputElement>(null);
    const [recoveryModalDisplay, setRecoveryModalDisplay] = useState<boolean>(false);
    const [loginErrorText, setLoginErrorText] = useState<string>("");
    const [loginSuccessText, setLoginSuccessText] = useState<string>("");
    const [recoveryErrorText, setRecoveryErrorText] = useState<string>("");
    const [recoverySuccessText, setRecoverySuccessText] = useState<string>("");

    const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const username = usernameInput.current?.value.trim();
        const password = passwordInput.current?.value.trim();

        // Clear previous error messages
        setLoginErrorText('');

        if (!username || !password) {
          setLoginErrorText(t('error_empty_fields'));
          return;
        }

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

          if (response.ok) {
            // Handle successful login
            setLoginErrorText('');
            setLoginSuccessText(t('login_success'));
            callback.loginWithToken(result.token);
            callback.gotoPage("welcome");
          } else {
            // Handle login failure
            setLoginErrorText(result.message || t('login_failed'));
          }
        } catch (error) {
          // Handle network or server errors
          console.error('Error during login:', error);
          setLoginErrorText(t('server_error'));
        }
    }

    const handleRecovery = async () => {
        const email = recoveryEmailInput.current?.value.trim();
        const recoveryMessage = document.getElementById('recovery-message');

        // Clear previous messages
        setRecoveryErrorText("");

        if (!email) {
          setRecoveryErrorText(t('error_empty_email'));
          return;
        }

        try {
          // Send recovery request to the server
          const response = await fetch('/api/password-recovery', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
          });

          const result = await response.json();

          if (response.ok) {
            if(result.preverified){
                alert(result.redirect_url)
                window.location.href = result.redirect_url;
            } else {
              setRecoverySuccessText(t('recovery_email_sent'));
            }
          } else {
            setRecoveryErrorText(result.message || t('recovery_failed'));
          }
        } catch (error) {
          console.error('Error during password recovery:', error);
          setRecoveryErrorText(t('server_error'));
        }

    }

    return (
        <>
        <div className="page-container">
            <form id="login_form" onSubmit={handleLogin}>
                <div className="login-box">
                    <h2>{t("login_mode")}</h2>
                    <table className="login-element">
                        <tr>
                            <td colSpan={2} id="login_error">
                                {t("beta_version_login_message")}
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <label id="username-label" htmlFor="username">{t("login_username")}</label>
                            </td>
                            <td>
                                <input type="text" id="username" name="username" ref={usernameInput} required />
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <label id="password-label" htmlFor="password">{t("login_password")}</label>
                            </td>
                            <td>
                                <input type="password" id="password" name="password" ref={passwordInput} required />
                            </td>
                        </tr>
                        {loginErrorText != "" && <tr>
                            <td colSpan={2} id="login_error">
                                {loginErrorText}
                            </td>
                        </tr>}
                        {loginSuccessText != "" && <tr>
                            <td colSpan={2} id="login_success">
                                {loginSuccessText}
                            </td>
                        </tr>}
                    </table>
                    <button type="submit">{t("login_button")}</button>
                    <a id="registration_link" onClick={()=>callback.gotoPage("register")}>
                        {t("registration_link")}
                    </a>
                    <a id="forgot_password_link" onClick={()=>setRecoveryModalDisplay(true)}>{t("forgot_password_link")}</a>
                </div>
            </form>
            { recoveryModalDisplay &&
                <div id="password-recovery-modal" className="modal">
                    <div className="modal-content">
                        <span className="close-button" id="close-password-recovery">&times;</span>
                        <h2>{t("password_recovery_title")}</h2>
                        <p>{t("password_recovery_instructions")}</p>

                        <input type="email" id="recovery-email" className="form-field" 
                            placeholder={t("enter_your_email")} required ref={recoveryEmailInput} />

                        <button id="send-recovery-email" className="form-button" onClick={()=>handleRecovery()}>{t("send_recovery_email")}</button>

                        {recoveryErrorText && <p id="recovery_error" className="recovery-message">{recoveryErrorText}</p>}
                        {recoverySuccessText && <p id="recovery_success" className="recovery-message">{recoverySuccessText}</p>}
                    </div>
                </div>
            }
        </div>
        </>
    )
}

export default LoginScreen
