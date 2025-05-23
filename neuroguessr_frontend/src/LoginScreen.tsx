import type { TFunction } from 'i18next';
import './LoginScreen.css'
import { useRef, useState } from 'react';

function LoginScreen({ t, callback }: { t: TFunction<"translation", undefined>, callback: AppCallback }) {
    const usernameInput = useRef<HTMLInputElement>(null);
    const passwordInput = useRef<HTMLInputElement>(null);
    const [recoveryModalDisplay, setRecoveryModalDisplay] = useState<boolean>(false);
    const [loginErrorText, setLoginErrorText] = useState<string>("");
    const [loginSuccessText, setLoginSuccessText] = useState<string>("");

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
    return (
        <>
        <div className="page-container">
            <form id="login_form" onSubmit={handleLogin}>
                <div className="login-box">
                    <h2>{t("login_mode")}</h2>
                    <table className="login-element">
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
                            placeholder={t("enter_your_email")} required />

                        <button id="send-recovery-email" className="form-button">{t("send_recovery_email")}</button>

                        <p id="recovery-message" className="recovery-message"></p>
                    </div>
                </div>
            }
        </div>
        </>
    )
}

export default LoginScreen
