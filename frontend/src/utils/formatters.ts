import { format, formatDistance, formatRelative, fromUnixTime, Locale } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';

// Get current language for date formatting
const getLocale = (): Locale => {
  const lang = localStorage.getItem('language') || 'fr';
  return lang === 'fr' ? fr : enUS;
};

/**
 * Convert any date format (timestamp, Date object, ISO string) to a Date object
 * @param date Input date in various formats
 * @returns JavaScript Date object or null if invalid
 */
const parseToDate = (date: number | Date | string | null): Date | null => {
  if (date === null || date === undefined) return null;
  
  try {
    // Already a Date object
    if (date instanceof Date) {
      return date;
    }
    
    // ISO date string
    if (typeof date === 'string') {
      // Check if it's likely an ISO date string
      if (date.includes('T') && (date.includes('Z') || date.includes('+'))) {
        return new Date(date);
      }
      // Try to parse as a timestamp
      const parsedTimestamp = parseInt(date, 10);
      if (!isNaN(parsedTimestamp)) {
        date = parsedTimestamp;
      } else {
        throw new Error(`Invalid date string format: ${date}`);
      }
    }
    
    // Timestamp (convert from seconds to milliseconds if needed)
    const timestampMs = date > 9999999999 ? date : date * 1000;
    return fromUnixTime(timestampMs / 1000);
  } catch (error) {
    console.error('Error parsing date:', error, date);
    return null;
  }
};

/**
 * Format a timestamp, Date object, or ISO date string into a human-readable date
 * @param date Unix timestamp, Date object, or ISO date string
 * @param formatStr Optional date format string (default: 'PPP')
 * @returns Formatted date string
 */
export const formatDate = (date: number | Date | string | null, formatStr = 'PPP'): string => {
  if (date === null || date === undefined) return '—';
  
  // Use the parseToDate utility to handle all date formats
  const parsedDate = parseToDate(date);
  if (!parsedDate) return '—';
  
  try {
    return format(parsedDate, formatStr, {
      locale: getLocale()
    });
  } catch (error) {
    console.error('Error formatting date:', error, date);
    return '—';
  }
};

/**
 * Format a duration in milliseconds to a human-readable time string
 * @param milliseconds Duration in milliseconds
 * @param showMilliseconds Whether to show milliseconds for short durations
 * @returns Formatted time string
 */
export const formatTime = (milliseconds: number | null, showMilliseconds = false): string => {
  if (milliseconds === null || milliseconds === undefined) return '—';
  
  // Convert milliseconds to seconds
  const totalSeconds = milliseconds / 1000;
  
  // Handle extremely short durations with milliseconds if requested
  if (showMilliseconds && totalSeconds < 1) {
    return `${Math.round(milliseconds)}ms`;
  }
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = Math.floor(totalSeconds % 60);
  
  // Format based on duration length
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
};

/**
 * Format a date as a relative time (e.g., "2 days ago")
 * @param date Unix timestamp, Date object, or ISO date string
 * @returns Relative time string
 */
export const formatRelativeTime = (date: number | Date | string | null): string => {
  if (date === null || date === undefined) return '—';
  
  const parsedDate = parseToDate(date);
  if (!parsedDate) return '—';
  
  try {
    return formatDistance(parsedDate, new Date(), {
      addSuffix: true,
      locale: getLocale()
    });
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return '—';
  }
};

/**
 * Format a timestamp for the session history table
 * @param date Unix timestamp, Date object, or ISO date string
 * @returns Formatted date string appropriate for tables
 */
export const formatTableDate = (date: number | Date | string | null): string => {
  if (date === null || date === undefined) return '—';
  
  const parsedDate = parseToDate(date);
  if (!parsedDate) return '—';
  
  try {
    // For recent dates (within 7 days), show relative time
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 7) {
      return formatRelative(parsedDate, now, { locale: getLocale() });
    }
    
    // Otherwise show the actual date in a compact format
    return format(parsedDate, 'PP', { locale: getLocale() });
  } catch (error) {
    console.error('Error formatting table date:', error);
    return '—';
  }
};

/**
 * Format a score with appropriate styling
 * @param score The score value
 * @returns Formatted score string
 */
export const formatScore = (score: number | null): string => {
  if (score === null || score === undefined) return '—';
  return score.toLocaleString();
};

/**
 * Format a percentage value
 * @param value The decimal value (e.g., 0.75 for 75%)
 * @param decimals Number of decimal places
 * @returns Formatted percentage string
 */
export const formatPercentage = (value: number | null, decimals = 1): string => {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
};

/**
 * Format a timestamp as a short date (e.g., "Jan 15")
 * Useful for chart labels
 */
export const formatShortDate = (date: number | Date | string | null): string => {
  if (date === null || date === undefined) return '';
  
  const parsedDate = parseToDate(date);
  if (!parsedDate) return '';
  
  try {
    return format(parsedDate, 'MMM d', {
      locale: getLocale()
    });
  } catch (error) {
    return '';
  }
};

/**
 * Format a month for aggregated data (e.g., "Jan 2023")
 * Useful for monthly activity charts
 */
export const formatMonth = (date: number | Date | string | null): string => {
  if (date === null || date === undefined) return '';
  
  const parsedDate = parseToDate(date);
  if (!parsedDate) return '';
  
  try {
    return format(parsedDate, 'MMM yyyy', {
      locale: getLocale()
    });
  } catch (error) {
    return '';
  }
};

/**
 * Format a duration in a compact way for small spaces
 * @param seconds Duration in seconds
 */
export const formatCompactTime = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '—';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
};

/**
 * Generate data for the sessions progression chart
 * @param sessions Array of session data
 */
export const generateSessionsProgression = (sessions: any[]): any[] => {
  if (!sessions || sessions.length === 0) return [];
  
  // Sort by creation date
  const sortedSessions = [...sessions].sort((a, b) => a.createdAt - b.createdAt);
  
  return sortedSessions.map(session => ({
    date: formatShortDate(session.createdAt),
    score: session.score,
    timestamp: session.createdAt // Keep original timestamp for sorting
  }));
};

/**
 * Generate data for monthly activity chart
 * @param sessions Array of session data
 */
export const generateActivityByMonth = (sessions: any[]): any[] => {
  if (!sessions || sessions.length === 0) return [];
  
  // Group sessions by month
  const monthlyGroups: { [key: string]: number } = {};
  
  sessions.forEach(session => {
    const monthKey = formatMonth(session.createdAt);
    if (monthKey) {
      monthlyGroups[monthKey] = (monthlyGroups[monthKey] || 0) + 1;
    }
  });
  
  // Convert to array format for chart
  return Object.entries(monthlyGroups).map(([month, games]) => ({
    month,
    games
  }));
};