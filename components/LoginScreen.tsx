import React, { useEffect } from 'react';
import { Database, ShieldCheck, Zap, Globe } from 'lucide-react';
import { authService } from '../services/authService';
import { TRANSLATIONS } from '../constants';

interface LoginScreenProps {
  lang: 'en' | 'es';
  setLang?: (lang: 'en' | 'es') => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ lang = 'en', setLang }) => {
  useEffect(() => {
    authService.init();
    if (localStorage.getItem('nexus_theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const handleLogin = () => {
    authService.login();
  };

  const t = TRANSLATIONS[lang];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors">
      <div className="absolute top-4 right-4">
        {setLang && (
          <button
            onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg shadow-sm text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Globe size={16} />
            {lang === 'en' ? 'Español' : 'English'}
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 dark:bg-black p-8 text-center border-b dark:border-slate-800">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-xl shadow-lg shadow-blue-900/50">
              <Database className="text-white w-8 h-8" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{t.loginTitle}</h1>
          <p className="text-slate-400 text-sm">{t.loginSubtitle}<br />Built on Google Drive</p>
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg text-green-700 dark:text-green-400 mt-1">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">{t.localFirst}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t.localFirstDesc}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg text-purple-700 dark:text-purple-400 mt-1">
                <Zap size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">{t.knowledgeGraph}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t.knowledgeGraphDesc}</p>
              </div>
            </div>
          </div>

          <div className="mt-10 space-y-3">
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium py-3 px-4 rounded-lg transition-all shadow-sm hover:shadow-md"
            >
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
              {t.signInGoogle}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-900 px-2 text-slate-500 dark:text-slate-400">or</span>
              </div>
            </div>

            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium py-2.5 px-4 rounded-lg transition-all text-sm"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
              Try Demo Mode
            </button>

            <p className="text-xs text-center text-slate-400 mt-4">
              By connecting, you allow NexusDrive to create a folder in your Google Drive.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;