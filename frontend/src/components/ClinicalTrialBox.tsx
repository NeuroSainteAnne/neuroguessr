import { useApp } from "../context/AppContext";
import "./ClinicalTrialBox.css";
import { useState, useRef, useEffect } from "react";

export interface ClinicalTrialProps {
    clinicalTrialGender: "male" | "female" | "other" | null;
    clinicalTrialAge: number | null;
    clinicalTrialCountry: string | null;
    clinicalTrialOccupation: string | null;
    clinicalTrialConsent: "data_usage" | "acknowledgement" | "none" | null;
}

const COUNTRIES = [
    "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia",
    "Austria","Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Belize","Benin",
    "Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria",
    "Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde","Chad","Chile",
    "China","Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba","Cyprus",
    "Czech Republic","Denmark","Djibouti","Dominican Republic","Ecuador","Egypt",
    "El Salvador","Estonia","Ethiopia","Fiji","Finland","France","Gabon","Gambia",
    "Georgia","Germany","Ghana","Greece","Guatemala","Guinea","Haiti","Honduras",
    "Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy",
    "Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kosovo","Kuwait","Kyrgyzstan",
    "Laos","Latvia","Lebanon","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg",
    "Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Mauritania","Mauritius",
    "Mexico","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar",
    "Namibia","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria",
    "North Korea","North Macedonia","Norway","Oman","Pakistan","Palestine","Panama",
    "Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar",
    "Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Sierra Leone",
    "Singapore","Slovakia","Slovenia","Somalia","South Africa","South Korea","South Sudan",
    "Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria","Taiwan","Tajikistan",
    "Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan",
    "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay",
    "Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"
];

interface CustomSelectProps {
    value: string;
    placeholder: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    searchable?: boolean;
}

