import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function ValidateEmailScreen({t, callback}:{ t: TFunction<"translation", undefined>, callback: AppCallback }) {
    const [isValidatedEmail, setIsValidatedEmail] = useState<boolean>(false);
    const [validatedErrorText, setValidatedErrorText] = useState<string>("");
    const [validatedSuccessText, setValidatedSuccessText] = useState<string>("");

    useEffect(() => {
        handleValidateEmail()
    }, [])
    const navigate = useNavigate();

    const handleValidateEmail = async () => {
        // Extract token from URL
        const hash = window.location.hash.replace(/^#\/?/, "");
        const parts = hash.split("/");
        const userId = parts[1];
        const token = parts[2];
                
        if (!token || !userId) {
          setValidatedErrorText(t('error_invalid_token'));
        }  
        try {
          const response = await fetch('/api/verify-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: userId, token }),
          });

          const result = await response.json();

          if (!response.ok) {
            setValidatedErrorText(t('error_invalid_token'));
          } else {
            setValidatedSuccessText(t('success_email_verified'));
            setTimeout( () => {
              callback.updateToken(result.token);
              navigate("/welcome");
            }, 1000);
          }
        } catch (error) {
          console.error('Error validating token:', error);
          setValidatedErrorText(t('server_error'))
        }
    }
    
  return (
    <>
        <link rel="stylesheet" href="/assets/styles/ValidateEmailScreen.css" />
        <div className="register-box">
            <h2>{t("validate_email_header")}</h2>
            <table className="login-element">
                {!validatedErrorText && !validatedSuccessText &&
                  <tr><td colSpan={2} className="recovery-message">{t("email_validation_wait")}</td></tr>}
                {validatedErrorText &&
                  <tr><td colSpan={2} id="recovery_error" className="recovery-message">{validatedErrorText}</td></tr>}
                {validatedSuccessText &&
                  <tr><td colSpan={2} id="recovery_success" className="recovery-message">{validatedSuccessText}</td></tr>}
            </table>
        </div>
    </>
  )
}

export default ValidateEmailScreen
