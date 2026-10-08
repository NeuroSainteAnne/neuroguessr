import React, { useEffect, useRef, useState } from 'react';
import config from '../../../config.json';
import "./RegisterScreen.css";
import { useApp } from '../../context/AppContext';
import { navigate } from 'vike/client/router';
import Altcha from '../../components/Altcha';
import ClinicalTrialBox, { ClinicalTrialProps } from '../../components/ClinicalTrialBox';
import { consoleLog } from '../../utils/logging';

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
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [sentRequest, setSentRequest] = useState<boolean>(false);
  const [clinicalTrialData, setClinicalTrialData] = useState<ClinicalTrialProps>({
      clinicalTrialGender: null,
      clinicalTrialAge: null,
      clinicalTrialCountry: null,
      clinicalTrialOccupation: null,
      clinicalTrialConsent: "data_usage",
  })
  
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
    
    consoleLog("verbose", `Registration attempt for user: ${username}, email: ${email?.substring(0, 3)}***`);
    
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
        //return;
      } else if (password !== confirmPassword) {
        setRegisterErrorText(t('error_password_mismatch'));
        return;
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    let formData: {
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        password: string;
        captcha_token?: string;
        language?: string;
        clinical_trial_gender?: "male" | "female" | "other" | null;
        clinical_trial_age?: number | null;
        clinical_trial_country?: string | null;
        clinical_trial_occupation?: string | null;
        clinical_trial_consent?: "data_usage" | "acknowledgement" | "none" | null;
        returnUrl: string | null;
    } = {
        username: username.trim(),
        email: email.trim(),
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        password: password.trim(),
        language: currentLanguage,
        clinical_trial_gender: clinicalTrialData.clinicalTrialGender,
        clinical_trial_age: clinicalTrialData.clinicalTrialAge,
        clinical_trial_country: clinicalTrialData.clinicalTrialCountry,
        clinical_trial_occupation: clinicalTrialData.clinicalTrialOccupation,
        clinical_trial_consent: clinicalTrialData.clinicalTrialConsent,
        returnUrl: urlParams.get('returnURL') || null
    };
    if(activateCaptcha){
      formData.captcha_token = captchaToken;
    }
    
    consoleLog("verbose", "Sending registration request to server");

    try {
        // Send the data to the server
        setSentRequest(true);
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });
        const result = await response.json();
        consoleLog("verbose", `Registration response: ${response.ok ? 'success' : 'failure'}`);
        if (response.ok) {
            if(result.preverified){
                consoleLog("verbose", "Registration successful (pre-verified), redirecting to login");
                setRegisterErrorText("");
                setRegisterSuccessText(t('register_success_no_verification'));
                setTimeout(() => {
                    navigate("/login");
                }, 1000);
            } else {
                consoleLog("verbose", "Registration successful, email verification required");
                setRegisterErrorText("");
                setRegisterSuccessText(t('register_success'));
            }
        } else {
            consoleLog("verbose", `Registration failed: ${result.message}`);
            setRegisterErrorText(result.message || t('register_failed')); 
            setSentRequest(false);
        }
    } catch (error) {
        // Handle network or other errors
        console.error('Error submitting the form:', error);
        setRegisterErrorText(t('server_error'));
        setSentRequest(false);
    }

  }

  const handleAltchaChange = (ev: Event | CustomEvent<any>) => {
    const altchaEvent = ev as CustomEvent;
    if (altchaEvent.detail) {
      if(altchaEvent.detail.state && altchaEvent.detail.state === "verified"){
        setCaptchaToken(altchaEvent.detail.payload);
        setRegisterErrorText("");
      } else if(altchaEvent.detail.state && altchaEvent.detail.state === "verifying"){
        // continue
      } else {
        console.warn("Altcha error:", altchaEvent.detail);
        setRegisterErrorText(t('error_captcha'));
      }
    } else {
      console.warn("No Altcha");
      setCaptchaToken("");
      setRegisterErrorText(t('error_captcha'));
    }
  }

  return <>
      <title>{t("neuroguessr_register_title")}</title>
      <form id="register_form" onSubmit={handleRegister}>
        <div className="register-box">
          <h2>{t("register_mode")}</h2>
          <div className="beta-info">{t("beta_version_login_message")}</div>
          <div className="register-columns">
          <div className="register-fields">
            <div className="register-field">
              <label htmlFor="username">{t("login_username")}</label>
              <input type="text" id="username" name="username" ref={usernameInput} required />
            </div>
            <div className="register-field">
              <label htmlFor="email">{t("login_email")}</label>
              <input type="email" id="email" name="email" ref={emailInput} required />
            </div>
            <div className="register-field">
              <label htmlFor="firstname">{t("login_firstname")}</label>
              <input type="text" id="firstname" name="firstname" ref={firstnameInput} required />
            </div>
            <div className="register-field">
              <label htmlFor="lastname">{t("login_lastname")}</label>
              <input type="text" id="lastname" name="lastname" ref={lastnameInput} required />
            </div>
            <div className="register-field">
              <label htmlFor="password">{t("login_password")}</label>
              <input type="password" id="password" name="password" ref={passwordInput} required />
              <span className="password-helper">{t("password_helper")}</span>
            </div>
            <div className="register-field">
              <label htmlFor="confirm_password">{t("login_confirm_password")}</label>
              <input type="password" id="confirm_password" name="confirm_password" ref={confirmPasswordInput} required />
            </div>
          </div>
          <ClinicalTrialBox clinicalTrialData={clinicalTrialData} setClinicalTrialData={setClinicalTrialData} />
          </div>

          {registerErrorText != "" && <div id="register_error">{registerErrorText}</div>}
          {registerSuccessText != "" && <div id="register_success">{registerSuccessText}</div>}
          {registerSuccessText == "" && activateCaptcha && captchaLoad && (
            <div className="altcha-container">
              <Altcha onStateChange={handleAltchaChange}/>
            </div>
          )}
          {registerSuccessText == "" && (
            <button
              data-umami-event="register button"
              type="submit"
              disabled={activateCaptcha && (!captchaToken || sentRequest)}
              className={activateCaptcha && (!captchaToken || sentRequest) ? "button-disabled" : ""}
            >
              {activateCaptcha && !captchaToken ? t("verify_captcha_first") : t("register_button")}
            </button>
          )}
        </div>
      </form>
    </>
}

export default RegisterScreen