function CustomSelect({ value, placeholder, options, onChange, searchable = false }: CustomSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch("");
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filtered = searchable
        ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    const selected = options.find(o => o.value === value);

    return (
        <div className="ct-select-wrapper" ref={ref}>
            <button
                type="button"
                className={`ct-select-trigger${open ? " open" : ""}`}
                onClick={() => { setOpen(v => !v); setSearch(""); }}
            >
                <span className={selected ? "" : "ct-select-placeholder"}>
                    {selected ? selected.label : placeholder}
                </span>
                <svg className="ct-select-chevron" width="12" height="8" viewBox="0 0 12 8" fill="none">
                    <path d="M1 1l5 5 5-5" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
            </button>
            {open && (
                <div className="ct-select-dropdown">
                    {searchable && (
                        <input
                            className="ct-select-search"
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    )}
                    <div className="ct-select-list">
                        {filtered.map(o => (
                            <div
                                key={o.value}
                                className={`ct-select-option${o.value === value ? " selected" : ""}`}
                                onMouseDown={() => { onChange(o.value); setOpen(false); setSearch(""); }}
                            >
                                {o.label}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ClinicalTrialBox({clinicalTrialData, setClinicalTrialData}: {
    clinicalTrialData: ClinicalTrialProps;
    setClinicalTrialData: (data: ClinicalTrialProps) => void;
}) {
    const handleChange = (field: keyof ClinicalTrialProps, value: any) => {
        setClinicalTrialData({ ...clinicalTrialData, [field]: value });
    };
    const { t } = useApp();

    const occupationOptions = [
        { value: "radiography_technician", label: t("clinical_trial_occupation_radiography_technician") },
        { value: "radiology_resident",     label: t("clinical_trial_occupation_radiology_resident") },
        { value: "resident_other",         label: t("clinical_trial_occupation_resident_other") },
        { value: "neuroradiologist",       label: t("clinical_trial_occupation_neuroradiologist") },
        { value: "radiologist_other",      label: t("clinical_trial_occupation_radiologist_other") },
        { value: "neuroscientist",         label: t("clinical_trial_occupation_neuroscientist") },
        { value: "neurologist",            label: t("clinical_trial_occupation_neurologist") },
        { value: "neurosurgeon",           label: t("clinical_trial_occupation_neurosurgeon") },
        { value: "medical_student",        label: t("clinical_trial_occupation_medical_student") },
        { value: "researcher",             label: t("clinical_trial_occupation_researcher") },
        { value: "psychiatrist",           label: t("clinical_trial_occupation_psychiatrist") },
        { value: "engineer",               label: t("clinical_trial_occupation_engineer") },
        { value: "psychologist",           label: t("clinical_trial_occupation_psychologist") },
        { value: "other",                  label: t("clinical_trial_occupation_other") },
    ];

    const countryOptions = COUNTRIES.map(c => ({ value: c, label: c }));

    return (
        <div className="clinical-trial-container">
            <span className="clinical_trial_header">{t("clinical_trial_header")}</span>

            {/* Gender */}
            <div className="clinical-trial-row">
                <label>{t("clinical_trial_gender")}</label>
                <div className="clinical_trial_radio">
                    {[
                        { value: "male",   label: t("clinical_trial_gender_male") },
                        { value: "female", label: t("clinical_trial_gender_female") },
                        { value: "other",  label: t("clinical_trial_gender_other") },
                        { value: "null",   label: t("clinical_trial_gender_null") },
                    ].map(opt => (
                        <label key={opt.value}>
                            <input type="radio" name="clinical_trial_gender" value={opt.value}
                                checked={opt.value === "null"
                                    ? clinicalTrialData.clinicalTrialGender === null
                                    : clinicalTrialData.clinicalTrialGender === opt.value}
                                onChange={() => handleChange("clinicalTrialGender", opt.value === "null" ? null : opt.value)} />
                            {opt.label}
                        </label>
                    ))}
                </div>
            </div>

            {/* Age */}
            <div className="clinical-trial-row">
                <label htmlFor="clinical_trial_age">{t("clinical_trial_age")}</label>
                <input
                    type="text"
                    id="clinical_trial_age"
                    className="clinical-trial-age-input"
                    value={clinicalTrialData.clinicalTrialAge || ""}
                    onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        if (value > 0 && value <= 120) handleChange("clinicalTrialAge", value);
                        else if (e.target.value === "") handleChange("clinicalTrialAge", null);
                    }}
                />
            </div>

            {/* Country — custom searchable dropdown */}
            <div className="clinical-trial-row">
                <label>{t("clinical_trial_country")}</label>
                <CustomSelect
                    value={clinicalTrialData.clinicalTrialCountry || ""}
                    placeholder={t("clinical_trial_country")}
                    options={countryOptions}
                    onChange={(v) => handleChange("clinicalTrialCountry", v || null)}
                    searchable={true}
                />
            </div>

            {/* Occupation — custom dropdown */}
            <div className="clinical-trial-row">
                <label>{t("clinical_trial_occupation")}</label>
                <CustomSelect
                    value={clinicalTrialData.clinicalTrialOccupation || ""}
                    placeholder={t("clinical_trial_occupation_select")}
                    options={occupationOptions}
                    onChange={(v) => handleChange("clinicalTrialOccupation", v || null)}
                />
            </div>

            {/* Consent */}
            <div className="clinical-trial-row">
                <div className="clinical_trial_radio">
                    {[
                        { value: "data_usage",      label: t("clinical_trial_consent_data_usage") },
                        { value: "acknowledgement", label: t("clinical_trial_consent_acknowledgement") },
                        { value: "none",            label: t("clinical_trial_consent_none") },
                    ].map(opt => (
                        <label key={opt.value}>
                            <input type="radio" name="clinical_trial_consent" value={opt.value}
                                checked={clinicalTrialData.clinicalTrialConsent === opt.value}
                                onChange={() => handleChange("clinicalTrialConsent", opt.value as any)} />
                            {opt.label}
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}
