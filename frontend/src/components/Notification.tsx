import './Notification.css';
import { useApp } from '../context/AppContext';

export function Notification() {
  const { notifications } = useApp();

  return (
    <div className="notification-container">
      {notifications.map((notification, _index) => (
        <div
          key={notification.id}
          className={`notification ${notification.isSuccess ? "success" : "error"} ${notification.removing ? "removing" : ""}`}
        >
          {notification.message}
        </div>
      ))}
    </div>
  );
}