import { useApp } from "../context/AppContext";
import "./ClinicalTrialBox.css";

export interface ClinicalTrialProps {
    clinicalTrialGender: "male" | "female" | "other" | null;
    clinicalTrialAge: number | null;
    clinicalTrialCountry: string | null;
    clinicalTrialOccupation: string | null;
    clinicalTrialConsent: "data_usage" | "acknowledgement" | "none" | null;
}

export default function ClinicalTrialBox({clinicalTrialData, setClinicalTrialData}: {
    clinicalTrialData: ClinicalTrialProps;
    setClinicalTrialData: (data: ClinicalTrialProps) => void;
}) {
    const handleChange = (field: keyof ClinicalTrialProps, value: any) => {
        setClinicalTrialData({
            ...clinicalTrialData,
            [field]: value
        });
    };
    const { t } = useApp();

    return (
        <div className="clinical-trial-container"><table className="clinical-trial-element"><tbody>
            <tr><td colSpan={2} className="clinical_trial_header">{t("clinical_trial_header")}</td></tr>
            {/* Gender */}
            <tr>
                <td><label htmlFor="clinical_trial_gender">{t("clinical_trial_gender")}</label></td>
                <td><div className="clinical_trial_radio">
                    <label>
                        <input
                            type="radio"
                            name="clinical_trial_gender"
                            value="male"
                            checked={clinicalTrialData.clinicalTrialGender === "male"}
                            onChange={() => handleChange("clinicalTrialGender", "male")}
                        />
                        {t("clinical_trial_gender_male")}
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="clinical_trial_gender"
                            value="female"
                            checked={clinicalTrialData.clinicalTrialGender === "female"}
                            onChange={() => handleChange("clinicalTrialGender", "female")}
                        />
                        {t("clinical_trial_gender_female")}
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="clinical_trial_gender"
                            value="other"
                            checked={clinicalTrialData.clinicalTrialGender === "other"}
                            onChange={() => handleChange("clinicalTrialGender", "other")}
                        />
                        {t("clinical_trial_gender_other")}
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="clinical_trial_gender"
                            value="null"
                            checked={clinicalTrialData.clinicalTrialGender === null}
                            onChange={() => handleChange("clinicalTrialGender", null)}
                        />
                        {t("clinical_trial_gender_null")}
                    </label>
                </div></td>
            </tr>

            {/* Age */}
            <tr>
                <td><label htmlFor="clinical_trial_age">{t("clinical_trial_age")}</label></td>
                <td><input
                    type="text"
                    id="clinical_trial_age"
                    value={clinicalTrialData.clinicalTrialAge || ""}
                    onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        if (value > 0 && value <= 120) {
                            handleChange("clinicalTrialAge", value);
                        } else if (e.target.value === "") {
                            handleChange("clinicalTrialAge", null);
                        }
                    }}
                /></td>
            </tr>

            {/* Country */}
            <tr>
                <td><label htmlFor="clinical_trial_country">{t("clinical_trial_country")}</label></td>
                <td><input
                    type="text"
                    id="clinical_trial_country"
                    value={clinicalTrialData.clinicalTrialCountry || ""}
                    onChange={(e) =>
                        handleChange("clinicalTrialCountry", e.target.value || null)
                    }
                /></td>
            </tr>

            {/* Occupation */}
            <tr>
                <td><label htmlFor="clinical_trial_occupation">{t("clinical_trial_occupation")}</label></td>
                <td>
                    <select
                        id="clinical_trial_occupation"
                        value={clinicalTrialData.clinicalTrialOccupation || ""}
                        onChange={(e) =>
                            handleChange("clinicalTrialOccupation", e.target.value || null)
                        }
                    >
                        <option value="">{t("clinical_trial_occupation_select")}</option>
                        <option value="radiography_technician">{t("clinical_trial_occupation_radiography_technician")}</option>
                        <option value="radiology_resident">{t("clinical_trial_occupation_radiology_resident")}</option>
                        <option value="resident_other">{t("clinical_trial_occupation_resident_other")}</option>
                        <option value="neuroradiologist">{t("clinical_trial_occupation_neuroradiologist")}</option>
                        <option value="radiologist_other">{t("clinical_trial_occupation_radiologist_other")}</option>
                        <option value="neuroscientist">{t("clinical_trial_occupation_neuroscientist")}</option>
                        <option value="neurologist">{t("clinical_trial_occupation_neurologist")}</option>
                        <option value="neurosurgeon">{t("clinical_trial_occupation_neurosurgeon")}</option>
                        <option value="medical_student">{t("clinical_trial_occupation_medical_student")}</option>
                        <option value="researcher">{t("clinical_trial_occupation_researcher")}</option>
                        <option value="psychiatrist">{t("clinical_trial_occupation_psychiatrist")}</option>
                        <option value="engineer">{t("clinical_trial_occupation_engineer")}</option>
                        <option value="psychologist">{t("clinical_trial_occupation_psychologist")}</option>
                        <option value="other">{t("clinical_trial_occupation_other")}</option>
                    </select>
                </td>
            </tr>

            {/* Consent */}
            <tr>
                <td colSpan={2}><div className="clinical_trial_radio">
                    <label>
                        <input
                            type="radio"
                            name="clinical_trial_consent"
                            value="data_usage"
                            checked={clinicalTrialData.clinicalTrialConsent === "data_usage"}
                            onChange={() => handleChange("clinicalTrialConsent", "data_usage")}
                        />
                        {t("clinical_trial_consent_data_usage")}
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="clinical_trial_consent"
                            value="acknowledgement"
                            checked={clinicalTrialData.clinicalTrialConsent === "acknowledgement"}
                            onChange={() => handleChange("clinicalTrialConsent", "acknowledgement")}
                        />
                        {t("clinical_trial_consent_acknowledgement")}
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="clinical_trial_consent"
                            value="none"
                            checked={clinicalTrialData.clinicalTrialConsent === "none"}
                            onChange={() => handleChange("clinicalTrialConsent", "none")}
                        />
                        {t("clinical_trial_consent_none")}
                    </label>
                </div></td>
            </tr>
        </tbody></table></div>
    )
}