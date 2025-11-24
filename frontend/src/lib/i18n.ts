// Multi-language support for MedMitra AI Kiosk

export type Language = 'en' | 'hi';

export interface Translations {
  [key: string]: string | Translations;
}

export const translations: Record<Language, Translations> = {
  en: {
    common: {
      back: 'Back',
      next: 'Next',
      cancel: 'Cancel',
      confirm: 'Confirm',
      proceed: 'Proceed',
      help: 'Need Help?',
      loading: 'Loading...',
      retry: 'Try Again',
      print: 'Print',
      save: 'Save',
    },
    idle: {
      title: 'Welcome to MedMitra AI',
      subtitle: 'Your Digital Healthcare Assistant',
      tapToStart: 'Tap to Start',
      selectLanguage: 'Select Language',
    },
    languages: {
      en: 'English',
      hi: 'हिंदी',
    },
    identify: {
      title: 'Identify Yourself',
      scanQR: 'Scan QR Code',
      enterOTP: 'Enter Mobile Number',
      phoneNumber: 'Mobile Number',
      sendOTP: 'Send OTP',
      enterOTPCode: 'Enter OTP Code',
      verify: 'Verify',
      privacyNote: 'Your information is kept secure and private.',
    },
    appointment: {
      title: 'Appointment Found',
      patient: 'Patient',
      doctor: 'Doctor',
      time: 'Time',
      status: 'Status',
      paid: 'Paid',
      unpaid: 'Unpaid',
      payNow: 'Pay Now',
      notYou: 'Not You?',
    },
    welcome: {
      title: "Welcome to MedMitra AI",
      subtitle: "Your digital healthcare assistant. Please select how you'd like to proceed with your visit today.",
      appointmentTitle: "I have an appointment",
      appointmentDesc: "Scan QR code or enter details",
      walkinTitle: "Walk-in patient",
      walkinDesc: "Register for new visit",
      continue: "Continue",
      assistance: "Need assistance? Our friendly staff at the front desk are happy to help you get started."
    },
    // ✅ NEW: used by LabPage / KioskLayout
    lab_services_title: "Laboratory Services",
    // Add more translations as needed...
  },
  hi: {
    common: {
      back: 'वापस',
      next: 'आगे',
      cancel: 'रद्द करें',
      confirm: 'पुष्टि करें',
      proceed: 'आगे बढ़ें',
      help: 'सहायता चाहिए?',
      loading: 'लोड हो रहा है...',
      retry: 'फिर कोशिश करें',
      print: 'प्रिंट',
      save: 'सेव',
    },
    languages: {
      en: 'English',
      hi: 'हिंदी',
    },
    welcome: {
      title: "MedMitra AI में आपका स्वागत है",
      subtitle: "आपका डिजिटल स्वास्थ्य सहायक। कृपया चुनें कि आप अपनी यात्रा कैसे जारी रखना चाहेंगे।",
      appointmentTitle: "मेरी अपॉइंटमेंट है",
      appointmentDesc: "QR कोड स्कैन करें या विवरण दर्ज करें",
      walkinTitle: "नया मरीज",
      walkinDesc: "नई विज़िट के लिए पंजीकरण करें",
      continue: "आगे बढ़ें",
      assistance: "सहायता चाहिए? फ्रंट डेस्क पर हमारा स्टाफ आपकी मदद करने के लिए तैयार है।"
    },
    // ✅ NEW: Hindi version for the same key
    lab_services_title: "प्रयोगशाला सेवाएँ",
    // Add Hindi translations...
  },
};

// Simple translation hook
export const useTranslation = (language: Language = 'en') => {
  const t = (key: string, defaultText?: string): string => {
    const keys = key.split('.');
    let value: any = translations[language];

    for (const k of keys) {
      value = value?.[k];
    }

    return typeof value === 'string' ? value : (defaultText || key);
  };

  return { t };
};

// Language persistence
export const getStoredLanguage = (): Language => {
  const lang = localStorage.getItem('medmitra-language');
  if (lang === 'en' || lang === 'hi') {
    return lang;
  }
  return 'en'; // default
};

export const setStoredLanguage = (language: Language): void => {
  localStorage.setItem('medmitra-language', language);
};
