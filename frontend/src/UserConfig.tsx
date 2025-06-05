import { useEffect, useRef, useState } from 'react';
import './UserConfig.css'
import type { TFunction } from 'i18next';

function UserConfig({t, callback, authToken}: 
    { t: TFunction<"translation", undefined>, callback: AppCallback, authToken: string }) {
    const usernameInput = useRef<HTMLInputElement>(null);
    const emailInput = useRef<HTMLInputElement>(null);
    const firstnameInput = useRef<HTMLInputElement>(null);
    const lastnameInput = useRef<HTMLInputElement>(null);
    const passwordInput = useRef<HTMLInputElement>(null);
    const publishToLeaderboardInput = useRef<HTMLInputElement>(null);
    const confirmPasswordInput = useRef<HTMLInputElement>(null);
    const [reconfigureErrorText, setReconfigureErrorText] = useState<string>("");
    const [reconfigureSuccessText, setReconfigureSuccessText] = useState<string>("");

    useEffect(()=>{
        handleLoadUserData()
    }, [])

    const handleLoadUserData = async () => {
        try {
          // Fetch user info from the API
          const response = await fetch('/api/user-info', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
              'Content-Type': 'application/json',
            },
          });

          const result = await response.json();

          if (response.ok) {
            // Populate the form fields with user data
            if(usernameInput.current) usernameInput.current.value = result.user.username;
            if(emailInput.current) emailInput.current.value = result.user.email;
            if(firstnameInput.current) firstnameInput.current.value = result.user.firstname;
            if(lastnameInput.current) lastnameInput.current.value = result.user.lastname;
            if(publishToLeaderboardInput.current){
                if(result.user.publishToLeaderboard === null)
                    publishToLeaderboardInput.current.indeterminate = true
                else
                    publishToLeaderboardInput.current.checked = result.user.publishToLeaderboard;
            } 
          } else {
            // Handle errors (e.g., unauthorized or user not found)
            setReconfigureErrorText(result.message || t('error_loading_user_info'));
          }
        } catch (error) {
          console.error('Error loading user info:', error);
          setReconfigureErrorText(t('server_error'));
        }
    }

    const handleReconfigure = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const firstname = firstnameInput.current?.value;
        const lastname = lastnameInput.current?.value;
        const password = passwordInput.current?.value;
        const confirmPassword = confirmPasswordInput.current?.value
        const publishToLeaderboard = publishToLeaderboardInput.current?.indeterminate ? null : publishToLeaderboardInput.current?.checked || false;

        // Clear previous error messages
        setReconfigureErrorText("")

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

        if (!firstname || !lastname) {
            setReconfigureErrorText(t('error_empty_fields'));
            return;
        } else {
            if (password && !complexityRegex.test(password)) {
                setReconfigureErrorText(t('error_password_complexity'));
                return;
            } else if (password !== confirmPassword) {
                setReconfigureErrorText(t('error_password_mismatch'));
                return;
            }
        }

        // Prepare the data to send
        let formData : Record<string,string|boolean|null> = {
            firstname: firstname.trim(),
            lastname: lastname.trim(),
        };
        if (publishToLeaderboard !== null) {
            formData.publishToLeaderboard = publishToLeaderboard;
        }
        if (password) {
            formData.password = password.trim();
        }

        try {
            // Send the data to the server
            const response = await fetch('/api/config-user', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (response.ok) {
                setReconfigureSuccessText(t('reconfigure_success'));
                callback.updateToken(result.token);
            } else {
                setReconfigureErrorText(result.message || t('reconfigure_failed'));
            }
        } catch (error) {
            // Handle network or other errors
            console.error('Error submitting the form:', error);
            setReconfigureErrorText(t('server_error'));
        }
    }
    
    return(
    <>
        <form id="reconfigure_form" onSubmit={handleReconfigure}>
            <div className="register-box">
                <h2>{t("reconfigure_mode")}</h2>
                <table className="login-element">
                    <tbody>
                    <tr>
                        <td>
                            <label id="username-label" htmlFor="username">{t("login_username")}</label>
                        </td>
                        <td>
                            <input type="text" id="username" name="username" ref={usernameInput} disabled />
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <label id="email-label" htmlFor="email">{t("login_email")}</label>
                        </td>
                        <td>
                            <input type="email" id="email" name="email" ref={emailInput} disabled />
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <label id="firstname-label" htmlFor="firstname">{t("login_firstname")}</label>
                        </td>
                        <td>
                            <input type="text" id="firstname" name="firstname" required ref={firstnameInput} />
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <label id="lastname-label" htmlFor="email">{t("login_lastname")}</label>
                        </td>
                        <td>
                            <input type="text" id="lastname" name="lastname" required ref={lastnameInput} />
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <label id="password-label" htmlFor="password">{t("login_password")}</label>
                        </td>
                        <td>
                            <input type="password" id="password" name="password" ref={passwordInput} />
                        </td>
                    </tr>
                    <tr>
                        <td colSpan={2} className="password-helper">
                            {t("password-helper-leaveempty")}
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
                            <input type="password" id="confirm_password" name="confirm_password" ref={confirmPasswordInput} />
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <label id="publish-to-leaderboard-label" htmlFor="publish-to-leaderboard">{t("config_publish_to_leaderboard")}</label>
                        </td>
                        <td>
                            <input type="checkbox" id="publish-to-leaderboard" name="publish-to-leaderboard" ref={publishToLeaderboardInput} />
                        </td>
                    </tr>
                    {reconfigureErrorText && <tr>
                        <td colSpan={2} id="reconfigure_error">
                            {reconfigureErrorText}
                        </td>
                    </tr>}
                    {reconfigureSuccessText && <tr>
                        <td colSpan={2} id="reconfigure_success">
                            {reconfigureSuccessText}
                        </td>
                    </tr>}
                    </tbody>
                </table>

                <button type="submit">{t("reconfigure_button")}</button>
            </div>
        </form>
    </>
    )
}

export default UserConfig