import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n';

export function IframeOverlay() {
  const [isInIframe, setIsInIframe] = useState(false);
  const { language } = useLanguage();

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }
  }, []);

  if (!isInIframe) return null;

  const handlePlayClick = () => {
    window.open('https://idlethrone.com', '_blank');
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-gray-900 via-purple-900/30 to-gray-900 flex flex-col items-center justify-center">
      <div className="text-center p-8">
        <img 
          src="/icons/icon-192x192.png" 
          alt="IdleThrone" 
          className="w-32 h-32 mx-auto mb-6 rounded-2xl shadow-2xl"
        />
        <h1 className="text-4xl font-bold text-amber-400 mb-4 tracking-wide">
          IdleThrone
        </h1>
        <p className="text-gray-300 mb-8 text-lg max-w-md">
          {t(language, 'iframeMessage') || 'Dark Fantasy Idle RPG'}
        </p>
        <button
          onClick={handlePlayClick}
          className="px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xl rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200"
          data-testid="button-play-game"
        >
          {t(language, 'playGame') || 'Play Game'}
        </button>
      </div>
    </div>
  );
}
