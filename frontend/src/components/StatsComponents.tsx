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
    default:
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
        <circle cx="12" cy="12" r="5"/>
      </svg>;
  }
};

export const getAtlasIcon = (atlas: string) => {
  // Customize with specific icons for different atlases if desired
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/>
  </svg>;
};