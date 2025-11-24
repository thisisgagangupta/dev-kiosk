export interface MockAppointment {
  id: string;
  patientFirstName: string;
  doctorName: string;
  time: string;
  status: "Paid" | "Unpaid";
  amount?: number;
}

export interface MockPatient {
  id: string;
  name: string;
  mobile: string;
  yearOfBirth: number;
  gender?: "Male" | "Female" | "Other";
  hasCaregiver: boolean;
}

export interface MockToken {
  id: string;
  number: string;
  queuePosition: number;
  estimatedTime: string;
  confidence: number; // 0-100%
}

export interface MockQueueItem {
  tokenNumber: string;
  estimatedTime: string;
  status: "Now" | "Next" | "Waiting";
}

export interface MockLabTest {
  id: string;
  name: string;
  price: number;
  ordered: boolean;
}

/**
 * Extra types so the kiosk LabPage can talk to the mock lab backend
 * without breaking any existing functionality.
 */
export interface KioskLabBookingSummary {
  bookingId: string;
  patientName?: string;
  phone: string;
  orderedTests: MockLabTest[];
  additionalTests: MockLabTest[];
  /**
   * true  → payment already done (portal / desk)
   * false → payment pending
   */
  paid: boolean;
  /**
   * true  → there is also a doctor visit tied to this booking (same token)
   */
  hasDoctorVisit: boolean;
  /**
   * If a visit token already exists (e.g., from doctor check-in),
   * kiosk should reuse it instead of generating a new one.
   */
  existingToken?: string;
}

export interface KioskLabTokenRequest {
  bookingId: string | null;
  phone: string;
  hasDoctorVisit?: boolean;
  /**
   * If provided, backend may reuse this token instead of creating a new one
   * (doctor + lab on same token).
   */
  reuseToken?: string;
  tests: MockLabTest[];
}

export interface KioskLabTokenResponse {
  token: string;
}

// Mock Authentication Service
export class MockAuthService {
  static async sendOTP(
    phone: string
  ): Promise<{ success: boolean; message: string }> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (phone.length < 10) {
      return { success: false, message: "Invalid phone number" };
    }

    return { success: true, message: "OTP sent successfully" };
  }

  static async verifyOTP(
    phone: string,
    code: string
  ): Promise<{ success: boolean; appointment?: MockAppointment }> {
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (code === "1234" || code === "0000") {
      return {
        success: true,
        appointment: {
          id: "APT001",
          patientFirstName: "Priya",
          doctorName: "Dr. Sharma",
          time: "2:30 PM",
          status: "Paid",
        },
      };
    }

    if (code === "5678") {
      return {
        success: true,
        appointment: {
          id: "APT002",
          patientFirstName: "Rahul",
          doctorName: "Dr. Patel",
          time: "3:00 PM",
          status: "Unpaid",
          amount: 500,
        },
      };
    }

    return { success: false };
  }
}

// Mock Appointment Service
export class MockAppointmentService {
  static async lookupByQR(
    qrData: string
  ): Promise<{ success: boolean; appointment?: MockAppointment }> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (qrData.includes("APT001")) {
      return {
        success: true,
        appointment: {
          id: "APT001",
          patientFirstName: "Priya",
          doctorName: "Dr. Sharma",
          time: "2:30 PM",
          status: "Paid",
        },
      };
    }

    return { success: false };
  }

  static async lookupByPhone(
    phone: string
  ): Promise<{ success: boolean; appointment?: MockAppointment }> {
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Mock lookup based on phone
    if (phone.endsWith("1234")) {
      return {
        success: true,
        appointment: {
          id: "APT003",
          patientFirstName: "Anjali",
          doctorName: "Dr. Gupta",
          time: "4:15 PM",
          status: "Unpaid",
          amount: 750,
        },
      };
    }

    return { success: false };
  }
}

// Mock Billing Service
export class MockBillingService {
  static async pay(
    invoiceId: string,
    amount: number
  ): Promise<{ success: boolean; transactionId?: string; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Simulate 90% success rate
    if (Math.random() > 0.1) {
      return {
        success: true,
        transactionId: `TXN${Date.now()}`,
        message: "Payment successful",
      };
    }

    return {
      success: false,
      message: "Payment failed. Please try again or contact support.",
    };
  }
}

