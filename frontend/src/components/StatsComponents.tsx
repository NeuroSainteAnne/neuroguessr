import React from 'react';
import './StatsComponents.css';

// ======== StatCard Component ========
interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  icon, 
  className = '' 
}) => {
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-card-content">
        <h3 className="stat-card-title">{title}</h3>
        <div className="stat-card-value">{value}</div>
      </div>
      {icon && <div className="stat-card-icon">{icon}</div>}
    </div>
  );
};

// ======== MetricRow Component ========
interface MetricRowProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  className?: string;
}

export const MetricRow: React.FC<MetricRowProps> = ({ 
  label, 
  value, 
  icon, 
  className = '' 
}) => {
  return (
    <div className={`metric-row ${className}`}>
      <div className="metric-row-label">
        {icon && <span className="metric-row-icon">{icon}</span>}
        {label}
      </div>
      <div className="metric-row-value">{value}</div>
    </div>
  );
};

// ======== FavoriteItem Component ========
interface FavoriteItemProps {
  type: string;
  value: string;
  icon?: React.ReactNode;
  className?: string;
}

export const FavoriteItem: React.FC<FavoriteItemProps> = ({ 
  type, 
  value, 
  icon, 
  className = '' 
}) => {
  return (
    <div className={`favorite-item ${className}`}>
      {icon && <div className="favorite-item-icon">{icon}</div>}
      <div className="favorite-item-content">
        <div className="favorite-item-type">{type}</div>
        <div className="favorite-item-value">{value}</div>
      </div>
    </div>
  );
};

// ======== StatItem Component (used in tab sections) ========
interface StatItemProps {
  label: string;
  value: string | number;
  className?: string;
}

export const StatItem: React.FC<StatItemProps> = ({ 
  label, 
  value, 
  className = '' 
}) => {
  return (
    <div className={`stat-item ${className}`}>
      <div className="stat-item-value">{value}</div>
      <div className="stat-item-label">{label}</div>
    </div>
  );
};

// ======== Icon Components ========
// Simple icon implementations, you can replace these with your own icons or a library
export const GameIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
  </svg>
);

export const TrophyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
  </svg>
);

export const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
  </svg>
);

export const TargetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

// Helper functions for getting mode and atlas icons
export const getModeIcon = (mode: string) => {
  switch (mode) {
    case 'streak':
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.48 13.03L16 16.5l-2.48-2.48-1.41 1.41L16 19.33l4.89-4.89-1.41-1.41zm-2.16-8.4l1.41 1.41L16 3.31 12.17 7.14l1.41 1.41L16 6.13l1.32 1.32zM4 7h6v5H4V7zm0 7h6v5H4v-5z"/>
      </svg>;
    case 'time-attack':
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
      </svg>;
    case 'navigation':
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
      </svg>;
    case 'multiplayer':
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
      </svg>;
    default:
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
        <circle cx="12" cy="12" r="5"/>
      </svg>;
  }
};

export const getAtlasIcon = (atlas: string) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" version="1.0" viewBox="0 0 1024 1024" fill="currentColor">
        <path d="m492 110-12 2c-55 12-97 54-109 109-2 9-2 13-2 29s0 20 2 29c4 19 12 38 25 61 3 6 6 11 5 12l-15 2a232 232 0 0 0-148 68 284 284 0 0 0-73 135c-18 79 20 141 94 156 9 2 15 2 39 3h28l2 4c9 21 14 28 25 39a123 123 0 0 0 87 35c21-1 31-2 57-11l20-6 5 5c7 13 78 126 83 131 7 8 21 15 32 15s25-7 31-16c9-12 10-26 4-44l-2-7h18c18-1 29-3 44-8a109 109 0 0 0 73-101v-8l8-4c31-14 50-39 59-79 7-32 4-79-7-113-13-38-34-64-66-79l-7-4-4-8a186 186 0 0 0-158-105c-6 0-7-2-4-8 13-21 24-48 28-67 2-12 2-42 0-54-5-20-14-41-25-56a140 140 0 0 0-114-58l-23 1zm40 31c23 5 42 14 59 31a111 111 0 0 1 32 104c-4 17-15 39-33 69a2157 2157 0 0 1-79 111c-3-1-66-93-82-121-23-38-30-57-30-84 0-24 6-44 20-64a113 113 0 0 1 113-46zm98 241c39 4 66 15 93 37 19 15 31 32 39 54l7 14 12 6c39 15 60 52 65 114 1 16 0 36-3 50-6 28-23 49-47 58-17 6-17 6-114 7l-87 1-12 2c-24 5-34 8-68 20-47 18-56 20-79 19s-39-6-54-18a70 70 0 0 1-20-94c6-9 20-24 30-31 22-15 58-26 102-34 26-4 43-6 73-7 33-1 42-3 59-9 16-6 35-22 44-36 11-16 18-38 19-56 1-11-3-19-11-21-11-3-19 6-19 21l-2 14c-5 21-18 39-36 48-12 6-24 8-50 10a543 543 0 0 0-177 34 94 94 0 0 1-20-62c1-11 1-13 7-28 2-6 1-11-3-15-5-6-15-6-20 0-7 6-12 26-13 45l-1 13c-1 2-6-1-12-7-8-6-12-8-17-7s-10 6-11 11c-1 6 1 10 8 17 8 8 18 13 30 16l10 3 5 8 7 14c5 8 5 8-5 18a113 113 0 0 0-36 71v5h-17c-47 0-71-7-92-28a80 80 0 0 1-24-47c-1-12-1-21 1-34 8-55 41-113 84-149 38-30 78-45 129-47 16 0 16 0 19 2l30 44 36 51c8 11 12 14 18 16s13 0 17-3c3-3 23-29 59-82 21-30 20-29 27-29l20 2zm145 370v8c-3 28-17 48-40 60-17 9-30 12-55 11-38-1-36-1-40 2-3 3-5 8-5 12l6 22c6 20 7 22 5 25-3 6-10 7-16 4-4-2-3-1-43-64-37-59-39-63-39-66 1-4 33-12 56-14h171z"/>
        <path d="M496 190a63 63 0 0 0-47 46c-8 27 2 58 25 73 30 20 72 13 92-16 14-20 16-47 5-70-6-12-19-24-32-29-7-3-21-6-28-6l-15 2zm30 32c7 3 13 9 17 15 5 9 6 24 1 33-3 6-11 14-17 17-5 2-7 3-15 3s-10-1-15-3c-8-4-13-9-17-17-3-6-3-7-3-15s0-10 2-15c5-10 13-17 23-20 7-2 18-1 24 2zm220 350c-4 1-9 6-11 14-6 16-16 26-32 34s-33 11-67 13c-49 3-108 12-155 23-29 7-33 10-33 20 0 7 2 11 8 13 5 2 5 2 25-3 52-13 105-21 157-23 37-3 58-7 78-17a84 84 0 0 0 46-52c3-7 3-9 2-12-2-5-6-9-10-10h-8z"/>
    </svg>
  );
};