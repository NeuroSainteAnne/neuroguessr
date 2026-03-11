import { useState } from 'react';
import { useApp } from '../context/AppContext';
import "./PublishToLeaderboardBox.css"

export const PublishToLeaderboardBox = ({forRank = false}:{forRank?: boolean | undefined}) => {
  const { t, updateToken } = useApp();
  const [publishErrorText, setPublishErrorText] = useState<string>("");
  const handleClick = async (val: boolean) => {
    try {
      // Send the data to the server
      const response = await fetch('/api/config-user', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publishToLeaderboard: val }),
      });
      const result = await response.json();
      if (response.ok) {
        updateToken(result.token);
      } else {
        setPublishErrorText(result.message);
      }
    } catch (error) {
      // Handle network or other errors
      console.error('Error updating publish mode:', error);
      setPublishErrorText(t('server_error'));
    }
  };
  return (
    <>
      <h2>{forRank 
              ? t("publish_results_for_rank") 
              : t("publish_to_leaderboard_header")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("publish_to_leaderboard_explanation") }}></p>
      <div style={{ margin: "1em 0", display: "flex", flexDirection: "row", gap: 2, justifyContent: "center" }}>
        <button
          type="button" className="publish-btn"
          data-umami-event="publish button" data-umami-event-publishchoice="yes"
          style={{
            padding: "0.5em 1.5em",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
          onClick={() => handleClick(true)}
        >
          {t("publish_yes")}
        </button>
        <button
          type="button" className="publish-btn"
          data-umami-event="publish button" data-umami-event-publishchoice="no"
          style={{
            padding: "0.5em 1.5em",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
          onClick={() => handleClick(false)}
        >
          {t("publish_no")}
        </button>
      </div>
      {publishErrorText && <div style={{ color: "red" }}>
        {publishErrorText}
      </div>}
    </>
  );
};
