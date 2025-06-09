import { useState } from "react";
import { useApp } from "../../../context/AppContext";
import { useGameSelector } from "../../../context/GameSelectorContext";
import "./MultiBox.css";

export function MultiBox() {
    const { t, isLoggedIn } = useApp();
    const [multiplayerInputCode, setMultiplayerInputCode] = useState<string>("")
    return (
        <div className="multiplayer-box">
            <div className="multiplayer-box-join">
                <h2>{t("join_multiplayer_lobby")}</h2>
                <div><input
                    type="text"
                    value={multiplayerInputCode}
                    onChange={e => setMultiplayerInputCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder={t("multi_8_digits")}
                    style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center', width: 250, border: "1px solid white" }}
                /></div>
                <div><a className="play-button enabled" href={`/multiplayer-game/${multiplayerInputCode}`}
                    onClick={(e) => {
                        if (!(parseInt(multiplayerInputCode) >= 10000000 && parseInt(multiplayerInputCode) <= 99999999)) { 
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }}>
                    {t("join_multiplayer_button")}</a></div>
            </div>
            {isLoggedIn &&
                <div className="multiplayer-box-join">
                    <h2>{t("create_multiplayer_game")}</h2>
                    <div><a className="play-button enabled"
                        href="/welcome/multiplayer-create">{t("create_multiplayer_button")}</a></div>
                </div>}
            {!isLoggedIn && <>
                <div className="multiplayer-please-login" dangerouslySetInnerHTML={{
                    __html: t("multi_unavailable_login")
                        .replace("/login", `/login?redirect=welcome&redirect_subpage=multiplayer`)
                }}></div>
                <a href="/welcome/multiplayer-create" style={{ display: "none" }}>{t("create_multiplayer_button")}</a></>}
        </div>
    )
}