import './Notification.css';
import { useApp } from '../context/AppContext';

export function Notification() {
  const { notifications } = useApp();

  return (
    <div className="notification-container">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className={`notification ${notification.isSuccess ? "success" : "error"} ${notification.removing ? "removing" : ""}`}
          style={{ 
            top: `${index * 90}px` // Adjust this value based on your notification height + gap
          }}
        >
          {notification.message}
        </div>
      ))}
    </div>
  );
}