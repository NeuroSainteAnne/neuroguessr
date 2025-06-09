import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import './ResetPasswordScreen.css';
import '../register/RegisterScreen.css';
import { navigate } from 'vike/client/router';

function ResetPasswordScreen() {
    const { t, updateToken, pageContext } = useApp();
    const [isCheckedToken, setIsCheckedToken] = useState<boolean>(false);
    const usernameInput = useRef<HTMLInputElement>(null);
    const passwordInput = useRef<HTMLInputElement>(null);
    const confirmPasswordInput = useRef<HTMLInputElement>(null);
    const [recoveryErrorText, setRecoveryErrorText] = useState<string>("");
    const [recoverySuccessText, setRecoverySuccessText] = useState<string>("");
    const {userId, token} = pageContext.routeParams;
    
    useEffect(() => {
        handleCheckToken()
    }, [])

    const handleCheckToken = async () => {
        // Validate token before showing the form
        if (!token || !userId) {
          setRecoveryErrorText(t('error_invalid_token'));
        }
              
        try {
          const response = await fetch('/api/validate-reset-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: userId, token }),
          });

          const result = await response.json();

          if (!response.ok) {
            setRecoveryErrorText(t('error_invalid_token'));
          } else {
            setIsCheckedToken(true)
          }
        } catch (error) {
          console.error('Error validating token:', error);
          setRecoveryErrorText(t('server_error'))
        }

    }

    const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const newPassword = passwordInput.current?.value;
        const confirmPassword = confirmPasswordInput.current?.value;
        console.log(newPassword, confirmPassword)
        // Validate password complexity
          const complexityOptions = {
              min: 8,
              lowerCase: 1,
              upperCase: 1,
              numeric: 1,
              symbol: 1,
              requirementCount: 4,
          };

          // Construct the regex dynamically based on complexityOptions
          const complexityRegexParts = [];
          if (complexityOptions.lowerCase) complexityRegexParts.push('(?=.*[a-z])');
          if (complexityOptions.upperCase) complexityRegexParts.push('(?=.*[A-Z])');
          if (complexityOptions.numeric) complexityRegexParts.push('(?=.*\\d)');
          if (complexityOptions.symbol) complexityRegexParts.push('(?=.*[@$!%*?&])');
          const complexityRegex = new RegExp(
          `^${complexityRegexParts.join('')}.{${complexityOptions.min},}$`
          );

          // Validate passwords
          if (!newPassword || !confirmPassword) {
            setRecoveryErrorText(t('error_empty_fields'));
            return;
          }

          if (newPassword !== confirmPassword) {
            setRecoveryErrorText(t('error_password_mismatch'));
            return;
          }

          if (!complexityRegex.test(newPassword)) {
            setRecoveryErrorText(t('error_password_complexity'));
            return
          }

          if (!token || !userId) {
            setRecoveryErrorText(t('error_invalid_token')); 
            return;
          }
                
          // Send the new password to the server
          try {
            const response = await fetch('/api/reset-password', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ id:userId, token:token, password:newPassword }),
            });

            const result = await response.json();

            if (response.ok) {
              setRecoverySuccessText(t('password_reset_success'));
              updateToken(result.token);
              setTimeout(() => {
                navigate("/welcome");
              }, 500);
            } else {
              setRecoveryErrorText(result.message || t('password_reset_failed'));
            }
          } catch (error) {
            console.error('Error resetting password:', error);
            setRecoveryErrorText(t('server_error'));
          }
    }
    return(
    <>
      <title>{`NeuroGuessr - ${t("reset_password_header")}`}</title>
        <form id="reset-password-form" onSubmit={handleResetPassword}>
          <div className="register-box">
              <h2>{t("reset_password_header")}</h2>
              <table className="login-element">
                <tbody>
                  {isCheckedToken && <tr className="password-reset-units">
                      <td>
                          <label id="password-label" htmlFor="password">{t("new_password_label")}</label>
                      </td>
                      <td>
                          <input type="password" id="password" name="password" required ref={passwordInput} />
                      </td>
                  </tr> }
                  {isCheckedToken && <tr className="password-reset-units">
                      <td colSpan={2} id="password-helper" className="password-helper">
                          {t("password_helper")}
                      </td>
                  </tr> }
                  {isCheckedToken && <tr className="password-reset-units">
                      <td>
                          <label id="confirm_password-label" htmlFor="confirm_password">{t("login_confirm_password")}</label>
                      </td>
                      <td>
                          <input type="password" id="confirm_password" name="confirm_password" required ref={confirmPasswordInput} />
                      </td>
                  </tr>}
                  {recoveryErrorText &&
                    <tr><td colSpan={2} id="recovery_error" className="recovery-message">{recoveryErrorText}</td></tr>}
                  {recoverySuccessText &&
                    <tr><td colSpan={2} id="recovery_success" className="recovery-message">{recoverySuccessText}</td></tr>}
                </tbody>
              </table>

              {isCheckedToken && <button type="submit"  data-umami-event="reset password button" className="password-reset-units">{t("reset_password_button")}</button>}
          </div>
      </form>
    </>
    )
}

export default ResetPasswordScreen;