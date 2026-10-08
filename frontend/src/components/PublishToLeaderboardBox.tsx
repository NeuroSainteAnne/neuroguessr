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
      <div className="publish-btn-group">
        <button
          type="button" className="publish-btn"
          data-umami-event="publish button" data-umami-event-publishchoice="yes"
          onClick={() => handleClick(true)}
        >
          {t("publish_yes")}
        </button>
        <button
          type="button" className="publish-btn"
          data-umami-event="publish button" data-umami-event-publishchoice="no"
          onClick={() => handleClick(false)}
        >
          {t("publish_no")}
        </button>
      </div>
      {publishErrorText && <div className="publish-error">{publishErrorText}</div>}
    </>
  );
};
