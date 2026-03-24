import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  isAutoReloading: boolean;
}

const MAX_AUTO_RETRIES = 3;
const RETRY_STORAGE_KEY = 'errorBoundaryRetries';
const RETRY_TIMESTAMP_KEY = 'errorBoundaryLastRetry';
const RETRY_RESET_TIME = 60000;

const EB_STRINGS: Record<string, {
  reloading: string;
  anErrorOccurred: string;
  autoReloading: string;
  tryingToReload: string;
  retryFailed: string;
  refreshPage: string;
  goHome: string;
  attempt: string;
}> = {
  en: {
    reloading: 'Reloading...',
    anErrorOccurred: 'An Error Occurred',
    autoReloading: 'Page is automatically reloading, please wait...',
    tryingToReload: 'Attempting to reload the page...',
    retryFailed: 'The page has tried reloading several times but the issue persists.',
    refreshPage: 'Refresh Page',
    goHome: 'Go Home',
    attempt: 'Attempt',
  },
  tr: {
    reloading: 'Yenileniyor...',
    anErrorOccurred: 'Bir Hata Oluştu',
    autoReloading: 'Sayfa otomatik olarak yenileniyor, lütfen bekleyin...',
    tryingToReload: 'Sayfa yenilenmeye çalışılıyor...',
    retryFailed: 'Sayfa birkaç kez yenilenmeyi denedi ancak sorun devam ediyor.',
    refreshPage: 'Sayfayı Yenile',
    goHome: 'Ana Sayfaya Dön',
    attempt: 'Deneme',
  },
  zh: {
    reloading: '重新加载中...',
    anErrorOccurred: '发生错误',
    autoReloading: '页面正在自动重新加载，请稍候...',
    tryingToReload: '正在尝试重新加载页面...',
    retryFailed: '页面已尝试多次重新加载，但问题仍然存在。',
    refreshPage: '刷新页面',
    goHome: '返回主页',
    attempt: '尝试',
  },
  hi: {
    reloading: 'पुनः लोड हो रहा है...',
    anErrorOccurred: 'एक त्रुटि हुई',
    autoReloading: 'पृष्ठ स्वचालित रूप से पुनः लोड हो रहा है, कृपया प्रतीक्षा करें...',
    tryingToReload: 'पृष्ठ को पुनः लोड करने का प्रयास किया जा रहा है...',
    retryFailed: 'पृष्ठ ने कई बार पुनः लोड करने की कोशिश की लेकिन समस्या बनी हुई है।',
    refreshPage: 'पृष्ठ ताज़ा करें',
    goHome: 'होम पर जाएं',
    attempt: 'प्रयास',
  },
  es: {
    reloading: 'Recargando...',
    anErrorOccurred: 'Se Produjo un Error',
    autoReloading: 'La página se está recargando automáticamente, por favor espere...',
    tryingToReload: 'Intentando recargar la página...',
    retryFailed: 'La página ha intentado recargarse varias veces pero el problema persiste.',
    refreshPage: 'Actualizar Página',
    goHome: 'Ir al Inicio',
    attempt: 'Intento',
  },
  fr: {
    reloading: 'Rechargement...',
    anErrorOccurred: 'Une Erreur s\'est Produite',
    autoReloading: 'La page se recharge automatiquement, veuillez patienter...',
    tryingToReload: 'Tentative de rechargement de la page...',
    retryFailed: 'La page a tenté de se recharger plusieurs fois mais le problème persiste.',
    refreshPage: 'Actualiser la Page',
    goHome: 'Aller à l\'Accueil',
    attempt: 'Tentative',
  },
  ar: {
    reloading: 'جارٍ إعادة التحميل...',
    anErrorOccurred: 'حدث خطأ',
    autoReloading: 'تتم إعادة تحميل الصفحة تلقائيًا، يرجى الانتظار...',
    tryingToReload: 'محاولة إعادة تحميل الصفحة...',
    retryFailed: 'حاولت الصفحة إعادة التحميل عدة مرات لكن المشكلة لا تزال قائمة.',
    refreshPage: 'تحديث الصفحة',
    goHome: 'الذهاب إلى الرئيسية',
    attempt: 'محاولة',
  },
  ru: {
    reloading: 'Перезагрузка...',
    anErrorOccurred: 'Произошла Ошибка',
    autoReloading: 'Страница автоматически перезагружается, пожалуйста подождите...',
    tryingToReload: 'Попытка перезагрузить страницу...',
    retryFailed: 'Страница пыталась перезагрузиться несколько раз, но проблема сохраняется.',
    refreshPage: 'Обновить Страницу',
    goHome: 'На Главную',
    attempt: 'Попытка',
  },
};

