import { ReactNode, useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, HelpCircle, Globe, Home as HomeIcon } from "lucide-react"; // ⭐ NEW: HomeIcon
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
  showHome?: boolean;
  onBack?: () => void;
  className?: string;
  /** Optional slot for page-specific actions on the right side of the header */
  headerRightExtra?: ReactNode;
}

// Idle timings
const IDLE_BEFORE_PROMPT_MS = 60_000;
const IDLE_PROMPT_TO_LOGOUT_MS = 30_000;

// Pages without idle timer
const IDLE_DISABLED_PATH_PREFIXES = [
  "/payment",
  "/frontdeskcash",
  "/staff",
  "/settings",
];
const IDLE_DISABLED_EXACT = ["/", "/start"];

export default function KioskLayout({
  children,
  title,
  showBack = true,
  showHelp = true,
  showLanguage = false,
  showHome = true,
  onBack,
  className = "",
  headerRightExtra,
}: KioskLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = useState<Language>(getStoredLanguage());
  const { t } = useTranslation(language);

  const [showIdleConfirm, setShowIdleConfirm] = useState(false);
  const [promptRemaining, setPromptRemaining] = useState(
    IDLE_PROMPT_TO_LOGOUT_MS / 1000
  );

  const idleResetRef = useRef<(() => void) | null>(null);

  // Disable idle system on special pages
  const isIdleDisabled =
    IDLE_DISABLED_EXACT.includes(location.pathname) ||
    IDLE_DISABLED_PATH_PREFIXES.some((prefix) =>
      location.pathname.startsWith(prefix)
    );

  const handleLogout = useCallback(() => {
    setShowIdleConfirm(false);
    navigate("/start"); // HOME screen
  }, [navigate]);

  const handleHomeClick = () => {
    // Manually open the same modal as idle timeout
    setShowIdleConfirm(true);
  };

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
        setShowIdleConfirm(true);
      }, IDLE_BEFORE_PROMPT_MS);
    };

    idleResetRef.current = startIdleTimer;

    const handleActivity = () => {
      if (showIdleConfirm) return;
      startIdleTimer();
    };

    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
    ] as const;

    events.forEach((ev) =>
      document.addEventListener(ev, handleActivity, true)
    );

    startIdleTimer();

    return () => {
      clearIdleTimer();
      events.forEach((ev) =>
        document.removeEventListener(ev, handleActivity, true)
      );
    };
  }, [location.pathname, isIdleDisabled, showIdleConfirm]);

  useEffect(() => {
    if (!showIdleConfirm || isIdleDisabled) {
      setPromptRemaining(IDLE_PROMPT_TO_LOGOUT_MS / 1000);
      return;
    }

    setPromptRemaining(IDLE_PROMPT_TO_LOGOUT_MS / 1000);

    const interval = window.setInterval(() => {
      setPromptRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
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
    if (onBack) onBack();
    else navigate(-1);
  };

  const handleHelp = () => navigate("/help");

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    setStoredLanguage(newLang);
  };

  const handleStayOnScreen = () => {
    setShowIdleConfirm(false);
    idleResetRef.current?.();
  };

  const isWelcomePage =
    location.pathname === "/" || location.pathname === "/start";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      {/* Top App Bar */}
      <header className="flex items-center justify-between p-6 bg-card/80 backdrop-blur-sm shadow-card">
        {/* Left side */}
        <div className="flex items-center gap-4">
          <img src={medmitraLogo} alt="MedMitra AI" className="h-12 w-auto" />
          {title && (
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          )}
        </div>

        {/* Right side buttons */}
        <div className="flex items-center gap-4">
          {/* Page-specific actions (e.g. WhatsApp promo on welcome page) */}
          {headerRightExtra}

          {/* HOME BUTTON (hidden on welcome page) */}
          {showHome && !isWelcomePage && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleHomeClick}
              className="flex items-center gap-2 min-w-[100px]"
            >
              <HomeIcon className="h-4 w-4" />
              Home
            </Button>
          )}

          {showHelp && (
            <Button variant="outline" size="sm" onClick={handleHelp}>
              <HelpCircle className="h-4 w-4 mr-2" /> Help
            </Button>
          )}

          {showBack && !isWelcomePage && (
            <Button variant="outline" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          )}
        </div>
      </header>

      <main className={`flex-1 p-6 ${className}`}>{children}</main>

      {/* Idle / Home Confirm Modal */}
      <AlertDialog open={showIdleConfirm} onOpenChange={setShowIdleConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("idleDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("idleDialog.description").replace(
                "__SECONDS__",
                String(promptRemaining)
              )}
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