// Mock Queue Service
export class MockQueueService {
  static subscribe(
    tokenId: string,
    callback: (position: number, eta: string) => void
  ): () => void {
    let position = Math.floor(Math.random() * 5) + 1;

    const interval = setInterval(() => {
      if (position > 0) {
        position =
          Math.max(0, position - (Math.random() < 0.3 ? 1 : 0));
        const eta =
          position === 0 ? "Now!" : `${position * 5}-${(position + 1) * 5} min`;
        callback(position, eta);
      }
    }, 3000);

    return () => clearInterval(interval);
  }

  static async getCurrentQueue(): Promise<MockQueueItem[]> {
    return [
      { tokenNumber: "A23", estimatedTime: "Now", status: "Now" },
      { tokenNumber: "A24", estimatedTime: "5 min", status: "Next" },
      { tokenNumber: "A25", estimatedTime: "10-15 min", status: "Waiting" },
      { tokenNumber: "A26", estimatedTime: "15-20 min", status: "Waiting" },
      { tokenNumber: "A27", estimatedTime: "20-25 min", status: "Waiting" },
    ];
  }
}

// Mock Print Service
export class MockPrintService {
  static async printToken(
    token: MockToken
  ): Promise<{ success: boolean; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log("🖨️ Printing Token:", token);
    return { success: true, message: "Token printed successfully" };
  }

  static async printReceipt(
    transactionId: string,
    amount: number
  ): Promise<{ success: boolean; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 1200));

    console.log("🖨️ Printing Receipt:", { transactionId, amount });
    return { success: true, message: "Receipt printed successfully" };
  }
}

// Mock Lab Service
export class MockLabService {
  /**
   * Original helper – kept exactly as-is for backwards compatibility.
   */
  static async getOrderedTests(appointmentId: string): Promise<MockLabTest[]> {
    return [
      {
        id: "LAB001",
        name: "Complete Blood Count (CBC)",
        price: 300,
        ordered: true,
      },
      {
        id: "LAB002",
        name: "Lipid Profile",
        price: 450,
        ordered: true,
      },
      {
        id: "LAB003",
        name: "Thyroid Function Test",
        price: 600,
        ordered: false,
      },
    ];
  }

  /**
   * NEW: simulate lookup of an online / portal lab booking by phone.
   * LabPage uses this to pre-fill tests and payment status.
   */
  static async lookupExistingLabBookingByPhone(
    phone: string
  ): Promise<KioskLabBookingSummary | null> {
    await new Promise((resolve) => setTimeout(resolve, 700));

    const clean = phone.replace(/\D/g, "");
    if (!clean) return null;

    // Very simple mock behaviour:
    //  - numbers ending with 0–4 → paid booking
    //  - numbers ending with 5–9 → unpaid booking
    const lastDigit = parseInt(clean.slice(-1), 10);
    const isPaid = !isNaN(lastDigit) ? lastDigit < 5 : true;

    const orderedTests: MockLabTest[] = [
      {
        id: "LAB001",
        name: "Complete Blood Count (CBC)",
        price: 300,
        ordered: true,
      },
      {
        id: "LAB002",
        name: "Lipid Profile",
        price: 450,
        ordered: true,
      },
    ];

    const additionalTests: MockLabTest[] = [
      {
        id: "LAB003",
        name: "Thyroid Function Test (T3, T4, TSH)",
        price: 600,
        ordered: false,
      },
    ];

    return {
      bookingId: "MOCK-LAB-" + clean.slice(-4),
      patientName: "Portal Patient",
      phone,
      orderedTests,
      additionalTests,
      paid: isPaid,
      hasDoctorVisit: true,
      existingToken: undefined,
    };
  }

  /**
   * NEW: simulate lab token generation for kiosk.
   * Reuses an existing token if provided, otherwise generates a LAB### token.
   */
  static async generateLabToken(
    request: KioskLabTokenRequest
  ): Promise<KioskLabTokenResponse> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (request.reuseToken) {
      return { token: request.reuseToken };
    }

