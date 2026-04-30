import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background avec dégradés flous pour le look moderne */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">LOGIFA</h1>
          <p className="text-slate-500 font-medium italic text-sm text-balance">
            La facturation simplifiée pour les indépendants.
          </p>
        </div>

        <SignIn 
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-white rounded-[3rem] shadow-2xl border-none p-4",
              headerTitle: "text-2xl font-black uppercase tracking-tight text-slate-900",
              headerSubtitle: "text-slate-500 font-medium",
              formButtonPrimary: "bg-slate-900 hover:bg-blue-600 rounded-2xl py-4 font-black transition-all border-none text-xs uppercase tracking-widest mt-2",
              formFieldInput: "bg-slate-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium",
              footerActionLink: "text-blue-600 hover:text-blue-700 font-bold text-xs",
              formFieldLabel: "text-[10px] font-black uppercase text-slate-400 ml-2 mb-1",
              dividerLine: "bg-slate-100",
              dividerText: "text-slate-400 text-[10px] font-black uppercase",
              socialButtonsBlockButton: "rounded-2xl border-slate-100 hover:bg-slate-50 transition-all",
              socialButtonsBlockButtonText: "font-bold text-slate-600"
            }
          }}
        />
      </div>
    </div>
  );
}