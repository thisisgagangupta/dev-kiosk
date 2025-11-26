// frontend/src/lib/i18n.ts
// Multi-language support for MedMitra AI Kiosk

export type Language = "en" | "hi";

export interface Translations {
  [key: string]: string | Translations;
}

export const translations: Record<Language, Translations> = {
  en: {
    common: {
      back: "Back",
      next: "Next",
      cancel: "Cancel",
      confirm: "Confirm",
      proceed: "Proceed",
      help: "Need Help?",
      loading: "Loading...",
      retry: "Try Again",
      print: "Print",
      save: "Save",
      yes: "Yes",
      no: "No",
    },
    idleDialog: {
      title: "Are you still there?",
      description:
        "You've been inactive for a while. You will be logged out and returned to the home screen in __SECONDS__ seconds unless you choose to stay.",
      stay: "Stay on this screen",
      logout: "Log out & go to home",
    },
    idle: {
      title: "Welcome to MedMitra AI",
      subtitle: "Your Digital Healthcare Assistant",
      tapToStart: "Tap to Start",
      selectLanguage: "Select Language",
    },
    languages: {
      en: "English",
      hi: "हिंदी",
    },
    welcome: {
      title: "Welcome to MedMitra AI",
      subtitle:
        "Your digital healthcare assistant. Please select how you'd like to proceed with your visit today.",
      selectLanguageLabel: "Select Language / भाषा चुनें",
      appointmentTitle: "I have an appointment",
      appointmentDesc: "Scan QR code or enter details",
      walkinTitle: "Walk-in patient",
      walkinDesc: "Register for new visit",
      labTitle: "Lab services",
      labDesc: "Book tests or collect reports",
      pharmacyTitle: "Pharmacy",
      pharmacyDesc: "Purchase medicines or pickup orders",
      diagnosticsTitle: "Diagnostics",
      diagnosticsDesc: "CT, MRI, X-Ray, USG services",
      continue: "Continue",
      assistance:
        "Need assistance? Our friendly staff at the front desk are happy to help you get started.",
    },
    identify: {
      title: "Identify Yourself",
      subtitle:
        "Please verify your identity to proceed with your appointment",
      scanQR: "Scan QR Code",
      enterOTP: "Enter Mobile Number",
      phoneNumber: "Mobile Number",
      sendOTP: "Send OTP",
      enterOTPCode: "Enter OTP Code",
      verify: "Verify",
      privacyNote: "Your information is kept secure and private.",
      qrCameraHint: "Camera preview would appear here",
      qrPositionHint:
        "Position your appointment QR code in the center of the frame",
      qrStartScan: "Start QR Scan",
      qrScanning: "Scanning QR Code...",
      manualQrLabel: "Enter QR Code Number",
      manualQrPlaceholder: "Type the code printed with your QR",
      manualQrInvalidTitle: "Invalid Code",
      manualQrInvalidDesc:
        "Please enter the QR code number printed with your appointment.",
      manualQrAcceptedTitle: "QR Code Accepted",
      manualQrAcceptedDesc: "Appointment found!",
      otpInvalidPhoneTitle: "Invalid Phone Number",
      otpInvalidPhoneDesc:
        "Please enter a valid 10-digit mobile number.",
      otpSentTitle: "OTP Sent",
      otpSentDesc: "Please check your phone for the code.",
      otpErrorTitle: "Error",
      otpVerifyInvalidTitle: "Invalid OTP",
      otpVerifyInvalidDesc:
        "Please enter the complete verification code.",
      otpVerifyFailedTitle: "Verification Failed",
      otpVerifySuccessTitle: "Verified Successfully",
      otpVerifySuccessDesc: "You’re checked in.",
      otpChangePhone: "Change Phone Number",
    },
    appointment: {
      title: "Appointment Details",
      headerPrefix: "Showing bookings for",
      upcomingNoneTitle: "No upcoming appointments.",
      upcomingNoneDesc:
        "If you recently booked, please wait a moment or contact the front desk.",
      noAppointmentsFoundTitle: "No Appointments Found",
      noAppointmentsFoundDesc:
        "We didn’t find any active bookings for this number.",
      failedTitle: "Failed to load",
      notYou: "Not you? Change number",
      startWalkin: "Start a Walk-in Visit",
      yourUpcoming: "Your upcoming bookings",
      unpaid: "Unpaid",
      paidOrNA: "Paid / NA",
      testsPrefix: "Tests:",
      moreTestsSuffix: "more",
      patientLabelFallback: "Patient",
      continue: "Continue",
    },
    walkin: {
      title: "Walk-in Registration",
      subtitle:
        "Please provide your basic information to register for your visit",
      nameLabel: "Full Name",
      mobileLabel: "Mobile Number",
      yearOfBirthLabel: "Year of Birth",
      genderLabel: "Gender (Optional)",
      caregiverLabel: "I am accompanied by a caregiver/guardian",
      caregiverRequiredNote:
        "Required for patients younger than 15 years.",
      caregiverErrorTitle: "Caregiver Required",
      caregiverErrorDesc:
        "Patients under 15 years must be accompanied by a caregiver or guardian to register.",
      groupSizeLabel: "Group Size (including you)",
      groupSizeHelper:
        "We’ll book __N__ time slot(s) for your group.",
      privacyNote:
        "Your information is securely stored and used only for medical purposes.",
      errors: {
        nameRequiredTitle: "Name Required",
        nameRequiredDesc: "Please enter your full name.",
        invalidMobileTitle: "Invalid Mobile Number",
        invalidMobileDesc:
          "Please enter a valid 10-digit mobile number.",
        yobRequiredTitle: "Year of Birth Required",
        yobRequiredDesc: "Please select your year of birth.",
        otpRequiredTitle: "OTP Required",
        otpRequiredDesc:
          "Please verify your mobile number using the OTP before proceeding.",
        otpSendFailedTitle: "OTP Send Failed",
        registrationFailedTitle: "Registration Failed",
      },
      otp: {
        send: "Send OTP",
        resend: "Resend OTP",
        sentTitle: "OTP Sent",
        sentDescPrefix: "We’ve sent an OTP to",
        enterLabel: "Enter OTP",
        helper:
          "We’ve sent a code by SMS. Please enter it here to continue.",
      },
      buttons: {
        proceed: "Proceed",
        backToOptions: "Back to Options",
        registering: "Registering...",
      },
    },
    walkinSlot: {
      title: "Book Walk-in Appointment",
      subtitleSingle:
        "Select your preferred doctor, date, and time slot",
      subtitleGroup:
        "Select __N__ separate time slot(s) for your group",
      chooseDoctor: "Choose Your Doctor",
      doctorSubtitle: "Select from available walk-in doctors",
      availableDoctors: "Available Doctors",
      groupBookingTitle: "Group Booking",
      groupBookingDesc:
        "Select __N__ separate time slots for your group.",
      selectDate: "Select Date",
      selectDateSubtitle: "Pick your preferred appointment date",
      chooseTimeSlots: "Choose Time Slot(s)",
      availableSlotsFor: "Available slots for __DATE__",
      loadingSlotsTitle: "Loading available slots...",
      loadingSlotsSubtitle: "Please wait",
      noSlotsTitle: "No slots available",
      noSlotsSubtitle: "Please try a different date",
      bookingErrorTitle: "Booking Error",
      bookingButtonSingle: "Confirm & Continue",
      bookingButtonGroup: "Book __N__ Slots",
      clearSelection: "Clear",
      selectedLabel: "Selected (__SEL__/__TOTAL__)",
      summaryTitle: "Booking Summary",
      summaryDoctor: "Doctor",
      summaryClinic: "Clinic",
      summaryDate: "Date",
      summarySelectedTimes: "Selected Time(s)",
      summaryGroupSize: "Group Size",
      summaryGroupSuffix: "people",
      assistanceTitle: "Need Assistance?",
      assistanceDesc:
        "Staff members are available at the reception desk for help",
      assistanceButton: "Get Help",
      errors: {
        needNSlotsTitle: "Please select __N__ slot(s)",
        needNSlotsDesc: "Currently selected: __CURR__",
        slotUnavailableTitle: "Slot Unavailable",
      },
      successTitle: "Appointment(s) Booked",
    },
    reason: {
      title: "What brings you here today?",
      subtitle:
        "Please select the reason(s) for your visit to help us serve you better",
      otherDetailsTitle: "Other / Additional Details",
      otherDetailsPlaceholder:
        "Please describe your condition or symptoms in your own words...",
      voiceRecordingStartedTitle: "Recording Started",
      voiceRecordingStartedDesc:
        "Please describe your symptoms in your own words.",
      voiceRecordingStoppedTitle: "Recording Stopped",
      voiceRecordingStoppedDesc: "Transcription captured.",
      voiceStatusIdle:
        "Click the mic to record and auto-transcribe your voice",
      voiceStatusRecording:
        "Recording… Click the mic to stop",
      voiceStatusProcessing: "Recording… (finalizing…)",
      reasonRequiredTitle: "Reason Required",
      reasonRequiredDesc:
        "Please select at least one reason or describe your condition.",
      visitReasonRecordedTitle: "Visit Reason Recorded",
      visitReasonRecordedDesc:
        "Proceeding to check-in process.",
      selectedReasonsTitle: "Selected Reasons:",
      uploadDocsTitle: "Upload Medical Documents",
      uploadDocsSubtitle:
        "Share previous reports to help your doctor",
      uploadDocsButton: "Upload Documents",
      continueButton: "Continue to Check-in",
      privacyNote:
        "This information helps our medical staff prepare for your visit and ensure you receive appropriate care. All details are kept confidential.",
      options: {
        generalCheckup: "General Check-up",
        feverCold: "Fever / Cold",
        headache: "Headache",
        backPain: "Back Pain",
        jointPain: "Joint Pain",
        eyeProblem: "Eye Problem",
        skinIssue: "Skin Issue",
        stomachPain: "Stomach Pain",
        diabetes: "Diabetes Check",
        bloodPressure: "Blood Pressure",
        pregnancy: "Pregnancy Related",
        followUp: "Follow-up Visit",
      },
    },
    payment: {
      title: "Payment Summary",
      subtitleWalkin:
        "Please select your services and complete the payment",
      subtitleLab:
        "Please review your lab charges and complete the payment",
      subtitlePharmacy:
        "Please review your pharmacy charges and complete the payment",
      subtitleIdentify:
        "Please review your charges and complete the payment",
      billDetails: "Bill Details",
      registrationFee: "Registration Fee",
      subtotal: "Subtotal",
      gst: "GST (10%)",
      totalAmount: "Total Amount",
      walkinServicesNote:
        "Registration fee is automatically applied for walk-ins.",
      chooseHowToPay: "Choose How You Want to Pay",
      processingTitle: "Processing Payment...",
      processingSubtitle:
        "Please wait while we process your payment",
      payAtReceptionTitle: "Pay at Reception (Cash)",
      payAtReceptionDesc:
        "Pay in cash at the front desk and get your token",
      alreadyPaidTitle: "Already paid?",
      alreadyPaidDesc:
        "Skip payment if you've already settled the bill at the front desk",
      skipPaymentButton: "Skip Payment",
      successTitle: "Payment Successful!",
      successSubtitle:
        "Your payment has been processed successfully",
      amountPaid: "Amount Paid",
      transactionId: "Transaction ID",
      paymentMethod: "Payment Method",
      dateTime: "Date & Time",
      printReceipt: "Print Receipt",
      continue: "Continue",
      autoTokenHint:
        "Proceeding to token generation in ~1–2 seconds...",
      failedTitle: "Payment Failed",
      failedSubtitle:
        "We couldn't process your payment. Please try again or contact our front desk for assistance.",
      tryAgain: "Try Again",
      getHelp: "Get Help",
      errors: {
        paymentErrorTitle: "Payment Error",
        paymentErrorDesc: "Could not start payment",
      },
    },
    token: {
      title: "Token Issued",
      fullTitle: "Token Issued Successfully!",
      subtitle:
        "Your check-in is complete. Please wait for your turn.",
      generating: "Generating your token…",
      yourTokenNumber: "Your Token Number",
      queuePosition: "Queue Position",
      estimatedWaitTime: "Estimated Wait Time",
      estimateConfidence: "Estimate Confidence",
      tokenActions: "Token Actions",
      printToken: "Print Token",
      showQrForStaff: "Show QR for Staff",
      viewLiveQueueStatus: "View Live Queue Status",
      staffScanQr: "Staff Scan QR",
      whatNextTitle: "What to Expect Next",
      nextSteps: {
        "0": "Find a comfortable seat in the waiting area",
        "1": "Keep your token number visible and ready",
        "2": "Listen for your token number announcement",
        "3": "Proceed to the designated room when called",
      },
    },
    queue: {
      title: "Live Queue Status",
      subtitle: "Real-time updates for your token",
      yourPosition: "Your Position",
      tokenNumber: "Token Number",
      estimatedTime: "Estimated Time",
      nowNextTitle: "Now / Next",
      autoRefreshing: "Auto-refreshing",
      viewMyToken: "View My Token",
      labServices: "Lab Services",
      needHelp: "Need Help?",
    },
    pharmacy: {
      title: "Pharmacy Services",
      subtitle: "Pay for your prescription and generate pickup token",
      modeQuestion: "How are you visiting today?",
      portalTitle: "I booked medicines on app/portal",
      portalDesc:
        "We’ll verify your phone, fetch your pharmacy bill and let you pay.",
      walkinTitle: "I walked in to buy medicines",
      walkinDesc:
        "We’ll verify your mobile by OTP and create a quick bill.",
      verifyMobileTitle: "Verify Mobile & Fetch Bill",
      mobileNumber: "Mobile Number",
      sendOtp: "Send OTP",
      resendOtp: "Resend OTP",
      enterOtpLabel: "Enter OTP sent to your mobile",
      verifyFetchBill: "Verify & Fetch Bill",
      prescriptionDetails: "Prescription Details",
      billSummary: "Bill Summary",
      medicinesSummary: "Medicines (__COUNT__ items)",
      totalAmount: "Total Amount",
      payNowViaKiosk: "Pay Now via Kiosk",
      actionsTitle: "Actions",
      pickupToken: "Pickup Token",
      pickupTokenNumber: "Token Number",
      pickupTokenSourceDoctor: "Doctor Visit",
      pickupTokenSourcePharmacy: "Pharmacy",
      pickupTokenShowAtCounter: "Show this at the pharmacy counter",
      infoLocation: "Pharmacy Location",
      infoLocationText: "Ground Floor - Main Building",
      infoHours: "Working Hours",
      infoHoursText: "8:00 AM - 9:00 PM",
      infoLicensed: "Licensed Pharmacy",
      infoLicensedText: "Certified & Quality Assured",
      helpFindingPrescription:
        "Need help finding your prescription?",
      helpFindingPrescriptionDesc:
        "Contact our pharmacy staff or visit the front desk for assistance.",
    },
    lab: {
      title: "Laboratory Services",
      subtitle:
        "Review your tests, complete payment if needed, and generate your lab token.",
      howVisitingTitle: "How are you visiting today?",
      portalCardTitle: "I booked tests online / app",
      portalCardDesc:
        "We’ll fetch your lab booking (and doctor appointment, if any) using your mobile number and OTP.",
      walkinCardTitle: "I am a walk-in patient",
      walkinCardDesc:
        "We’ll verify your mobile by OTP, register you, and book tests on the same token.",
      mobileNumber: "Mobile Number",
      patientName: "Patient Name",
      yearOfBirth: "Year of Birth",
      sendOtp: "Send OTP",
      resendOtp: "Resend OTP",
      enterOtp: "Enter OTP sent to your mobile",
      verifyFetchBooking: "Verify & Fetch Booking",
      verifyOtpContinue: "Verify OTP & Continue",
      doctorOrderedTitle: "Doctor Ordered Tests",
      doctorOrderedSubtitle:
        "These tests have been prescribed by your doctor (if any)",
      noDoctorTests: "No tests ordered by doctor",
      additionalTestsTitle: "Additional Tests (Optional)",
      additionalTestsSubtitle: "Add extra tests to your package",
      billSummaryTitle: "Bill Summary",
      orderedTestsLabel: "Ordered Tests",
      additionalTestsLabel: "Additional Tests",
      totalLabel: "Total",
      actionsTitle: "Actions",
      generateLabToken: "Generate Lab Token",
      useExistingToken: "Use Token __TOKEN__",
      payNow: "Pay Now – ₹__AMOUNT__",
      paymentCompleted: "Payment Completed",
      printSampleLabels: "Print Sample Labels",
      instructionsTitle: "Lab Instructions",
      instructionsList: {
        "0": "Fasting required for some tests",
        "1": "Carry valid ID for verification",
        "2": "Reports available in 10 hours",
        "3": "Collect reports from lab counter or patient portal",
      },
      services: {
        title: "Sample Collection",
        location: "Ground Floor – Lab Wing",
        hoursTitle: "Collection Hours",
        hoursText: "7:00 AM – 11:00 AM",
        reportTitle: "Report Delivery",
        reportText: "within 10 hours",
      },
    },
    diagnostics: {
      title: "Diagnostics",
      mainTitle: "Diagnostic Imaging Services",
      mainSubtitle:
        "Select the type of diagnostic imaging service you need. Our advanced equipment and expert technicians ensure accurate results.",
      mriTitle: "MRI Scan",
      mriDesc: "Magnetic Resonance Imaging",
      ctTitle: "CT Scan",
      ctDesc: "Computed Tomography",
      xrayTitle: "X-Ray",
      xrayDesc: "Radiography imaging",
      usgTitle: "USG",
      usgDesc: "Ultrasound imaging",
      whatToExpectTitle: "What to expect:",
      whatToExpectDesc:
        "After selecting your service, you'll verify your identity, pick a time slot, and complete payment.",
      whatToExpectNote:
        "Please ensure you have any referral documents or prescription from your doctor ready.",
    },
    diagnosticsBooking: {
      titlePrefix: "Booking",
      subtitle:
        "Please enter your details, verify your mobile by OTP, and choose a convenient time.",
      patientDetailsTitle: "Patient Details",
      fullName: "Full Name",
      mobileNumber: "Mobile Number",
      yearOfBirth: "Year of Birth",
      otpSendButton: "Send OTP",
      otpVerifyButton: "Verify OTP & Continue",
      otpResendButton: "Resend OTP",
      otpEnterLabel: "Enter OTP sent to your mobile",
      scheduleTitle: "Schedule",
      preferredDate: "Preferred Date",
      timeSlot: "Time Slot",
      serviceLabel: "Service",
      amountLabel: "Amount",
      proceedToPayment: "Proceed to Payment",
    },
    frontdesk: {
      title: "Front Desk Cash",
      queueTitle: "Cash Payments Queue",
      queueSubtitle:
        "Patients who chose “Pay at reception” appear here. Collect cash, mark paid, and issue a token.",
      noPending: "No pending cash payments.",
      loading: "Loading...",
      lastIssuedToken: "Last Issued Token",
      collectIssue: "Collect & Issue Token",
    },
    // For compatibility with existing usage:
    lab_services_title: "Laboratory Services",
  },

  // --------------------------- HINDI ---------------------------
  hi: {
    common: {
      back: "वापस",
      next: "आगे",
      cancel: "रद्द करें",
      confirm: "पुष्टि करें",
      proceed: "आगे बढ़ें",
      help: "सहायता चाहिए?",
      loading: "लोड हो रहा है...",
      retry: "फिर कोशिश करें",
      print: "प्रिंट",
      save: "सेव",
      yes: "हाँ",
      no: "नहीं",
    },
    idleDialog: {
      title: "क्या आप अभी भी यहाँ हैं?",
      description:
        "आप कुछ समय से निष्क्रिय हैं। यदि आप स्क्रीन पर बने रहने का चुनाव नहीं करते हैं, तो __SECONDS__ सेकंड में आपको होम स्क्रीन पर भेज दिया जाएगा।",
      stay: "यहीं रहें",
      logout: "लॉग आउट करें और होम पर जाएँ",
    },
    idle: {
      title: "MedMitra AI में आपका स्वागत है",
      subtitle: "आपका डिजिटल स्वास्थ्य सहायक",
      tapToStart: "शुरू करने के लिए टैप करें",
      selectLanguage: "भाषा चुनें",
    },
    languages: {
      en: "English",
      hi: "हिंदी",
    },
    welcome: {
      title: "MedMitra AI में आपका स्वागत है",
      subtitle:
        "आपका डिजिटल स्वास्थ्य सहायक। कृपया चुनें कि आप आज अपनी विज़िट कैसे जारी रखना चाहेंगे।",
      selectLanguageLabel: "भाषा चुनें / Select Language",
      appointmentTitle: "मेरी अपॉइंटमेंट है",
      appointmentDesc: "QR कोड स्कैन करें या विवरण दर्ज करें",
      walkinTitle: "वॉक-इन मरीज",
      walkinDesc: "नई विज़िट के लिए पंजीकरण करें",
      labTitle: "लैब सेवाएँ",
      labDesc: "टेस्ट बुक करें या रिपोर्ट लें",
      pharmacyTitle: "फार्मेसी",
      pharmacyDesc: "दवाइयाँ खरीदें या ऑर्डर लें",
      diagnosticsTitle: "डायग्नॉस्टिक्स",
      diagnosticsDesc: "CT, MRI, X-Ray, USG सेवाएँ",
      continue: "आगे बढ़ें",
      assistance:
        "सहायता चाहिए? फ्रंट डेस्क पर हमारा स्टाफ आपकी मदद के लिए उपलब्ध है।",
    },
    identify: {
      title: "अपनी पहचान दर्ज करें",
      subtitle: "कृपया अपनी अपॉइंटमेंट के लिए पहचान सत्यापित करें",
      scanQR: "QR कोड स्कैन करें",
      enterOTP: "मोबाइल नंबर दर्ज करें",
      phoneNumber: "मोबाइल नंबर",
      sendOTP: "OTP भेजें",
      enterOTPCode: "OTP कोड दर्ज करें",
      verify: "सत्यापित करें",
      privacyNote:
        "आपकी जानकारी सुरक्षित और गोपनीय रखी जाती है।",
      qrCameraHint: "यहाँ कैमरा प्रीव्यू दिखाई देगा",
      qrPositionHint:
        "अपनी अपॉइंटमेंट का QR कोड फ्रेम के बीच में रखें",
      qrStartScan: "QR स्कैन शुरू करें",
      qrScanning: "QR कोड स्कैन हो रहा है...",
      manualQrLabel: "QR कोड नंबर दर्ज करें",
      manualQrPlaceholder:
        "QR के साथ छपा कोड यहाँ टाइप करें",
      manualQrInvalidTitle: "अमान्य कोड",
      manualQrInvalidDesc:
        "कृपया अपनी अपॉइंटमेंट पर छपा QR कोड नंबर दर्ज करें।",
      manualQrAcceptedTitle: "QR कोड स्वीकार किया गया",
      manualQrAcceptedDesc: "अपॉइंटमेंट मिल गई!",
      otpInvalidPhoneTitle: "अमान्य मोबाइल नंबर",
      otpInvalidPhoneDesc:
        "कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें।",
      otpSentTitle: "OTP भेजा गया",
      otpSentDesc: "कृपया अपने फोन पर भेजा गया कोड देखें।",
      otpErrorTitle: "त्रुटि",
      otpVerifyInvalidTitle: "अमान्य OTP",
      otpVerifyInvalidDesc: "कृपया पूरा OTP कोड दर्ज करें।",
      otpVerifyFailedTitle: "सत्यापन असफल",
      otpVerifySuccessTitle: "सफलतापूर्वक सत्यापित",
      otpVerifySuccessDesc: "आपका चेक-इन हो गया है।",
      otpChangePhone: "मोबाइल नंबर बदलें",
    },
    appointment: {
      title: "अपॉइंटमेंट विवरण",
      headerPrefix: "इन बुकिंग्स को दिखाया जा रहा है:",
      upcomingNoneTitle: "कोई आगामी अपॉइंटमेंट नहीं।",
      upcomingNoneDesc:
        "यदि आपने अभी-अभी बुक किया है, तो कृपया कुछ समय बाद फिर प्रयास करें या फ्रंट डेस्क से संपर्क करें।",
      noAppointmentsFoundTitle: "कोई अपॉइंटमेंट नहीं मिला",
      noAppointmentsFoundDesc:
        "इस नंबर के लिए हमें कोई सक्रिय बुकिंग नहीं मिली।",
      failedTitle: "लोड करने में विफल",
      notYou: "यह आप नहीं हैं? नंबर बदलें",
      startWalkin: "वॉक-इन विज़िट शुरू करें",
      yourUpcoming: "आपकी आगामी बुकिंग्स",
      unpaid: "भुगतान बाकी",
      paidOrNA: "भुगतान हो चुका / लागू नहीं",
      testsPrefix: "टेस्ट:",
      moreTestsSuffix: "अधिक",
      patientLabelFallback: "मरीज",
      continue: "आगे बढ़ें",
    },
    walkin: {
      title: "वॉक-इन पंजीकरण",
      subtitle:
        "कृपया विज़िट के लिए अपना बुनियादी विवरण दर्ज करें",
      nameLabel: "पूरा नाम",
      mobileLabel: "मोबाइल नंबर",
      yearOfBirthLabel: "जन्म वर्ष",
      genderLabel: "लिंग (वैकल्पिक)",
      caregiverLabel:
        "मैं देखभालकर्ता / अभिभावक के साथ आया हूँ",
      caregiverRequiredNote:
        "15 वर्ष से कम उम्र के मरीज के लिए आवश्यक।",
      caregiverErrorTitle: "देखभालकर्ता आवश्यक",
      caregiverErrorDesc:
        "15 वर्ष से कम उम्र के मरीज को पंजीकरण के लिए देखभालकर्ता या अभिभावक के साथ आना होगा।",
      groupSizeLabel: "समूह का आकार (आप सहित)",
      groupSizeHelper:
        "हम आपके समूह के लिए __N__ टाइम स्लॉट बुक करेंगे।",
      privacyNote:
        "आपकी जानकारी सुरक्षित रूप से संग्रहित की जाती है और केवल चिकित्सकीय उपयोग के लिए है।",
      errors: {
        nameRequiredTitle: "नाम आवश्यक",
        nameRequiredDesc:
          "कृपया अपना पूरा नाम दर्ज करें।",
        invalidMobileTitle: "अमान्य मोबाइल नंबर",
        invalidMobileDesc:
          "कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें।",
        yobRequiredTitle: "जन्म वर्ष आवश्यक",
        yobRequiredDesc:
          "कृपया اپنا जन्म वर्ष चुनें।",
        otpRequiredTitle: "OTP आवश्यक",
        otpRequiredDesc:
          "कृपया आगे बढ़ने से पहले OTP के माध्यम से मोबाइल नंबर सत्यापित करें।",
        otpSendFailedTitle: "OTP भेजने में त्रुटि",
        registrationFailedTitle: "पंजीकरण असफल",
      },
      otp: {
        send: "OTP भेजें",
        resend: "OTP दोबारा भेजें",
        sentTitle: "OTP भेजा गया",
        sentDescPrefix: "हमने OTP भेजा है:",
        enterLabel: "OTP दर्ज करें",
        helper:
          "हमने SMS द्वारा कोड भेजा है। कृपया आगे बढ़ने के लिए यहाँ दर्ज करें।",
      },
      buttons: {
        proceed: "आगे बढ़ें",
        backToOptions: "विकल्पों पर वापस जाएँ",
        registering: "पंजीकरण हो रहा है...",
      },
    },
    walkinSlot: {
      title: "वॉक-इन अपॉइंटमेंट बुक करें",
      subtitleSingle:
        "अपना पसंदीदा डॉक्टर, तारीख और टाइम स्लॉट चुनें",
      subtitleGroup:
        "अपने समूह के लिए __N__ अलग-अलग टाइम स्लॉट चुनें",
      chooseDoctor: "डॉक्टर चुनें",
      doctorSubtitle:
        "उपलब्ध वॉक-इन डॉक्टरों में से चुनें",
      availableDoctors: "उपलब्ध डॉक्टर",
      groupBookingTitle: "ग्रुप बुकिंग",
      groupBookingDesc:
        "अपने समूह के लिए __N__ अलग-अलग टाइम स्लॉट चुनें।",
      selectDate: "तारीख चुनें",
      selectDateSubtitle:
        "अपना पसंदीदा अपॉइंटमेंट दिन चुनें",
      chooseTimeSlots: "टाइम स्लॉट चुनें",
      availableSlotsFor: "__DATE__ के लिए उपलब्ध स्लॉट",
      loadingSlotsTitle:
        "उपलब्ध स्लॉट लोड हो रहे हैं...",
      loadingSlotsSubtitle: "कृपया प्रतीक्षा करें",
      noSlotsTitle: "कोई स्लॉट उपलब्ध नहीं",
      noSlotsSubtitle:
        "कृपया दूसरी तारीख चुनें",
      bookingErrorTitle: "बुकिंग त्रुटि",
      bookingButtonSingle: "कन्फर्म करें और आगे बढ़ें",
      bookingButtonGroup: "__N__ स्लॉट बुक करें",
      clearSelection: "क्लियर करें",
      selectedLabel: "चयनित (__SEL__/__TOTAL__)",
      summaryTitle: "बुकिंग सारांश",
      summaryDoctor: "डॉक्टर",
      summaryClinic: "क्लिनिक",
      summaryDate: "तारीख",
      summarySelectedTimes: "चयनित समय",
      summaryGroupSize: "समूह आकार",
      summaryGroupSuffix: "व्यक्ति",
      assistanceTitle: "सहायता चाहिए?",
      assistanceDesc:
        "सहायता के लिए रिसेप्शन डेस्क पर स्टाफ उपलब्ध है",
      assistanceButton: "सहायता लें",
      errors: {
        needNSlotsTitle: "कृपया __N__ स्लॉट चुनें",
        needNSlotsDesc: "अभी चयनित: __CURR__",
        slotUnavailableTitle: "स्लॉट उपलब्ध नहीं",
      },
      successTitle: "अपॉइंटमेंट(स) बुक हो गए",
    },
    reason: {
      title: "आज आप यहाँ किसलिए आए हैं?",
      subtitle:
        "कृपया विज़िट का कारण चुनें, ताकि हम आपको बेहतर सेवा दे सकें",
      otherDetailsTitle: "अन्य / अतिरिक्त विवरण",
      otherDetailsPlaceholder:
        "कृपया अपने लक्षण या समस्या को अपने शब्दों में लिखें...",
      voiceRecordingStartedTitle: "रिकॉर्डिंग शुरू हुई",
      voiceRecordingStartedDesc:
        "कृपया अपने लक्षण अपनी भाषा में बोलें।",
      voiceRecordingStoppedTitle: "रिकॉर्डिंग बंद हुई",
      voiceRecordingStoppedDesc:
        "आवाज़ को टेक्स्ट में बदल दिया गया है।",
      voiceStatusIdle:
        "माइक पर टैप करें और अपनी आवाज़ को ऑटो-ट्रांसक्राइब करें",
      voiceStatusRecording:
        "रिकॉर्डिंग… रोकने के लिए माइक पर टैप करें",
      voiceStatusProcessing:
        "रिकॉर्डिंग… (प्रोसेस हो रही है)",
      reasonRequiredTitle: "कारण आवश्यक",
      reasonRequiredDesc:
        "कृपया कम से कम एक कारण चुनें या अपने लक्षण लिखें।",
      visitReasonRecordedTitle:
        "विज़िट का कारण सेव हो गया",
      visitReasonRecordedDesc:
        "चेक-इन प्रक्रिया की ओर बढ़ रहे हैं।",
      selectedReasonsTitle: "चुने हुए कारण:",
      uploadDocsTitle: "मेडिकल दस्तावेज़ अपलोड करें",
      uploadDocsSubtitle:
        "डॉक्टर की मदद के लिए पुराने रिपोर्ट साझा करें",
      uploadDocsButton: "दस्तावेज़ अपलोड करें",
      continueButton: "चेक-इन के लिए आगे बढ़ें",
      privacyNote:
        "यह जानकारी हमारे मेडिकल स्टाफ को आपकी विज़िट के लिए तैयार होने में मदद करती है। सभी जानकारी गोपनीय रखी जाती है।",
      options: {
        generalCheckup: "सामान्य जांच",
        feverCold: "बुखार / जुकाम",
        headache: "सिरदर्द",
        backPain: "पीठ दर्द",
        jointPain: "जोड़ों में दर्द",
        eyeProblem: "आँखों की समस्या",
        skinIssue: "त्वचा की समस्या",
        stomachPain: "पेट दर्द",
        diabetes: "डायबिटीज़ जांच",
        bloodPressure: "ब्लड प्रेशर",
        pregnancy: "गर्भावस्था संबंधित",
        followUp: "फॉलो-अप विज़िट",
      },
    },
    payment: {
      title: "भुगतान सारांश",
      subtitleWalkin:
        "कृपया सेवाएँ चुनें और भुगतान पूरा करें",
      subtitleLab:
        "कृपया अपनी लैब फीस देखें और भुगतान करें",
      subtitlePharmacy:
        "कृपया अपनी फार्मेसी राशि देखें और भुगतान करें",
      subtitleIdentify:
        "कृपया अपनी फीस देखें और भुगतान पूरा करें",
      billDetails: "बिल विवरण",
      registrationFee: "रजिस्ट्रेशन शुल्क",
      subtotal: "उप-योग",
      gst: "GST (10%)",
      totalAmount: "कुल राशि",
      walkinServicesNote:
        "वॉक-इन मरीजों के लिए रजिस्ट्रेशन शुल्क स्वतः जोड़ा जाता है।",
      chooseHowToPay: "आप कैसे भुगतान करना चाहते हैं?",
      processingTitle: "भुगतान प्रोसेस हो रहा है...",
      processingSubtitle:
        "कृपया प्रतीक्षा करें, आपका भुगतान चल रहा है।",
      payAtReceptionTitle: "रिसेप्शन पर नकद भुगतान",
      payAtReceptionDesc:
        "फ्रंट डेस्क पर नकद भुगतान करें और अपना टोकन प्राप्त करें",
      alreadyPaidTitle: "पहले ही भुगतान कर दिया?",
      alreadyPaidDesc:
        "यदि आपने फ्रंट डेस्क पर भुगतान कर दिया है तो भुगतान स्किप करें",
      skipPaymentButton: "भुगतान स्किप करें",
      successTitle: "भुगतान सफल!",
      successSubtitle:
        "आपका भुगतान सफलतापूर्वक पूरा हो गया है।",
      amountPaid: "भुगतान की गई राशि",
      transactionId: "ट्रांज़ैक्शन आईडी",
      paymentMethod: "भुगतान विधि",
      dateTime: "तारीख और समय",
      printReceipt: "रसीद प्रिंट करें",
      continue: "आगे बढ़ें",
      autoTokenHint:
        "लगभग 1–2 सेकंड में टोकन जेनरेशन पर जा रहे हैं...",
      failedTitle: "भुगतान असफल",
      failedSubtitle:
        "हम आपका भुगतान प्रोसेस नहीं कर सके। कृपया दोबारा प्रयास करें या फ्रंट डेस्क से संपर्क करें।",
      tryAgain: "फिर कोशिश करें",
      getHelp: "सहायता लें",
      errors: {
        paymentErrorTitle: "भुगतान त्रुटि",
        paymentErrorDesc: "भुगतान शुरू नहीं हो सका",
      },
    },
    token: {
      title: "टोकन जारी",
      fullTitle: "टोकन सफलतापूर्वक जारी!",
      subtitle:
        "आपका चेक-इन पूरा हो गया है। कृपया अपनी बारी का इंतज़ार करें।",
      generating: "आपका टोकन बनाया जा रहा है…",
      yourTokenNumber: "आपका टोकन नंबर",
      queuePosition: "क्यू में क्रम",
      estimatedWaitTime: "अनुमानित प्रतीक्षा समय",
      estimateConfidence: "अनुमान की विश्वसनीयता",
      tokenActions: "टोकन से जुड़े विकल्प",
      printToken: "टोकन प्रिंट करें",
      showQrForStaff: "स्टाफ के लिए QR दिखाएँ",
      viewLiveQueueStatus: "लाइव क्यू स्थिति देखें",
      staffScanQr: "स्टाफ यहाँ स्कैन करें",
      whatNextTitle: "आगे क्या होगा",
      nextSteps: {
        "0": "प्रतीक्षा क्षेत्र में आराम से बैठें।",
        "1": "अपना टोकन नंबर पास में रखें।",
        "2": "जब आपका टोकन नंबर पुकारा जाए तो ध्यान दें।",
        "3": "कॉल होने पर निर्धारित कमरे में जाएँ।",
      },
    },
    queue: {
      title: "लाइव क्यू स्थिति",
      subtitle: "आपके टोकन के लिए रियल-टाइम अपडेट",
      yourPosition: "आपकी स्थिति",
      tokenNumber: "टोकन नंबर",
      estimatedTime: "अनुमानित समय",
      nowNextTitle: "अब / अगला",
      autoRefreshing: "ऑटो-रिफ्रेश हो रहा है",
      viewMyToken: "मेरा टोकन देखें",
      labServices: "लैब सेवाएँ",
      needHelp: "सहायता चाहिए?",
    },
    pharmacy: {
      title: "फार्मेसी सेवाएँ",
      subtitle:
        "अपनी प्रिस्क्रिप्शन के लिए भुगतान करें और पिक-अप टोकन प्राप्त करें",
      modeQuestion: "आज आप यहाँ कैसे आए हैं?",
      portalTitle:
        "मैंने ऐप / पोर्टल पर दवाइयाँ बुक की हैं",
      portalDesc:
        "हम आपका मोबाइल सत्यापित करेंगे, फार्मेसी बिल निकालेंगे और भुगतान करने देंगे।",
      walkinTitle: "मैं दवाइयाँ खरीदने आया हूँ",
      walkinDesc:
        "हम OTP से आपका मोबाइल नंबर सत्यापित करेंगे और एक त्वरित बिल बनाएँगे।",
      verifyMobileTitle: "मोबाइल सत्यापित करें और बिल प्राप्त करें",
      mobileNumber: "मोबाइल नंबर",
      sendOtp: "OTP भेजें",
      resendOtp: "OTP दोबारा भेजें",
      enterOtpLabel: "मोबाइल पर भेजा गया OTP दर्ज करें",
      verifyFetchBill: "सत्यापित करें और बिल प्राप्त करें",
      prescriptionDetails: "प्रिस्क्रिप्शन विवरण",
      billSummary: "बिल सारांश",
      medicinesSummary: "दवाइयाँ (__COUNT__ आइटम)",
      totalAmount: "कुल राशि",
      payNowViaKiosk: "कियोस्क से अभी भुगतान करें",
      actionsTitle: "विकल्प",
      pickupToken: "पिक-अप टोकन",
      pickupTokenNumber: "टोकन नंबर",
      pickupTokenSourceDoctor: "डॉक्टर विज़िट",
      pickupTokenSourcePharmacy: "फार्मेसी",
      pickupTokenShowAtCounter:
        "यह टोकन फार्मेसी काउंटर पर दिखाएँ",
      infoLocation: "फार्मेसी स्थान",
      infoLocationText: "ग्राउंड फ्लोर - मुख्य बिल्डिंग",
      infoHours: "कार्य समय",
      infoHoursText: "सुबह 8:00 बजे - रात 9:00 बजे",
      infoLicensed: "लाइसेंस प्राप्त फार्मेसी",
      infoLicensedText: "प्रमाणित और गुणवत्ता सुनिश्चित",
      helpFindingPrescription:
        "प्रिस्क्रिप्शन खोजने में मदद चाहिए?",
      helpFindingPrescriptionDesc:
        "कृपया फार्मेसी स्टाफ या फ्रंट डेस्क से संपर्क करें।",
    },
    lab: {
      title: "प्रयोगशाला सेवाएँ",
      subtitle:
        "अपने टेस्ट देखें, यदि ज़रूरत हो तो भुगतान करें और लैब टोकन जनरेट करें।",
      howVisitingTitle: "आज आप यहाँ कैसे आए हैं?",
      portalCardTitle:
        "मैंने ऑनलाइन / ऐप से टेस्ट बुक किए हैं",
      portalCardDesc:
        "हम आपके मोबाइल और OTP से लैब बुकिंग (और डॉक्टर अपॉइंटमेंट, यदि हो) निकालेंगे।",
      walkinCardTitle: "मैं वॉक-इन मरीज हूँ",
      walkinCardDesc:
        "हम OTP से आपका मोबाइल सत्यापित करके, आपको रजिस्टर करेंगे और उसी टोकन पर टेस्ट बुक करेंगे।",
      mobileNumber: "मोबाइल नंबर",
      patientName: "मरीज का नाम",
      yearOfBirth: "जन्म वर्ष",
      sendOtp: "OTP भेजें",
      resendOtp: "OTP दोबारा भेजें",
      enterOtp: "मोबाइल पर भेजा गया OTP दर्ज करें",
      verifyFetchBooking:
        "सत्यापित करें और बुकिंग प्राप्त करें",
      verifyOtpContinue:
        "OTP सत्यापित करें और आगे बढ़ें",
      doctorOrderedTitle:
        "डॉक्टर द्वारा सुझाए गए टेस्ट",
      doctorOrderedSubtitle:
        "ये टेस्ट आपके डॉक्टर द्वारा प्रिस्क्राइब किए गए हैं (यदि कोई हो)",
      noDoctorTests:
        "डॉक्टर द्वारा कोई टेस्ट नहीं सुझाया गया",
      additionalTestsTitle:
        "अतिरिक्त टेस्ट (वैकल्पिक)",
      additionalTestsSubtitle:
        "अपने पैकेज में अतिरिक्त टेस्ट जोड़ें",
      billSummaryTitle: "बिल सारांश",
      orderedTestsLabel: "ऑर्डर किए गए टेस्ट",
      additionalTestsLabel: "अतिरिक्त टेस्ट",
      totalLabel: "कुल",
      actionsTitle: "विकल्प",
      generateLabToken: "लैब टोकन जनरेट करें",
      useExistingToken: "टोकन __TOKEN__ का उपयोग करें",
      payNow: "अभी भुगतान करें – ₹__AMOUNT__",
      paymentCompleted: "भुगतान पूरा हो चुका है",
      printSampleLabels: "सैंपल लेबल प्रिंट करें",
      instructionsTitle: "लैब निर्देश",
      instructionsList: {
        "0": "कुछ टेस्ट के लिए खाली पेट आना आवश्यक है।",
        "1": "सत्यापन के लिए वैध आईडी साथ लाएँ।",
        "2": "रिपोर्ट लगभग 10 घंटे में उपलब्ध होगी।",
        "3": "रिपोर्ट लैब काउंटर या पेशेंट पोर्टल से प्राप्त करें।",
      },
      services: {
        title: "सैंपल कलेक्शन",
        location: "ग्राउंड फ्लोर – लैब विंग",
        hoursTitle: "कलेक्शन समय",
        hoursText: "सुबह 7:00 बजे – 11:00 बजे",
        reportTitle: "रिपोर्ट डिलीवरी",
        reportText: "लगभग 10 घंटे के अंदर",
      },
    },
    diagnostics: {
      title: "डायग्नॉस्टिक्स",
      mainTitle: "डायग्नॉस्टिक इमेजिंग सेवाएँ",
      mainSubtitle:
        "जिस प्रकार की डायग्नॉस्टिक इमेजिंग सेवा आपको चाहिए, उसे चुनें। हमारी उन्नत मशीनें और एक्सपर्ट टेक्नीशियन सटीक परिणाम सुनिश्चित करते हैं।",
      mriTitle: "MRI स्कैन",
      mriDesc: "मैग्नेटिक रेज़ोनेंस इमेजिंग",
      ctTitle: "CT स्कैन",
      ctDesc: "कम्प्यूटेड टोमोग्राफी",
      xrayTitle: "एक्स-रे",
      xrayDesc: "रेडियोग्राफी इमेजिंग",
      usgTitle: "USG",
      usgDesc: "अल्ट्रासाउंड इमेजिंग",
      whatToExpectTitle: "क्या उम्मीद करें:",
      whatToExpectDesc:
        "सेवा चुनने के बाद, आप अपनी पहचान सत्यापित करेंगे, टाइम स्लॉट चुनेंगे और भुगतान पूरा करेंगे।",
      whatToExpectNote:
        "कृपया अपने डॉक्टर की रेफरल पर्ची या प्रिस्क्रिप्शन अपने साथ रखें।",
    },
    diagnosticsBooking: {
      titlePrefix: "बुकिंग",
      subtitle:
        "कृपया अपना विवरण भरें, OTP से मोबाइल सत्यापित करें और सुविधाजनक समय चुनें।",
      patientDetailsTitle: "मरीज का विवरण",
      fullName: "पूरा नाम",
      mobileNumber: "मोबाइल नंबर",
      yearOfBirth: "जन्म वर्ष",
      otpSendButton: "OTP भेजें",
      otpVerifyButton: "OTP सत्यापित करें और आगे बढ़ें",
      otpResendButton: "OTP दोबारा भेजें",
      otpEnterLabel: "मोबाइल पर भेजा गया OTP दर्ज करें",
      scheduleTitle: "शेड्यूल",
      preferredDate: "पसंदीदा तारीख",
      timeSlot: "टाइम स्लॉट",
      serviceLabel: "सेवा",
      amountLabel: "राशि",
      proceedToPayment: "भुगतान के लिए आगे बढ़ें",
    },
    frontdesk: {
      title: "फ्रंट डेस्क कैश",
      queueTitle: "नकद भुगतान कतार",
      queueSubtitle:
        "जिन मरीजों ने “रिसेप्शन पर भुगतान” चुना है, वे यहाँ दिखते हैं। नकद लें, भुगतान पूरा करें और टोकन जारी करें।",
      noPending: "कोई लंबित नकद भुगतान नहीं।",
      loading: "लोड हो रहा है...",
      lastIssuedToken: "अंतिम जारी किया गया टोकन",
      collectIssue: "नकद लें और टोकन जारी करें",
    },
    lab_services_title: "प्रयोगशाला सेवाएँ",
  },
};

// Simple translation hook
export const useTranslation = (language: Language = "en") => {
  const t = (key: string, defaultText?: string): string => {
    const keys = key.split(".");
    let value: any = translations[language];

    for (const k of keys) {
      value = value?.[k];
    }

    if (typeof value === "string") {
      return value;
    }
    return defaultText || key;
  };

  return { t };
};

// Language persistence
export const getStoredLanguage = (): Language => {
  const lang = localStorage.getItem("medmitra-language");
  if (lang === "en" || lang === "hi") {
    return lang;
  }
  return "en"; // default
};

export const setStoredLanguage = (language: Language): void => {
  localStorage.setItem("medmitra-language", language);
};