    const suffix = Date.now().toString().slice(-3);
    const token = `LAB${suffix}`;
    console.log("🔐 Mock generateLabToken:", {
      request,
      token,
    });
    return { token };
  }
}

// Generate mock token for queueing
export const generateMockToken = (): MockToken => ({
  id: `TOKEN${Date.now()}`,
  number: `A${Math.floor(Math.random() * 900) + 100}`,
  queuePosition: Math.floor(Math.random() * 8) + 1,
  estimatedTime: `${Math.floor(Math.random() * 20) + 5}-${
    Math.floor(Math.random() * 20) + 15
  } min`,
  confidence: Math.floor(Math.random() * 30) + 70,
});

// -------------------------
// Pharmacy mock service
// -------------------------

export interface PharmacyBillItem {
  id: string;
  name: string;
  dosage: string;
  quantity: number;
  price: number;        // per-unit or per-line as you prefer
  prescribed: boolean;
}

export type PharmacyBillStatus = "pending" | "paid";

export interface PharmacyBillSummary {
  billNumber: string;
  patientName: string;
  phone: string;
  items: PharmacyBillItem[];
  total: number;
  status: PharmacyBillStatus;
  /**
   * true  → there is also a doctor visit tied to this bill
   * (doctor token can be reused for pickup).
   */
  hasDoctorVisit: boolean;
  /**
   * If a visit token already exists (e.g. from doctor check-in),
   * kiosk should reuse it instead of creating a new pharmacy-only token.
   */
  existingToken?: string;
}

/**
 * MockPharmacyService
 *
 * For now this is entirely in-memory / deterministic.
 * Later you can replace these methods with real API calls
 * (e.g. to medmitra_medication_orders / POS).
 */
export class MockPharmacyService {
  /**
   * Lookup a pharmacy bill either by explicit bill number
   * or by mobile phone (E.164 or raw digits).
   *
   * Behaviour:
   *  - If query looks like a bill number (starts with "PH"), return a fixed mock bill.
   *  - Otherwise interpret as phone; last digit decides paid vs pending.
   */
  static async lookupBill(
    query: string
  ): Promise<PharmacyBillSummary | null> {
    await new Promise((resolve) => setTimeout(resolve, 700));

    const trimmed = (query || "").trim();
    if (!trimmed) return null;

    // Normalize digits for phone-style lookups
    const digits = trimmed.replace(/\D/g, "");
    const looksLikeBill = /^PH\d{6,}$/.test(trimmed.toUpperCase());

    const baseItems: PharmacyBillItem[] = [
      { id: "MED001", name: "Paracetamol", dosage: "500mg", quantity: 10, price: 25,  prescribed: true },
      { id: "MED002", name: "Amoxicillin", dosage: "250mg", quantity: 15, price: 180, prescribed: true },
      { id: "MED003", name: "Vitamin D3", dosage: "60000 IU", quantity: 4, price: 120, prescribed: true },
      { id: "MED004", name: "Omeprazole", dosage: "20mg", quantity: 30, price: 95,  prescribed: true },
    ];
    const total = baseItems.reduce((sum, i) => sum + i.price, 0);

    // Very simple rules just for demo:
    // - if looks like bill → paid
    // - else, use last digit of phone: 0–4 => paid, 5–9 => pending
    let status: PharmacyBillStatus = "paid";
    let hasDoctorVisit = true;

    if (!looksLikeBill && digits) {
      const last = parseInt(digits.slice(-1), 10);
      if (!isNaN(last) && last >= 5) status = "pending";
    }

    const billNumber = looksLikeBill
      ? trimmed.toUpperCase()
      : `PH${(digits || "000000").slice(-6)}`;

    const summary: PharmacyBillSummary = {
      billNumber,
      patientName: "Portal Pharmacy Patient",
      phone: digits || trimmed,
      items: baseItems,
      total,
      status,
      hasDoctorVisit,
      existingToken: undefined, // kiosk can inject doctor token if it exists locally
    };

    return summary;
  }
}
