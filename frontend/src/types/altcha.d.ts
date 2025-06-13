import * as React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'altcha-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        apikey?: string;
        callback?: string;
        theme?: string;
        autosubmit?: boolean;
        size?: string;
      };
    }
  }

  interface Window {
    onAltchaVerify: (token: string) => void;
  }
}

export {};  // This ensures the file is treated as a module