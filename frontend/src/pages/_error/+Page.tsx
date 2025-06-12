import { usePageContext } from 'vike-react/usePageContext'
import './ErrorPage.css';
import { useTranslation } from 'react-i18next';

declare global {
  namespace Vike {
    interface PageContext {
      abortReason?:
        | string
        | { notAdmin: true }
    }
  }
}

export function Page() {
  const { t } = useTranslation();
  const pageContext = usePageContext();
  const { abortReason, abortStatusCode } = pageContext

  // Extract status code and error message
  const statusCode = abortStatusCode || 500;
  const errorMessage =
   (abortReason ?
    (typeof abortReason !== 'string' ?  t('authorization_error') : abortReason)
    : t('unknown_error'));

  // @ts-ignore
  const isNotFound = statusCode === 404 || pageContext.is404;

  return (
    <div className="error-page">
      <div className="error-container">
        <div className="error-icon">
          {isNotFound ? (
            <i className="fas fa-search"></i>
          ) : (
            <i className="fas fa-exclamation-triangle"></i>
          )}
        </div>
        <h1 className="error-code">{statusCode}</h1>
        <h2 className="error-title">
          {isNotFound ? t('page_not_found') : t('error_occurred')}
        </h2>
        <p className="error-message">{errorMessage}</p>
        <div className="error-actions">
          <a href="/" className="btn-home" data-umami-event="go back button" data-umami-event-gobacksource="error">
            <i className="fas fa-home"></i>&nbsp;{t('return_home')}
          </a>
          <button data-umami-event="go back button" data-umami-event-gobacksource="error" onClick={() => window.history.back()} className="btn-back">
            <i className="fas fa-arrow-left"></i> {t('go_back')}
          </button>
        </div>
      </div>
    </div>
  );
}