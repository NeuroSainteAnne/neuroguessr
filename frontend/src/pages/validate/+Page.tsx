import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import "./ValidateEmailScreen.css"

function ValidateEmailScreen() {
    const { t, pageContext, updateToken } = useApp();
    const [isValidatedEmail, setIsValidatedEmail] = useState<boolean>(false);
    const [validatedErrorText, setValidatedErrorText] = useState<string>("");
    const [validatedSuccessText, setValidatedSuccessText] = useState<string>("");
    const {userId, token} = pageContext.routeParams;

    useEffect(() => {
        handleValidateEmail()
    }, [])

    const handleValidateEmail = async () => {                
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
            updateToken(result.token);
            setTimeout( () => {
              window.location.href = "/welcome";
            }, 1000);
          }
        } catch (error) {
          console.error('Error validating token:', error);
          setValidatedErrorText(t('server_error'))
        }
    }
    
  return (
    <>
        <title>NeuroGuessr - {t("validate_email_header")}</title>
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
