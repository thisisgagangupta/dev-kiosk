// import { useNavigate } from "react-router-dom";
// import { Button } from "@/components/ui/button";
// import { Card } from "@/components/ui/card";
// import { Scan, ChevronRight, Activity, Brain, Bone, Heart } from "lucide-react";
// import KioskLayout from "@/components/KioskLayout";
// import { getStoredLanguage, useTranslation } from "@/lib/i18n";

// export default function DiagnosticsPage() {
//   const navigate = useNavigate();
//   const { t } = useTranslation(getStoredLanguage());

//   const diagnosticOptions = [
//     {
//       icon: Brain,
//       title: "MRI Scan",
//       description: "Magnetic Resonance Imaging",
//       diagnosticType: "MRI" as const,
//     },
//     {
//       icon: Scan,
//       title: "CT Scan",
//       description: "Computed Tomography",
//       diagnosticType: "CT" as const,
//     },
//     {
//       icon: Bone,
//       title: "X-Ray",
//       description: "Radiography imaging",
//       diagnosticType: "X-Ray" as const,
//     },
//     {
//       icon: Heart,
//       title: "USG",
//       description: "Ultrasound imaging",
//       diagnosticType: "USG" as const,
//     },
//   ];

//   const handleSelect = (type: string) => {
//     sessionStorage.setItem("kioskDiagnosticType", type);
//     // we’ll implement this new page next
//     sessionStorage.setItem("kioskFlow", "lab"); // reuse lab payment flow
//     navigate("/diagnostics-booking");
//   };

//   return (
//     <KioskLayout 
//       title="Diagnostics" 
//       showBack={true}
//       showLanguage={true}
//       onBack={() => navigate('/start')}
//     >
//       <div className="max-w-5xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-12">
//           <div className="bg-primary/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
//             <Activity className="h-12 w-12 text-primary" />
//           </div>
//           <h1 className="text-4xl font-bold text-primary mb-4">
//             Diagnostic Imaging Services
//           </h1>
//           <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
//             Select the type of diagnostic imaging service you need. Our advanced equipment and expert technicians ensure accurate results.
//           </p>
//         </div>

//         {/* Diagnostic Options Grid */}
//         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
//           {diagnosticOptions.map((option, index) => (
//             <Card 
//               key={index}
//               className="p-8 cursor-pointer hover:shadow-kiosk transition-all duration-300 transform hover:scale-105 group"
//               onClick={() => handleSelect(option.diagnosticType)}
//             >
//               <div className="text-center">
//                 <div className="bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/20 transition-colors">
//                   <option.icon className="h-10 w-10 text-primary" />
//                 </div>
                
//                 <h3 className="text-2xl font-semibold text-foreground mb-3">
//                   {option.title}
//                 </h3>
                
//                 <p className="text-muted-foreground mb-6">
//                   {option.description}
//                 </p>
                
//                 <div className="flex items-center justify-center text-primary group-hover:text-accent transition-colors">
//                   <span className="font-medium mr-2">Continue</span>
//                   <ChevronRight className="h-5 w-5" />
//                 </div>
//               </div>
//             </Card>
//           ))}
//         </div>

//         {/* Information Card */}
//         <Card className="p-6 bg-muted/30 border-0">
//           <div className="text-center">
//             <p className="text-sm text-muted-foreground mb-3">
//               <strong>What to expect:</strong> After selecting your service, you'll verify your identity, pick a time slot, and complete payment.
//             </p>
//             <p className="text-xs text-muted-foreground">
//               Please ensure you have any referral documents or prescription from your doctor ready.
//             </p>
//           </div>
//         </Card>
//       </div>
//     </KioskLayout>
//   );
// }









import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Scan,
  ChevronRight,
  Activity,
  Brain,
  Bone,
  Heart,
} from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { getStoredLanguage, useTranslation } from "@/lib/i18n";

export default function DiagnosticsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());

  const diagnosticOptions = [
    {
      icon: Brain,
      title: t("diagnostics.mriTitle", "MRI Scan"),
      description: t(
        "diagnostics.mriDesc",
        "Magnetic Resonance Imaging"
      ),
      diagnosticType: "MRI" as const,
    },
    {
      icon: Scan,
      title: t("diagnostics.ctTitle", "CT Scan"),
      description: t(
        "diagnostics.ctDesc",
        "Computed Tomography"
      ),
      diagnosticType: "CT" as const,
    },
    {
      icon: Bone,
      title: t("diagnostics.xrayTitle", "X-Ray"),
      description: t(
        "diagnostics.xrayDesc",
        "Radiography imaging"
      ),
      diagnosticType: "X-Ray" as const,
    },
    {
      icon: Heart,
      title: t("diagnostics.usgTitle", "USG"),
      description: t(
        "diagnostics.usgDesc",
        "Ultrasound imaging"
      ),
      diagnosticType: "USG" as const,
    },
  ];

  const handleSelect = (type: string) => {
    sessionStorage.setItem("kioskDiagnosticType", type);
    // reuse lab payment flow
    sessionStorage.setItem("kioskFlow", "lab");
    navigate("/diagnostics-booking");
  };

  return (
    <KioskLayout
      title={t("diagnostics.title", "Diagnostics")}
      showBack={true}
      showLanguage={true}
      onBack={() => navigate("/start")}
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="bg-primary/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
            <Activity className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-primary mb-4">
            {t(
              "diagnostics.mainTitle",
              "Diagnostic Imaging Services"
            )}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t(
              "diagnostics.mainSubtitle",
              "Select the type of diagnostic imaging service you need. Our advanced equipment and expert technicians ensure accurate results."
            )}
          </p>
        </div>

        {/* Diagnostic Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {diagnosticOptions.map((option, index) => (
            <Card
              key={index}
              className="p-8 cursor-pointer hover:shadow-kiosk transition-all duration-300 transform hover:scale-105 group"
              onClick={() => handleSelect(option.diagnosticType)}
            >
              <div className="text-center">
                <div className="bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/20 transition-colors">
                  <option.icon className="h-10 w-10 text-primary" />
                </div>

                <h3 className="text-2xl font-semibold text-foreground mb-3">
                  {option.title}
                </h3>

                <p className="text-muted-foreground mb-6">
                  {option.description}
                </p>

                <div className="flex items-center justify-center text-primary group-hover:text-accent transition-colors">
                  <span className="font-medium mr-2">
                    {t("welcome.continue", "Continue")}
                  </span>
                  <ChevronRight className="h-5 w-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Information Card */}
        <Card className="p-6 bg-muted/30 border-0">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-3">
              <strong>
                {t(
                  "diagnostics.whatToExpectTitle",
                  "What to expect:"
                )}
              </strong>{" "}
              {t(
                "diagnostics.whatToExpectDesc",
                "After selecting your service, you'll verify your identity, pick a time slot, and complete payment."
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "diagnostics.whatToExpectNote",
                "Please ensure you have any referral documents or prescription from your doctor ready."
              )}
            </p>
          </div>
        </Card>
      </div>
    </KioskLayout>
  );
}
