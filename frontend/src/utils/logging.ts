import config from '../../config.json';

// Verbosity levels: "silent", "minimal", "normal", "verbose"
type VerbosityLevel = "silent" | "minimal" | "normal" | "verbose";

/**
 * Logging helper that respects verbosity settings
 */
export function consoleLog(level: VerbosityLevel, message: string, ...args: any[]): void {
  const configVerbosity = config?.cache?.verbosity || "normal";
  
  const verbosityOrder: Record<VerbosityLevel, number> = { 
    silent: 0, minimal: 1, normal: 2, verbose: 3 
  };
  
  const currentLevel = verbosityOrder[configVerbosity as VerbosityLevel] ?? 2;
  const messageLevel = verbosityOrder[level] ?? 2;
  
  if (messageLevel <= currentLevel) {
    console.log(message, ...args);
  }
}