function getEBStrings() {
  try {
    const lang = localStorage.getItem('preferredLanguage') || 'en';
    return EB_STRINGS[lang] || EB_STRINGS['en'];
  } catch {
    return EB_STRINGS['en'];
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: this.getStoredRetryCount(),
      isAutoReloading: false,
    };
  }

  private getStoredRetryCount(): number {
    try {
      const lastRetry = localStorage.getItem(RETRY_TIMESTAMP_KEY);
      const storedCount = localStorage.getItem(RETRY_STORAGE_KEY);
      
      if (lastRetry) {
        const timeSinceLastRetry = Date.now() - parseInt(lastRetry, 10);
        if (timeSinceLastRetry > RETRY_RESET_TIME) {
          localStorage.removeItem(RETRY_STORAGE_KEY);
          localStorage.removeItem(RETRY_TIMESTAMP_KEY);
          return 0;
        }
      }
      
      return storedCount ? parseInt(storedCount, 10) : 0;
    } catch {
      return 0;
    }
  }

  private incrementRetryCount(): number {
    try {
      const newCount = this.state.retryCount + 1;
      localStorage.setItem(RETRY_STORAGE_KEY, newCount.toString());
      localStorage.setItem(RETRY_TIMESTAMP_KEY, Date.now().toString());
      return newCount;
    } catch {
      return this.state.retryCount + 1;
    }
  }

  private clearRetryCount(): void {
    try {
      localStorage.removeItem(RETRY_STORAGE_KEY);
      localStorage.removeItem(RETRY_TIMESTAMP_KEY);
    } catch {}
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    console.error('[ErrorBoundary] Caught error:', error.name, '-', error.message);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    const newRetryCount = this.incrementRetryCount();
    
    if (newRetryCount < MAX_AUTO_RETRIES) {
      this.setState({ isAutoReloading: true });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  }

  handleManualReload = (): void => {
    this.clearRetryCount();
    window.location.reload();
  };

  handleGoHome = (): void => {
    this.clearRetryCount();
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const canAutoRetry = this.state.retryCount < MAX_AUTO_RETRIES;
      const s = getEBStrings();

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card border border-border rounded-lg shadow-lg p-6 text-center">
            <div className="mb-4">
              {this.state.isAutoReloading ? (
                <RefreshCw className="w-16 h-16 mx-auto text-primary animate-spin" />
              ) : (
                <AlertTriangle className="w-16 h-16 mx-auto text-yellow-500" />
              )}
            </div>
            
            <h2 className="text-xl font-bold text-foreground mb-2">
              {this.state.isAutoReloading ? s.reloading : s.anErrorOccurred}
            </h2>
            
            <p className="text-muted-foreground mb-6">
              {this.state.isAutoReloading 
                ? s.autoReloading
                : canAutoRetry 
                  ? s.tryingToReload
                  : s.retryFailed}
            </p>

            {!this.state.isAutoReloading && !canAutoRetry && (
              <div className="space-y-3">
                <Button 
                  data-testid="button-reload-page"
                  onClick={this.handleManualReload}
                  className="w-full"
                  variant="default"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {s.refreshPage}
                </Button>
                
                <Button 
                  data-testid="button-go-home"
                  onClick={this.handleGoHome}
                  className="w-full"
                  variant="outline"
                >
                  {s.goHome}
                </Button>
              </div>
            )}

            {this.state.retryCount > 0 && !this.state.isAutoReloading && (
              <p className="text-xs text-muted-foreground mt-4">
                {s.attempt}: {this.state.retryCount}/{MAX_AUTO_RETRIES}
              </p>
            )}

            {this.state.error && !this.state.isAutoReloading && (
              <p className="text-xs text-muted-foreground/60 mt-3 font-mono break-all">
                {this.state.error.name}: {this.state.error.message}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
