import React, { use, useCallback, useEffect, useRef, useState } from 'react';
import { GoogleReCaptcha, GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import config from '../../../config.json';
import "./RegisterScreen.css";
import { useApp } from '../../context/AppContext';
import { navigate } from 'vike/client/router';

function RegisterScreen() {
  const { t, currentLanguage } = useApp();
  const usernameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const firstnameInput = useRef<HTMLInputElement>(null);
  const lastnameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmPasswordInput = useRef<HTMLInputElement>(null);
  const [registerErrorText, setRegisterErrorText] = useState<string>("");
  const [registerSuccessText, setRegisterSuccessText] = useState<string>("");
  const [captchaLoad, setCaptchaLoad] = useState(false);
  const activateCaptcha = config.recaptcha.activate || false;
  const captchaKey = config.recaptcha.siteKey || '';
  const [captchaToken, setCaptchaToken] = useState<string>("");

  const onCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);

  useEffect(() => {
    setCaptchaLoad(true)
  }, []);
  
  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = usernameInput.current?.value;
    const email = emailInput.current?.value;
    const firstname = firstnameInput.current?.value;
    const lastname = lastnameInput.current?.value;
    const password = passwordInput.current?.value;
    const confirmPassword = confirmPasswordInput.current?.value;
    // Email format validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

    if (!username || !email || !firstname || !lastname || !password || !confirmPassword) {
      setRegisterErrorText(t('error_empty_fields'));
      return;
    } else if(activateCaptcha && !captchaToken){
      setRegisterErrorText(t('error_captcha'));
      return;
    } else {
      if (!emailRegex.test(email.trim())) {
        setRegisterErrorText(t('error_invalid_email'));
        return;
      }
      if (!complexityRegex.test(password)) {
        setRegisterErrorText(t('error_password_complexity'))
        return;
      } else if (password !== confirmPassword) {
        setRegisterErrorText(t('error_password_mismatch'));
        return;
      }
    }

    let formData: {
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        password: string;
        captcha_token?: string;
        language?: string;
    } = {
        username: username.trim(),
        email: email.trim(),
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        password: password.trim(),
        language: currentLanguage
    };
    if(activateCaptcha){
      formData.captcha_token = captchaToken;
    }

    try {
        // Send the data to the server
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });
        const result = await response.json();
        if (response.ok) {
            if(result.preverified){
                setRegisterErrorText("");
                setRegisterSuccessText(t('register_success_no_verification'));
                setTimeout(() => {
                    navigate("/login");
                }, 1000);
            } else {
                setRegisterErrorText("");
                setRegisterSuccessText(t('register_success'));
            }
        } else {
            setRegisterErrorText(result.message || t('register_failed')); 
        }
    } catch (error) {
        // Handle network or other errors
        console.error('Error submitting the form:', error);
        setRegisterErrorText(t('server_error'));
    }

  }

  const formContent =     
  (<>
      <title>{t("neuroguessr_register_title")}</title>
      <form id="register_form" onSubmit={handleRegister}>
        <div className="register-box">
          <h2>{t("register_mode")}</h2>
          <table className="login-element">
            <tbody>
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
                <label id="email-label" htmlFor="email">{t("login_email")}</label>
              </td>
              <td>
                <input type="email" id="email" name="email" ref={emailInput} required />
              </td>
            </tr>
            <tr>
              <td>
                <label id="firstname-label" htmlFor="firstname">{t("login_firstname")}</label>
              </td>
              <td>
                <input type="text" id="firstname" name="firstname" ref={firstnameInput} required />
              </td>
            </tr>
            <tr>
              <td>
                <label id="lastname-label" htmlFor="lastname">{t("login_lastname")}</label>
              </td>
              <td>
                <input type="text" id="lastname" name="lastname" ref={lastnameInput} required />
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
            <tr>
              <td colSpan={2} id="password-helper" className="password-helper">
                {t("password_helper")}
              </td>
            </tr>
            <tr>
              <td>
                <label id="confirm_password-label" htmlFor="confirm_password">{t("login_confirm_password")}</label>
              </td>
              <td>
                <input type="password" id="confirm_password" name="confirm_password" ref={confirmPasswordInput} required />
              </td>
            </tr>
            {registerErrorText != "" && <tr>
              <td colSpan={2} id="register_error">
                {registerErrorText}
              </td>
            </tr>}
            {registerSuccessText != "" && <tr>
              <td colSpan={2} id="register_success">
                {registerSuccessText}
              </td>
            </tr>}
            </tbody>
          </table>
          {(activateCaptcha && captchaLoad) && <GoogleReCaptcha onVerify={onCaptchaVerify} />}
          {registerSuccessText == "" && <button type="submit">{t("register_button")}</button>}
        </div>
      </form>
    </>)

  return (activateCaptcha && captchaLoad) ? (
    <GoogleReCaptchaProvider
      reCaptchaKey={captchaKey}
      language={currentLanguage}
      scriptProps={{
        async: true, // Load script asynchronously
        defer: true, // Defer script execution
        appendTo: 'body', // Append to body
        nonce: undefined // Add nonce if you use CSP
      }}
    >
      {formContent}
    </GoogleReCaptchaProvider>
  ) : (
    formContent
  );
}

export default RegisterScreen
