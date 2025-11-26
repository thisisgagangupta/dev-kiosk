import { ReactNode, useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, HelpCircle, Globe } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useTranslation,
  getStoredLanguage,
  setStoredLanguage,
  type Language,
} from "@/lib/i18n";
import medmitraLogo from "@/assets/medmitra-logo.png";

interface KioskLayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  showHelp?: boolean;
  showLanguage?: boolean;
  onBack?: () => void;
  className?: string;
}

// Idle behaviour:
// - 60s inactivity -> show confirm dialog
// - Dialog shows a countdown (30s). When it hits 0, auto-logout.
const IDLE_BEFORE_PROMPT_MS = 60_000;
const IDLE_PROMPT_TO_LOGOUT_MS = 30_000;

// Pages where idle timer should be disabled (staff / payment / home views)
const IDLE_DISABLED_PATH_PREFIXES = [
  "/payment",       // payment screen
  "/frontdeskcash", // front desk cash console
  "/staff",         // staff-only page
  "/settings",      // settings page
];

// Exact routes where idle timer should be disabled (home)
const IDLE_DISABLED_EXACT = ["/", "/start"];

export default function KioskLayout({
  children,
  title,
  showBack = true,
  showHelp = true,
  showLanguage = false,
  onBack,
  className = "",
}: KioskLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = useState<Language>(getStoredLanguage());
  const { t } = useTranslation(language);

  const [showIdleConfirm, setShowIdleConfirm] = useState(false);
  const [promptRemaining, setPromptRemaining] = useState(
    IDLE_PROMPT_TO_LOGOUT_MS / 1000
  );

  // Expose a "reset idle timers" function so we can call it from
  // the "Stay on this screen" button.
  const idleResetRef = useRef<(() => void) | null>(null);

  const isIdleDisabled =
    IDLE_DISABLED_EXACT.includes(location.pathname) ||
    IDLE_DISABLED_PATH_PREFIXES.some((prefix) =>
      location.pathname.startsWith(prefix)
    );

  const handleLogout = useCallback(() => {
    setShowIdleConfirm(false);
    navigate("/start");
  }, [navigate]);

  // Auto-idle functionality (show dialog after 60s)
  useEffect(() => {
    if (isIdleDisabled) {
      setShowIdleConfirm(false);
      idleResetRef.current = null;
      return;
    }

    let idleTimer: number | null = null;

    const clearIdleTimer = () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const startIdleTimer = () => {
      clearIdleTimer();
      idleTimer = window.setTimeout(() => {
        // After 60s of inactivity, show dialog.
        setShowIdleConfirm(true);
      }, IDLE_BEFORE_PROMPT_MS);
    };

    // Save reset function so buttons can restart timers explicitly
    idleResetRef.current = startIdleTimer;

    const handleActivity = () => {
      // If dialog is already open, ignore random taps/movement.
      if (showIdleConfirm) return;
      // User is active -> restart idle timer, keep dialog hidden.
      startIdleTimer();
    };

    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
    ] as const;

    events.forEach((event) =>
      document.addEventListener(event, handleActivity, true)
    );

    // Start timer on mount / route change
    startIdleTimer();

    return () => {
      clearIdleTimer();
      events.forEach((event) =>
        document.removeEventListener(event, handleActivity, true)
      );
    };
  }, [location.pathname, isIdleDisabled, showIdleConfirm]);

  // Countdown while dialog is visible
  useEffect(() => {
    if (!showIdleConfirm || isIdleDisabled) {
      // Reset countdown when dialog closes or idle disabled
      setPromptRemaining(IDLE_PROMPT_TO_LOGOUT_MS / 1000);
      return;
    }

    // Reset to full countdown whenever dialog opens
    setPromptRemaining(IDLE_PROMPT_TO_LOGOUT_MS / 1000);

    const interval = window.setInterval(() => {
      setPromptRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          // Auto-logout when countdown hits zero
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [showIdleConfirm, isIdleDisabled, handleLogout]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const handleHelp = () => {
    navigate("/help");
  };

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    setStoredLanguage(newLang);
  };

  const handleStayOnScreen = () => {
    setShowIdleConfirm(false);
    // Explicitly reset idle timers when user chooses to stay
    idleResetRef.current?.();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      {/* App Bar */}
      <header className="flex items-center justify-between p-6 bg-card/80 backdrop-blur-sm shadow-card">
        <div className="flex items-center gap-4">
          <img
            src={medmitraLogo}
            alt="MedMitra AI"
            className="h-12 w-auto"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.nextElementSibling?.classList.remove("hidden");
            }}
          />
          <div className="hidden bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-medium">
            MedMitra AI
          </div>
          {title && (
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Language selector kept commented as in original */}
          {/* {showLanguage && (
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <div className="flex gap-2">
                {(['en', 'hi'] as Language[]).map((lang) => (
                  <Button
                    key={lang}
                    variant={language === lang ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleLanguageChange(lang)}
                    className="min-w-[60px]"
                  >
                    {t(`languages.${lang}`)}
                  </Button>
                ))}
              </div>
            </div>
          )} */}

          {showHelp && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleHelp}
              className="flex items-center gap-2"
            >
              <HelpCircle className="h-4 w-4" />
              {t("common.help")}
            </Button>
          )}

          {showBack && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              className="flex items-center gap-2 min-w-[100px]"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 p-6 ${className}`}>{children}</main>

      {/* Idle confirmation dialog with countdown */}
      <AlertDialog open={showIdleConfirm} onOpenChange={setShowIdleConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("idleDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("idleDialog.description")
                .replace("__SECONDS__", String(promptRemaining))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleStayOnScreen}>
              {t("idleDialog.stay")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>
              {t("idleDialog.logout")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
