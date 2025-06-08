import './Notification.css';
import { useApp } from '../context/AppContext';

export function Notification() {
  const { notificationMessage, notificationStatus } = useApp();

  return (
    <>
      {notificationMessage && <div id="notification" className={notificationStatus}>{notificationMessage}</div>}
    </>
  );
}