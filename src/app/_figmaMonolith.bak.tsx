import { useState, useRef, useEffect } from "react";
import { useApp } from "../store/AppContext";
import { InstructorCreateScreen as WiredInstructorCreate } from "../screens/InstructorCreateScreen";
import { StudentConceptScreen as WiredStudentConcept } from "../screens/StudentConceptScreen";
import {
  LayoutDashboard, BookOpen, Target, MessageSquare, BarChart2,
  Settings, LogOut, Search, Bell, Play, Star, Check, X, Send,
  ChevronRight, ArrowRight, Zap, Lock, Brain, Flame, Trophy,
  Clock, Users, Edit2, Sparkles, Video, Music, Code2, FileText,
  HelpCircle, Upload, Link2, Mic, SlidersHorizontal, GitBranch,
  Youtube, TrendingUp, Plus, AlertCircle, RefreshCw
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Role        = "student" | "instructor";
type Screen      = "landing" | "login" | "student-onboarding" | "instructor-onboarding"
  | "student-courses" | "student-concept" | "student-reflection" | "student-mastery"
  | "instructor-home" | "instructor-create" | "instructor-dashboard";
type MasteryLevel = "not-seen" | "exposed" | "practiced" | "understood" | "mastered";
type ContentMode  = "real-world" | "conversational" | "textbook";
type CreateStep   = "sources" | "structure" | "build" | "done";

// ─── Constants ────────────────────────────────────────────────────────────────
const MASTERY: Record<MasteryLevel,{color:string;bg:string;label:string}> = {
  "not-seen":   {color:"#94A3B8",bg:"#F1F5F9",label:"Not seen"},
  "exposed":    {color:"#3B82F6",bg:"#EFF6FF",label:"Exposed"},
  "practiced":  {color:"#F59E0B",bg:"#FFFBEB",label:"Practiced"},
  "understood": {color:"#F97316",bg:"#FFF7ED",label:"Understood"},
  "mastered":   {color:"#10B981",bg:"#ECFDF5",label:"Mastered"},
};

const CONTENT_MODES: Record<ContentMode,{icon:string;label:string;color:string}> = {
  "real-world":     {icon:"Globe",     label:"Real World",    color:"#10B981"},
  "conversational": {icon:"Chat",      label:"Conversational",color:"#6366F1"},
  "textbook":       {icon:"Book",      label:"Textbook",      color:"#F59E0B"},
};

const CONCEPT_AVAIL: Record<string,{modes:ContentMode[];hasInteractive:boolean}> = {
  "neuron":            {modes:["conversational","textbook"],              hasInteractive:true},
  "synapses":          {modes:["real-world","conversational","textbook"], hasInteractive:true},
  "brain-regions":     {modes:["textbook"],                              hasInteractive:false},
  "action-potential":  {modes:["conversational","textbook"],             hasInteractive:false},
  "neurotransmitters": {modes:["textbook"],                              hasInteractive:false},
  "plasticity":        {modes:[],                                        hasInteractive:false},
};

const CONCEPTS = [
  {id:"neuron",           name:"Neuron",           mastery:"mastered"   as MasteryLevel,chapter:1},
  {id:"synapses",         name:"Synapses",         mastery:"understood" as MasteryLevel,chapter:1},
  {id:"brain-regions",    name:"Brain Regions",    mastery:"practiced"  as MasteryLevel,chapter:2},
  {id:"action-potential", name:"Action Potential", mastery:"exposed"    as MasteryLevel,chapter:2},
  {id:"neurotransmitters",name:"Neurotransmitters",mastery:"not-seen"   as MasteryLevel,chapter:3},
  {id:"plasticity",       name:"Neural Plasticity",mastery:"not-seen"   as MasteryLevel,chapter:3},
];

const MCQ_DATA = {
  question:"Which part of a neuron receives incoming signals?",
  options:["Axon terminal","Dendrite","Myelin sheath","Cell body"],
  correct:1,
  hints:[
    {level:"Nudge",      text:"Think about 'dendron' — Greek for tree."},
    {level:"Concept",    text:"These structures branch outward to maximise surface area."},
    {level:"Direction",  text:"They sit on the input side, opposite where signals leave."},
    {level:"Full hint",  text:"Dendrites receive incoming signals and convert them to electrical impulses."},
  ],
};

const MODE_CONTENT: Record<ContentMode,{heading:string;body:string[]}> = {
  "real-world":{
    heading:"Think of a synapse like a text message",
    body:[
      "Imagine texting a friend — you type, hit send, it travels and lands in their inbox. Synapses work exactly like that, except neurons use chemical messengers called **neurotransmitters** instead of Wi-Fi.",
      "The sending neuron packages its message into tiny vesicles, fires them into the **synaptic cleft**, and the receiving neuron's receptors open up to catch the signal. All in under a millisecond!",
    ],
  },
  "conversational":{
    heading:"So neurons gossip through synapses",
    body:[
      "Here's the thing — neurons can't actually touch each other. There's always a tiny gap (the synaptic cleft) between them. Kind of inconvenient, right? But they worked it out.",
      "The sender dumps chemical messengers called **neurotransmitters** into that gap. They float across and latch onto receptors on the other side. When enough attach — boom — the signal keeps going!",
    ],
  },
  "textbook":{
    heading:"Synaptic Transmission",
    body:[
      "A **synapse** is the junction between two neurons, comprising a pre-synaptic terminal, a synaptic cleft (~20 nm), and a post-synaptic membrane. Signal transmission occurs via exocytosis of neurotransmitter-filled vesicles.",
      "Neurotransmitters diffuse across the cleft and bind to receptors, producing either excitatory (EPSPs) or inhibitory (IPSPs) post-synaptic potentials. Termination occurs through enzymatic degradation or reuptake.",
    ],
  },
};

const GENERATED_MODULES = [
  {id:0,name:"What is a Neuron?",    chapter:"Ch 1: Neurons"},
  {id:1,name:"Neuron Structure",      chapter:"Ch 1: Neurons"},
  {id:2,name:"What is a Synapse?",   chapter:"Ch 2: Synapses"},
  {id:3,name:"Chemical Transmission",chapter:"Ch 2: Synapses"},
  {id:4,name:"Types of Synapses",    chapter:"Ch 2: Synapses"},
  {id:5,name:"Brain Lobes Overview", chapter:"Ch 3: Brain Regions"},
];

const BLOCK_TYPES = [
  {type:"Video Lesson",  icon:Video,    color:"bg-indigo-500"},
  {type:"Audio Insight", icon:Music,    color:"bg-pink-500"},
  {type:"Code Sandbox",  icon:Code2,    color:"bg-emerald-500"},
  {type:"Text Block",    icon:FileText, color:"bg-amber-500"},
  {type:"MCQ Quiz",      icon:HelpCircle,color:"bg-violet-500"},
  {type:"Reflection",    icon:Star,     color:"bg-rose-500"},
];

const HEATMAP_ROWS = [
  {name:"Alex K.",   row:["mastered","understood","practiced","exposed","not-seen","not-seen"] as MasteryLevel[]},
  {name:"Jamie L.",  row:["mastered","mastered","understood","practiced","exposed","not-seen"] as MasteryLevel[]},
  {name:"Sam P.",    row:["understood","practiced","practiced","not-seen","not-seen","not-seen"] as MasteryLevel[]},
  {name:"Riley T.",  row:["mastered","mastered","mastered","understood","practiced","exposed"] as MasteryLevel[]},
  {name:"Jordan M.", row:["practiced","exposed","not-seen","not-seen","not-seen","not-seen"] as MasteryLevel[]},
];

const AI_RESPONSES = [
  "Great question! You're learning about Synapses in Conversational mode. Remember: the synaptic cleft isn't a bug — it's a feature that gives your brain precise control!",
  "This connects to Neurons from before! The axon sends signals out, and the synapse is exactly where that signal gets passed to the next neuron.",
  "I can see you're working on the quiz. I won't give the answer away, but think about *direction* — which end of the neuron receives input?",
];

// ─── Style constants ──────────────────────────────────────────────────────────
const FONT   = {fontFamily:"'Nunito', system-ui, sans-serif"} as const;
const BG     = "#F0F2FA";
const INDIGO = "#6366F1";
const PINK   = "#EC4899";

// Course card gradient configs
const COURSE_GRADIENTS = [
  {from:"from-indigo-500",to:"to-violet-600",light:"bg-indigo-50",text:"text-indigo-600"},
  {from:"from-pink-500",  to:"to-rose-500",  light:"bg-pink-50",  text:"text-pink-600"},
  {from:"from-emerald-500",to:"to-teal-500", light:"bg-emerald-50",text:"text-emerald-600"},
];

// ─── Shared components ────────────────────────────────────────────────────────

function MasteryBadge({level}:{level:MasteryLevel}) {
  const {color,bg,label} = MASTERY[level];
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
      style={{backgroundColor:bg,color}}>
      <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:color}}/>
      {label}
    </span>
  );
}

function ProgressBar({value,color=INDIGO,height="h-2"}:{value:number;color?:string;height?:string}) {
  return (
    <div className={`${height} w-full bg-slate-100 rounded-full overflow-hidden`}>
      <div className="h-full rounded-full transition-all duration-700"
        style={{width:`${value}%`,backgroundColor:color}}/>
    </div>
  );
}

function Pill({children,color="indigo"}:{children:React.ReactNode;color?:string}) {
  const map: Record<string,string> = {
    indigo:"bg-indigo-100 text-indigo-700",
    pink:"bg-pink-100 text-pink-700",
    emerald:"bg-emerald-100 text-emerald-700",
    amber:"bg-amber-100 text-amber-700",
    violet:"bg-violet-100 text-violet-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${map[color]||map.indigo}`}>
      {children}
    </span>
  );
}

function IndigoBtn({children,onClick,className="",small=false}:{children:React.ReactNode;onClick?:()=>void;className?:string;small?:boolean}) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 font-bold text-white rounded-full transition-all active:scale-95 hover:opacity-90 ${small?"px-4 py-1.5 text-xs":"px-5 py-2.5 text-sm"} ${className}`}
      style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
      {children}
    </button>
  );
}

function GhostBtn({children,onClick,className=""}:{children:React.ReactNode;onClick?:()=>void;className?:string}) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 border-indigo-200 text-indigo-600 text-sm font-bold hover:bg-indigo-50 active:scale-95 transition-all ${className}`}>
      {children}
    </button>
  );
}

// Card wrapper
function Card({children,className=""}:{children:React.ReactNode;className?:string}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({role,screen,setScreen,onLogout,userName,userInitials}:{
  role:Role;screen:Screen;setScreen:(s:Screen)=>void;onLogout:()=>void;
  userName:string;userInitials:string;
}) {
  const studentNav = [
    {icon:LayoutDashboard,label:"Dashboard",  screen:"student-courses"  as Screen},
    {icon:BookOpen,        label:"Courses",    screen:"student-courses"  as Screen},
    {icon:Target,          label:"Mastery",    screen:"student-mastery"  as Screen},
    {icon:MessageSquare,   label:"AI Tutor",   screen:"student-concept"  as Screen},
  ];
  const instructorNav = [
    {icon:LayoutDashboard,label:"Home",        screen:"instructor-home"      as Screen},
    {icon:Plus,           label:"Create",      screen:"instructor-create"    as Screen},
    {icon:BarChart2,      label:"Analytics",   screen:"instructor-dashboard" as Screen},
  ];
  const nav = role==="student" ? studentNav : instructorNav;

  return (
    <aside className="w-[220px] h-full bg-white flex flex-col py-6 px-4 border-r border-indigo-50" style={FONT}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
          <Brain className="w-5 h-5 text-white"/>
        </div>
        <span className="text-xl font-black text-indigo-900">LAIC</span>
        <span className="w-2 h-2 rounded-full bg-pink-500 mb-3"/>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">
          {role==="student"?"Learn":"Teach"}
        </p>
        {nav.map(item=>{
          const active=screen===item.screen;
          return (
            <button key={item.label} onClick={()=>setScreen(item.screen)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                active
                  ?"text-indigo-700 bg-indigo-50"
                  :"text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}>
              <item.icon className={`w-4.5 h-4.5 ${active?"text-indigo-600":"text-slate-400"}`}/>
              {item.label}
              {active&&<span className="ml-auto w-1.5 h-4 rounded-full bg-indigo-500"/>}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="space-y-1 mt-4 pt-4 border-t border-slate-100">
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all w-full">
          <Settings className="w-4 h-4"/>Settings
        </button>
        <button onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-400 hover:bg-rose-50 transition-all w-full">
          <LogOut className="w-4 h-4"/>Logout
        </button>
        {/* User pill */}
        <div className="flex items-center gap-2.5 px-3 py-3 mt-2 bg-indigo-50 rounded-2xl">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
            style={{background:"linear-gradient(135deg,#6366F1,#EC4899)"}}>
            {userInitials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-indigo-900 truncate">{userName}</p>
            <p className="text-xs text-indigo-400 font-semibold">{role==="student"?"Student":"Instructor"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar({title}:{title:string}) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 bg-white/95 backdrop-blur-md border-b border-indigo-50 shadow-sm">
      <h1 className="text-lg font-black text-indigo-900 flex-1">{title}</h1>
      <div className="flex items-center gap-2 bg-indigo-50 rounded-full px-4 py-2 w-56">
        <Search className="w-4 h-4 text-indigo-300"/>
        <input placeholder="Search your course..." className="bg-transparent text-sm font-semibold text-indigo-700 placeholder:text-indigo-300 focus:outline-none flex-1"/>
      </div>
      <button className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center relative hover:bg-indigo-100 transition-colors">
        <Bell className="w-4 h-4 text-indigo-500"/>
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-pink-500 border-2 border-white"/>
      </button>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginScreen({onLogin}:{onLogin:(r:Role,email:string,password:string)=>Promise<void>}) {
  const [showPass, setShowPass] = useState(false);
  const [email, setEmail] = useState("alex@school.edu");
  const [password, setPassword] = useState("demo-password-123");
  const [isRegister, setIsRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (r: Role) => {
    setError("");
    setBusy(true);
    try {
      await onLogin(r, email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{backgroundColor:"#fff",...FONT}}>
      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(18px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes float {
          0%,100% { transform:translateY(0px); }
          50%      { transform:translateY(-12px); }
        }
        @keyframes slideDown {
          from { opacity:0; transform:translateY(-16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes bgShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes pulseGlow {
          0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.3); }
          50%      { box-shadow: 0 0 0 8px rgba(99,102,241,0); }
        }
        .anim-fade-up { animation: fadeUp 0.5s ease both; }
        .anim-float   { animation: float 4s ease-in-out infinite; }
        .anim-slide-d { animation: slideDown 0.55s ease both; }
        .delay-1 { animation-delay: 0.08s; }
        .delay-2 { animation-delay: 0.16s; }
        .delay-3 { animation-delay: 0.24s; }
        .delay-4 { animation-delay: 0.32s; }
        .delay-5 { animation-delay: 0.40s; }
        .delay-6 { animation-delay: 0.48s; }
        .login-btn:hover { animation: pulseGlow 1s ease; }
      `}</style>

      {/* ── LEFT — clean form panel ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center items-center px-12 py-16 bg-white">
        <div className="w-full max-w-[360px]">

          {/* Logo */}
          <div className="flex items-center gap-2 mb-10 anim-fade-up">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
              <Brain className="w-4.5 h-4.5 text-white"/>
            </div>
            <span className="text-lg font-black text-indigo-900">LAIC</span>
          </div>

          {/* Heading */}
          <div className="mb-7 anim-fade-up delay-1">
            <h1 className="text-[28px] font-black text-gray-900 leading-tight mb-1.5">
              {isRegister ? "Create your account" : "Welcome back to LAIC"}
            </h1>
            <p className="text-sm font-semibold text-slate-400">
              {isRegister ? "Start learning smarter today." : "Your AI learning companion"}
            </p>
          </div>

          {/* Social buttons */}
          <div className="flex gap-3 mb-5 anim-fade-up delay-2">
            <button className="flex-1 flex items-center justify-center gap-2.5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-[0.97]">
              {/* Google icon */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button className="flex-1 flex items-center justify-center gap-2.5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-[0.97]">
              {/* Apple icon */}
              <svg width="16" height="18" viewBox="0 0 814 1000" fill="currentColor">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-43.4-150.3-109.2C80.3 714.3 32 643.5 32 575.3c0-118.7 77.2-181.3 152.3-181.3 68.4 0 109.7 45.2 164.4 45.2 52.3 0 101.6-47.7 165.6-47.7 25.9 0 108.2 2.6 168.5 79.6zm-87.5-167.8c35-41.5 60.1-99.2 60.1-157 0-8.1-.6-16.2-2-23.4-55.9 2-121.9 37.2-162.1 82.9-31.7 36.3-61.6 93.6-61.6 152 0 8.7 1.3 17.4 1.9 20.1 3.9.6 10.3 1.3 16.8 1.3 49.8 0 108.2-32.7 146.9-75.9z"/>
              </svg>
              Apple
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5 anim-fade-up delay-2">
            <div className="flex-1 h-px bg-gray-100"/>
            <span className="text-xs font-bold text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-100"/>
          </div>

          {/* Fields */}
          <div className="space-y-4 mb-5">
            {isRegister && (
              <div className="anim-fade-up">
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Your Name</label>
                <div className="relative">
                  <input type="text" placeholder="Alex Kim"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all"/>
                </div>
              </div>
            )}

            <div className="anim-fade-up delay-3">
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Your Email</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all"/>
              </div>
            </div>

            <div className="anim-fade-up delay-4">
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Your Password</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </div>
                <input type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-11 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all"/>
                <button type="button" onClick={()=>setShowPass(v=>!v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPass
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="space-y-2.5 anim-fade-up delay-5">
            {error && <p className="text-sm text-red-600 font-semibold text-center">{error}</p>}
            <button onClick={()=>submit("student")} disabled={busy}
              className="login-btn w-full py-3 text-sm font-black text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
              style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
              {isRegister ? "Create Account" : "Login"}
            </button>
            <button onClick={()=>submit("instructor")} disabled={busy}
              className="w-full py-3 text-sm font-bold text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-all active:scale-[0.98] disabled:opacity-60">
              Continue as Instructor
            </button>
          </div>

          {/* Footer links */}
          <div className="mt-5 space-y-2 text-center anim-fade-up delay-6">
            <p className="text-xs text-gray-400 font-semibold">
              By logging in, you agree to our{" "}
              <span className="text-indigo-500 cursor-pointer hover:underline">Terms of Service</span>
              {" "}and{" "}
              <span className="text-indigo-500 cursor-pointer hover:underline">Privacy Policy</span>
            </p>
            <p className="text-xs text-gray-400 font-semibold">
              {isRegister ? "Already have an account? " : "Don't have an account? "}
              <button onClick={()=>setIsRegister(v=>!v)} className="text-indigo-600 font-bold hover:underline">
                {isRegister ? "Sign in" : "Register"}
              </button>
            </p>
            {!isRegister && (
              <p className="text-xs text-gray-400 font-semibold">
                Forgot your password?{" "}
                <span className="text-indigo-600 font-bold cursor-pointer hover:underline">Reset Password</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT — rich marketing panel ────────────────────────────────── */}
      <div className="hidden lg:flex w-[52%] flex-col relative overflow-hidden"
        style={{background:"linear-gradient(160deg,#312e81 0%,#4c1d95 30%,#6d28d9 60%,#7c3aed 100%)"}}>

        {/* Animated bokeh blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute w-96 h-96 rounded-full opacity-30"
            style={{background:"radial-gradient(circle,#818cf8,transparent)",top:"-80px",left:"-60px",filter:"blur(60px)",animation:"bgShift 8s ease infinite"}}/>
          <div className="absolute w-80 h-80 rounded-full opacity-20"
            style={{background:"radial-gradient(circle,#ec4899,transparent)",bottom:"60px",right:"-40px",filter:"blur(70px)",animation:"bgShift 11s ease infinite reverse"}}/>
          <div className="absolute w-64 h-64 rounded-full opacity-20"
            style={{background:"radial-gradient(circle,#a78bfa,transparent)",top:"40%",left:"40%",filter:"blur(50px)",animation:"bgShift 14s ease infinite"}}/>
        </div>

        <div className="relative z-10 flex flex-col h-full px-12 py-12">

          {/* Stat card — slides down */}
          <div className="anim-slide-d">
            <div className="inline-flex items-center gap-3 bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-3.5 mb-10">
              <div className="w-8 h-8 rounded-xl bg-indigo-400/40 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
                </svg>
              </div>
              <p className="text-sm font-black text-white">Students on LAIC master concepts 3x faster</p>
            </div>
          </div>

          {/* Floating app mockup — centered */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-[420px] anim-float">
              {/* Mockup card */}
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden"
                style={{boxShadow:"0 40px 80px rgba(0,0,0,0.4)"}}>
                {/* Mockup topbar */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400"/>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"/>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400"/>
                  </div>
                  <div className="flex-1 bg-white rounded-lg px-3 py-1 text-[10px] font-semibold text-gray-400 border border-gray-100 text-center">
                    app.laic.ai/brain-bee/synapses
                  </div>
                </div>
                {/* Mockup content */}
                <div className="p-4 bg-[#F0F2FA]">
                  <div className="flex gap-3">
                    {/* Sidebar stub */}
                    <div className="w-32 bg-white rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-4 h-4 rounded-md" style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}/>
                        <div className="h-2 bg-indigo-900 rounded w-6"/>
                      </div>
                      {["Dashboard","Courses","Mastery","AI Tutor"].map((l,i)=>(
                        <div key={l} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg ${i===1?"bg-indigo-50":""}`}>
                          <div className={`w-2.5 h-2.5 rounded-sm ${i===1?"bg-indigo-400":"bg-gray-200"}`}/>
                          <div className={`h-1.5 rounded w-12 ${i===1?"bg-indigo-300":"bg-gray-200"}`}/>
                        </div>
                      ))}
                    </div>
                    {/* Main stub */}
                    <div className="flex-1 flex flex-col gap-2">
                      {/* Hero banner stub */}
                      <div className="rounded-xl p-3 h-16 relative overflow-hidden"
                        style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
                        <div className="absolute inset-0 opacity-10">
                          <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-white"/>
                        </div>
                        <div className="h-2 bg-white/60 rounded w-20 mb-1.5"/>
                        <div className="h-1.5 bg-white/40 rounded w-28"/>
                      </div>
                      {/* Cards stub */}
                      <div className="flex gap-2">
                        {[
                          {c:"from-indigo-500 to-violet-600",label:"Brain Bee",pct:42},
                          {c:"from-pink-500 to-rose-500",   label:"Mind Bee", pct:15},
                        ].map(card=>(
                          <div key={card.label} className="flex-1 bg-white rounded-xl p-2.5">
                            <div className={`h-10 rounded-lg bg-gradient-to-br ${card.c} mb-2`}/>
                            <div className="h-1.5 bg-gray-200 rounded w-14 mb-1"/>
                            <div className="h-1 bg-gray-100 rounded w-10 mb-2"/>
                            <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-400 rounded-full" style={{width:`${card.pct}%`}}/>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Concept list stub */}
                      <div className="bg-white rounded-xl p-2.5">
                        <div className="h-1.5 bg-gray-200 rounded w-16 mb-2"/>
                        {[70,50,30].map((w,i)=>(
                          <div key={i} className="flex items-center gap-2 py-1">
                            <div className="w-4 h-4 rounded-md" style={{backgroundColor:["#10B981","#F97316","#3B82F6"][i]+"30",border:`1px solid ${["#10B981","#F97316","#3B82F6"][i]}40`}}/>
                            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{width:`${w}%`,backgroundColor:["#10B981","#F97316","#3B82F6"][i]}}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom copy */}
          <div className="mt-8">
            <h2 className="text-3xl font-black text-white leading-tight mb-4">
              Drop your notes.<br/>We&apos;ll build your course.
            </h2>
            {/* School logos */}
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">Trusted by students from</p>
            <div className="flex items-center gap-5 flex-wrap">
              {["MIT","Yale","Harvard","Stanford","Berkeley"].map(s=>(
                <span key={s} className="text-white/50 font-black text-sm tracking-wide">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Student Onboarding ───────────────────────────────────────────────────────

function StudentOnboarding({onDone}:{onDone:()=>void}) {
  const [mode, setMode] = useState<ContentMode>("conversational");

  return (
    <div className="min-h-screen flex" style={{backgroundColor:BG,...FONT}}>
      {/* Left — welcome panel */}
      <div className="hidden lg:flex w-[380px] shrink-0 flex-col justify-between p-12 relative overflow-hidden"
        style={{background:"linear-gradient(145deg,#6366F1,#8B5CF6 60%,#EC4899)"}}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-white"/>
          <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full bg-white"/>
        </div>
        <div className="relative z-10 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white"/>
          </div>
          <span className="font-black text-white text-lg">LAIC</span>
        </div>
        <div className="relative z-10">
          <CatMascot size={140} className="mb-6"/>
          <h2 className="text-3xl font-black text-white leading-tight mb-3">
            Hi! I'm Navi, your AI tutor.
          </h2>
          <p className="text-white/70 font-semibold text-sm leading-relaxed">
            I adapt to how you learn — whether you want real-world examples, casual explanations, or textbook definitions. You can always change your mind mid-lesson.
          </p>
        </div>
        <p className="relative z-10 text-white/40 text-xs font-semibold">You can skip this and update your profile later.</p>
      </div>

      {/* Right — single form, everything visible at once */}
      <div className="flex-1 flex flex-col justify-center px-12 py-16 max-w-lg mx-auto">
        <h1 className="text-2xl font-black text-indigo-900 mb-1">Quick setup</h1>
        <p className="text-slate-500 font-semibold mb-8 text-sm">Takes 20 seconds. Helps Navi teach you better.</p>

        <div className="space-y-6">
          {/* Grade level */}
          <div>
            <label className="block text-sm font-black text-slate-700 mb-3">What grade are you in?</label>
            <div className="flex flex-wrap gap-2">
              {["Middle school","9th–10th","11th–12th","College","Just curious"].map(g=>(
                <button key={g}
                  className="px-4 py-2 rounded-full border-2 border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all active:scale-95">
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* How do you learn best */}
          <div>
            <label className="block text-sm font-black text-slate-700 mb-1">How do you like explanations?</label>
            <p className="text-xs font-semibold text-slate-400 mb-3">Navi will default to this. You can switch it for any concept.</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                {id:"real-world" as ContentMode,    label:"Real-world",    sub:"Analogies and examples", color:"bg-emerald-500"},
                {id:"conversational" as ContentMode, label:"Conversational",sub:"Casual and friendly",    color:"bg-indigo-500"},
                {id:"textbook" as ContentMode,       label:"Textbook",      sub:"Formal and structured",  color:"bg-amber-500"},
              ].map(opt=>(
                <button key={opt.id} onClick={()=>setMode(opt.id)}
                  className={`flex flex-col items-center p-4 rounded-2xl border-2 text-center transition-all ${mode===opt.id?"border-indigo-400 bg-indigo-50":"border-slate-200 bg-white hover:border-indigo-200"}`}>
                  <div className={`w-8 h-8 ${opt.color} rounded-xl mb-2`}/>
                  <p className={`text-sm font-black ${mode===opt.id?"text-indigo-700":"text-slate-700"}`}>{opt.label}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-tight">{opt.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Session length — plain radio, no drama */}
          <div>
            <label className="block text-sm font-black text-slate-700 mb-3">How long can you study at a time?</label>
            <div className="flex gap-2">
              {["15 min","30 min","45 min","1 hr+"].map(t=>(
                <button key={t}
                  className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all">
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <IndigoBtn onClick={onDone} className="flex-1 justify-center">
            Start learning
          </IndigoBtn>
          <button onClick={onDone} className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Instructor Onboarding ────────────────────────────────────────────────────

function InstructorOnboarding({onDone}:{onDone:()=>void}) {
  const [style, setStyle] = useState<string|null>(null);

  return (
    <div className="min-h-screen flex" style={{backgroundColor:BG,...FONT}}>
      {/* Left panel */}
      <div className="hidden lg:flex w-[340px] shrink-0 flex-col justify-between p-12 bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
            <Brain className="w-4 h-4 text-white"/>
          </div>
          <span className="font-black text-white text-lg">LAIC</span>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">What you're getting</p>
          <div className="space-y-4">
            {[
              {icon:Upload,    text:"Upload any file — PDF, slides, video, audio"},
              {icon:Sparkles,  text:"AI drafts your entire course structure"},
              {icon:BarChart2, text:"Dashboard shows who's stuck and what's confusing them"},
              {icon:MessageSquare,text:"Students get a guardrailed AI tutor (Navi) built from your content"},
            ].map((item,i)=>(
              <div key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  <item.icon className="w-3.5 h-3.5 text-white/60"/>
                </div>
                <p className="text-sm font-semibold text-slate-400 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs font-semibold text-slate-600">You can change any of this later in Settings.</p>
      </div>

      {/* Right — single screen, everything visible */}
      <div className="flex-1 flex flex-col justify-center px-12 py-16 max-w-xl mx-auto">
        <h1 className="text-2xl font-black text-indigo-900 mb-1">Welcome, Dr. Ashwini.</h1>
        <p className="text-slate-500 font-semibold mb-8 text-sm">One quick question, then you're in.</p>

        {/* Teaching style — the only question that matters */}
        <div className="mb-8">
          <label className="block text-sm font-black text-slate-700 mb-1">How do you teach?</label>
          <p className="text-xs font-semibold text-slate-400 mb-4">LAIC uses this to suggest course structures. You can always override it.</p>
          <div className="space-y-2.5">
            {[
              {id:"lecture",  label:"Lecture-first",    sub:"I explain, then they practice. Textbook → MCQs → quiz."},
              {id:"socratic", label:"Question-first",   sub:"I ask before I tell. Students work toward answers."},
              {id:"applied",  label:"Application-first",sub:"Concept → real example → reflection. Less lecturing."},
              {id:"mixed",    label:"Let AI decide",    sub:"Vary it by concept based on what works. I'll review drafts."},
            ].map(opt=>(
              <button key={opt.id} onClick={()=>setStyle(opt.id)}
                className={`w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all ${style===opt.id?"border-indigo-400 bg-indigo-50":"border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"}`}>
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-all ${style===opt.id?"border-indigo-500 bg-indigo-500":"border-slate-300"}`}>
                  {style===opt.id&&<div className="w-2 h-2 rounded-full bg-white"/>}
                </div>
                <div>
                  <p className={`text-sm font-black ${style===opt.id?"text-indigo-800":"text-slate-800"}`}>{opt.label}</p>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5 leading-relaxed">{opt.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* AI features — simple toggles, no drama */}
        <div className="mb-8 bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <p className="text-sm font-black text-slate-700 mb-3">AI does this automatically</p>
          <div className="space-y-3">
            {[
              {label:"Generate 3 explanation modes per concept",on:true},
              {label:"Flag struggling students in your dashboard",on:true},
              {label:"Suggest related videos to embed",on:false},
            ].map((item,i)=>(
              <label key={i} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked={item.on} className="w-4 h-4 accent-indigo-600"/>
                <span className="text-sm font-semibold text-slate-600">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <IndigoBtn onClick={onDone} className="flex-1 justify-center">
            Enter LAIC
          </IndigoBtn>
          <button onClick={onDone} className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Chat sidebar ──────────────────────────────────────────────────────────

function AISidebar({contentMode}:{contentMode:ContentMode}) {
  const [messages,setMessages]=useState([
    {role:"assistant" as const,content:"Hey Alex! I'm your AI tutor for Synapses. Ask me anything — I keep things guardrailed during quizzes so you can actually learn!"},
  ]);
  const [input,setInput]=useState("");
  const [streaming,setStreaming]=useState(false);
  const idx=useRef(0);
  const bottomRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[messages,streaming]);
  const send=()=>{
    if(!input.trim()||streaming) return;
    const msg=input.trim(); setInput("");
    setMessages(p=>[...p,{role:"user",content:msg}]);
    setStreaming(true);
    const reply=AI_RESPONSES[idx.current%AI_RESPONSES.length]; idx.current++;
    setTimeout(()=>{setMessages(p=>[...p,{role:"assistant",content:reply}]);setStreaming(false);},1000);
  };
  const renderText=(text:string)=>text.split("**").map((p,i)=>i%2===1?<strong key={i}>{p}</strong>:<span key={i}>{p}</span>);
  return (
    <aside className="w-[300px] shrink-0 bg-white border-l border-indigo-50 flex flex-col overflow-hidden" style={FONT}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-indigo-50 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <CatMini size={42}/>
          <div>
            <p className="font-black text-indigo-900 text-sm">Navi — AI Tutor</p>
            <p className="text-xs font-bold text-indigo-300">Context-aware</p>
          </div>
          <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-pink-500 bg-pink-50 border border-pink-100 px-2 py-1 rounded-full">
            <Lock className="w-2.5 h-2.5"/> Quiz guard
          </span>
        </div>
        {/* Mode indicator */}
        <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-indigo-400"/>
          <span className="text-xs font-bold text-indigo-600">Viewing: Synapses — {contentMode==="real-world"?"Real World":contentMode==="conversational"?"Conversational":"Textbook"}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {messages.map((msg,i)=>(
          <div key={i} className={`flex gap-2 ${msg.role==="user"?"justify-end":"justify-start"}`}>
            {msg.role==="assistant"&&<CatMini size={28}/>}
            <div className={`max-w-[200px] px-3.5 py-2.5 rounded-2xl text-xs font-semibold leading-relaxed ${
              msg.role==="user"
                ?"text-white rounded-br-sm"
                :"bg-indigo-50 text-indigo-800 rounded-bl-sm"
            }`} style={msg.role==="user"?{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}:{}}>
              {renderText(msg.content)}
            </div>
          </div>
        ))}
        {streaming&&(
          <div className="flex gap-2">
            <CatMini size={28}/>
            <div className="bg-indigo-50 px-3.5 py-2.5 rounded-2xl rounded-bl-sm flex gap-1 items-center">
              {[0,1,2].map(j=><div key={j} className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce" style={{animationDelay:`${j*160}ms`}}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-indigo-50 shrink-0">
        <div className="flex items-center gap-2 bg-indigo-50 rounded-2xl px-4 py-2.5">
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
            placeholder="Ask anything..."
            className="flex-1 bg-transparent text-xs font-semibold text-indigo-800 placeholder:text-indigo-300 focus:outline-none"/>
          <button onClick={send} disabled={!input.trim()||streaming}
            className="w-7 h-7 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-all"
            style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
            <Send className="w-3.5 h-3.5"/>
          </button>
        </div>
        <p className="text-center text-[10px] font-bold text-indigo-300 mt-2 uppercase tracking-wider">Mode switches logged for your teacher</p>
      </div>
    </aside>
  );
}

// ─── MCQ Block ────────────────────────────────────────────────────────────────

function MCQBlock() {
  const [selected,setSelected]=useState<number|null>(null);
  const [submitted,setSubmitted]=useState(false);
  const [hintsShown,setHintsShown]=useState(0);
  const correct=submitted&&selected===MCQ_DATA.correct;
  const wrong=submitted&&selected!==MCQ_DATA.correct;
  const optCls=(i:number)=>{
    if(!submitted&&selected!==i) return "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50";
    if(!submitted&&selected===i) return "border-indigo-400 bg-indigo-50 text-indigo-800";
    if(i===MCQ_DATA.correct) return "border-emerald-300 bg-emerald-50 text-emerald-800";
    if(i===selected) return "border-red-300 bg-red-50 text-red-700";
    return "border-slate-100 bg-slate-50/50 text-slate-400";
  };
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 bg-indigo-50">
        <div className="w-7 h-7 rounded-xl bg-indigo-500 flex items-center justify-center">
          <HelpCircle className="w-4 h-4 text-white"/>
        </div>
        <span className="text-sm font-black text-indigo-700">Quiz Time!</span>
        <Pill color="indigo">{MCQ_DATA.hints.length} hints available</Pill>
      </div>
      <div className="p-5">
        <p className="font-bold text-slate-800 mb-4 leading-relaxed">{MCQ_DATA.question}</p>
        <div className="space-y-2.5 mb-5">
          {MCQ_DATA.options.map((opt,i)=>(
            <button key={i} onClick={()=>!submitted&&setSelected(i)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-sm font-bold text-left transition-all ${optCls(i)}`}>
              <span className="w-7 h-7 rounded-xl border-2 border-current flex items-center justify-center shrink-0 text-xs font-black">
                {submitted&&i===MCQ_DATA.correct?<Check className="w-3.5 h-3.5"/>:submitted&&i===selected?<X className="w-3.5 h-3.5"/>:String.fromCharCode(65+i)}
              </span>
              {opt}
            </button>
          ))}
        </div>
        {!correct&&(
          <div className="mb-4 space-y-2.5">
            {MCQ_DATA.hints.slice(0,hintsShown).map((hint,i)=>(
              <div key={i} className="flex items-start gap-2.5 bg-amber-50 border-2 border-amber-100 rounded-2xl px-4 py-3">
                <span className="text-xs font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-lg shrink-0">{hint.level}</span>
                <p className="text-xs font-semibold text-amber-800 leading-relaxed">{hint.text}</p>
              </div>
            ))}
            {hintsShown<MCQ_DATA.hints.length&&!submitted&&(
              <button onClick={()=>setHintsShown(h=>h+1)}
                className="text-sm font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors">
                <Sparkles className="w-3.5 h-3.5"/> Show {MCQ_DATA.hints[hintsShown].level} hint
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          {!submitted?(
            <IndigoBtn onClick={()=>selected!==null&&setSubmitted(true)}>Check answer</IndigoBtn>
          ):(
            <div className={`flex items-center gap-2 text-sm font-black ${correct?"text-emerald-600":"text-red-500"}`}>
              {correct?<Check className="w-4 h-4"/>:<X className="w-4 h-4"/>}
              {correct?"Correct! Great job!":"Not quite — check the hints above!"}
            </div>
          )}
          {wrong&&<button onClick={()=>{setSubmitted(false);setSelected(null);}} className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">Try again</button>}
        </div>
      </div>
    </Card>
  );
}

// ─── Student Dashboard ────────────────────────────────────────────────────────

function StudentDashboard({setScreen}:{setScreen:(s:Screen)=>void}) {
  const courses=[
    {name:"Brain Bee",  subject:"Neuroscience",    instructor:"Dr. Ashwini", progress:42,concepts:18,mastered:7, grad:COURSE_GRADIENTS[0]},
    {name:"Mind Bee",   subject:"Cognitive Science",instructor:"Prof. Chen",  progress:15,concepts:14,mastered:2, grad:COURSE_GRADIENTS[1]},
  ];

  return (
    <div style={{backgroundColor:BG}} className="min-h-screen">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Hero banner */}
        <div className="relative rounded-3xl overflow-hidden p-7 text-white"
          style={{background:"linear-gradient(135deg,#6366F1 0%,#8B5CF6 60%,#EC4899 100%)"}}>
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white translate-x-1/4 -translate-y-1/4"/>
            <div className="absolute bottom-0 left-1/2 w-32 h-32 rounded-full bg-white translate-y-1/2"/>
          </div>
          <div className="relative z-10 max-w-lg">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
                <Flame className="w-3.5 h-3.5 text-orange-300"/>
                <span className="text-xs font-black">5-day streak</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
                <Trophy className="w-3.5 h-3.5 text-yellow-300"/>
                <span className="text-xs font-black">7 mastered</span>
              </div>
            </div>
            <h2 className="text-2xl font-black mb-1">Keep going, Alex!</h2>
            <p className="text-white/80 font-semibold text-sm mb-5">You're 42% through Brain Bee. Pick up where you left off.</p>
            <IndigoBtn onClick={()=>setScreen("student-concept")}
              className="bg-white !text-indigo-700 hover:bg-white/90"
              style={{background:"white",boxShadow:"none"}}>
              Resume Brain Bee
              <ArrowRight className="w-4 h-4"/>
            </IndigoBtn>
          </div>
        </div>

        {/* Continue learning */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-indigo-900">Continue Learning</h2>
            <button className="text-sm font-bold text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-1">
              See all <ChevronRight className="w-4 h-4"/>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {courses.map(course=>(
              <button key={course.name} onClick={()=>setScreen("student-concept")}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all text-left group active:scale-[0.98]">
                {/* Thumbnail */}
                <div className={`h-28 bg-gradient-to-br ${course.grad.from} ${course.grad.to} flex items-center justify-center relative overflow-hidden`}>
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-2 right-2 w-16 h-16 rounded-full bg-white"/>
                    <div className="absolute bottom-2 left-4 w-10 h-10 rounded-full bg-white"/>
                  </div>
                  <Brain className="w-12 h-12 text-white relative z-10"/>
                  <div className="absolute top-3 left-3">
                    <Pill color={course.grad.from.includes("indigo")?"indigo":"pink"}>{course.subject}</Pill>
                  </div>
                  <div className="absolute bottom-3 right-3 w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-colors">
                    <Play className="w-4 h-4 text-white fill-white"/>
                  </div>
                </div>
                {/* Info */}
                <div className="p-4">
                  <h3 className="font-black text-indigo-900 text-base mb-0.5">{course.name}</h3>
                  <p className="text-xs font-bold text-slate-400 mb-3">{course.instructor}</p>
                  <ProgressBar value={course.progress}/>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs font-bold text-slate-400">{course.mastered} mastered</span>
                    <span className="text-xs font-black text-indigo-600">{course.progress}%</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent concepts */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-indigo-900">Recent Concepts</h2>
            <button onClick={()=>setScreen("student-mastery")} className="text-sm font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4"/>
            </button>
          </div>
          <Card>
            <div className="divide-y divide-slate-50">
              {CONCEPTS.slice(0,4).map((c,i)=>{
                const m=MASTERY[c.mastery];
                return (
                  <div key={c.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                      style={{backgroundColor:m.bg,color:m.color}}>
                      {i+1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{c.name}</p>
                      <p className="text-xs font-semibold text-slate-400">Chapter {c.chapter}</p>
                    </div>
                    <MasteryBadge level={c.mastery}/>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Student Concept ──────────────────────────────────────────────────────────

function StudentConceptScreen({setScreen}:{setScreen:(s:Screen)=>void}) {
  const avail=CONCEPT_AVAIL["synapses"];
  const [contentMode,setContentMode]=useState<ContentMode>("conversational");
  const [showInteractive,setShowInteractive]=useState(false);
  const mc=MODE_CONTENT[contentMode];
  const modeColors:Record<ContentMode,string>={
    "real-world":"bg-emerald-500","conversational":"bg-indigo-500","textbook":"bg-amber-500"
  };
  return (
    <div className="flex" style={{backgroundColor:BG}}>
      {/* Sticky concept nav */}
      <div className="w-52 bg-white border-r border-indigo-50 flex-col p-4 shrink-0 hidden lg:flex"
        style={{position:"sticky",top:57,height:"calc(100vh - 57px)",overflowY:"auto"}}>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Brain Bee</p>
        {[1,2,3].map(ch=>(
          <div key={ch} className="mb-4">
            <p className="text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">Ch {ch}</p>
            {CONCEPTS.filter(c=>c.chapter===ch).map(c=>(
              <button key={c.id}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all mb-1 ${c.id==="synapses"?"bg-indigo-50 text-indigo-700":"text-slate-500 hover:bg-slate-50"}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:MASTERY[c.mastery].color}}/>
                {c.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Naturally scrolling content */}
      <div className="flex-1 min-h-0">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        {/* Header card */}
        <Card className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Pill color="indigo">Brain Bee</Pill>
                <ChevronRight className="w-3 h-3 text-slate-300"/>
                <Pill color="violet">Chapter 1</Pill>
              </div>
              <h1 className="text-2xl font-black text-indigo-900">Synapses</h1>
              <p className="text-sm font-semibold text-slate-400 mt-1">How neurons communicate with each other</p>
            </div>
            <MasteryBadge level="understood"/>
          </div>
          {/* Mode switcher */}
          <div className="mb-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Explanation Mode</p>
            <div className="flex gap-2 flex-wrap">
              {(Object.entries(CONTENT_MODES) as [ContentMode,{icon:string;label:string;color:string}][]).map(([id,info])=>{
                const a=avail.modes.includes(id);
                const modeMap:Record<ContentMode,string>={"real-world":"bg-emerald-500","conversational":"bg-indigo-500","textbook":"bg-amber-500"};
                return (
                  <button key={id} onClick={()=>a&&setContentMode(id)} disabled={!a}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all ${
                      !a?"opacity-30 cursor-not-allowed bg-slate-100 text-slate-400"
                        :contentMode===id?"text-white shadow-sm"
                        :"bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    style={a&&contentMode===id?{backgroundColor:info.color}:{}}>
                    {!a&&<Lock className="w-3 h-3"/>}
                    {info.label}
                  </button>
                );
              })}
              {avail.hasInteractive&&(
                <button onClick={()=>setShowInteractive(v=>!v)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all ${showInteractive?"bg-pink-500 text-white":"bg-pink-100 text-pink-600 hover:bg-pink-200"}`}>
                  <Zap className="w-3 h-3"/> Interactive
                </button>
              )}
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5"><span>Progress</span><span>3 / 5 sections</span></div>
            <ProgressBar value={60} height="h-2.5"/>
          </div>
        </Card>

        {/* Content block */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-7 h-7 rounded-xl ${modeColors[contentMode]} flex items-center justify-center`}>
              <BookOpen className="w-4 h-4 text-white"/>
            </div>
            <span className="font-black text-slate-700 text-sm">{CONTENT_MODES[contentMode].label}</span>
          </div>
          <h2 className="text-xl font-black text-indigo-900 mb-4">{mc.heading}</h2>
          <div className="space-y-3">
            {mc.body.map((para,i)=>(
              <p key={i} className="text-sm font-semibold text-slate-600 leading-7">
                {para.split("**").map((p,j)=>j%2===1?<strong key={j} className="text-slate-900">{p}</strong>:p)}
              </p>
            ))}
          </div>
        </Card>

        {/* Interactive */}
        {showInteractive&&(
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-pink-50 border-b border-pink-100">
              <Zap className="w-4 h-4 text-pink-500"/>
              <span className="text-sm font-black text-pink-700">Interactive Animation</span>
              <span className="ml-auto text-xs font-bold text-pink-400">Manim + GSAP</span>
            </div>
            <svg viewBox="0 0 520 200" className="w-full p-4" aria-label="Synapse diagram">
              <ellipse cx="130" cy="100" rx="60" ry="40" fill="#EEF2FF" stroke="#6366F1" strokeWidth="2"/>
              <text x="130" y="93" textAnchor="middle" fill="#4338CA" fontSize="10" fontWeight="800">Pre-synaptic</text>
              <text x="130" y="108" textAnchor="middle" fill="#4338CA" fontSize="9" fontWeight="700">terminal</text>
              {([[115,120],[138,124],[125,112]] as [number,number][]).map(([cx,cy],i)=>(
                <circle key={i} cx={cx} cy={cy} r="6" fill="#C7D2FE" stroke="#6366F1" strokeWidth="1.5"/>
              ))}
              <rect x="200" y="72" width="100" height="56" rx="8" fill="#FAFAFA" stroke="#E2E4F0" strokeWidth="1.5" strokeDasharray="6 3"/>
              <text x="250" y="97" textAnchor="middle" fill="#94A3B8" fontSize="9" fontWeight="700">Synaptic cleft</text>
              {([[215,90],[240,84],[265,91],[228,115],[253,118]] as [number,number][]).map(([cx,cy],i)=>(
                <circle key={i} cx={cx} cy={cy} r="5" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5"/>
              ))}
              <ellipse cx="370" cy="100" rx="60" ry="40" fill="#ECFDF5" stroke="#10B981" strokeWidth="2"/>
              <text x="370" y="93" textAnchor="middle" fill="#047857" fontSize="10" fontWeight="800">Post-synaptic</text>
              <text x="370" y="108" textAnchor="middle" fill="#047857" fontSize="9" fontWeight="700">membrane</text>
              <defs><marker id="a6" markerWidth="7" markerHeight="7" refX="5" refY="2.5" orient="auto"><path d="M0,0 L0,5 L7,2.5z" fill="#6366F1"/></marker></defs>
              <line x1="45" y1="100" x2="72" y2="100" stroke="#6366F1" strokeWidth="2" markerEnd="url(#a6)"/>
              <text x="20" y="97" fill="#6366F1" fontSize="9" fontWeight="800">Signal</text>
            </svg>
          </Card>
        )}

        <MCQBlock/>

        {/* Reflection */}
        <ReflectionInline/>

        <div className="flex items-center justify-between pb-8">
          <span className="text-sm font-bold text-slate-400">Next: Brain Regions</span>
          <IndigoBtn onClick={()=>setScreen("student-reflection")}>
            Finish session <ArrowRight className="w-4 h-4"/>
          </IndigoBtn>
        </div>
        </div>
      </div>
    </div>
  );
}

function ReflectionInline() {
  const [res,setRes]=useState("");
  const [done,setDone]=useState(false);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 bg-violet-50">
        <div className="w-7 h-7 rounded-xl bg-violet-500 flex items-center justify-center">
          <Star className="w-4 h-4 text-white"/>
        </div>
        <span className="text-sm font-black text-violet-700">Reflection</span>
        <span className="ml-auto text-xs font-bold text-violet-400 bg-violet-100 px-2 py-0.5 rounded-full">Reflection Agent</span>
      </div>
      <div className="p-5">
        {!done?(
          <>
            <p className="font-bold text-slate-700 mb-3 text-sm">What's the most surprising thing about how neurons communicate?</p>
            <textarea value={res} onChange={e=>setRes(e.target.value)} rows={3} placeholder="Write your thoughts here..."
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-violet-300 resize-none mb-3 transition-all"/>
            <GhostBtn onClick={()=>res.trim()&&setDone(true)} className="border-violet-200 text-violet-600 hover:bg-violet-50">Submit reflection</GhostBtn>
          </>
        ):(
          <div className="flex items-start gap-3 bg-violet-50 rounded-2xl p-4">
            <Check className="w-5 h-5 text-violet-500 shrink-0 mt-0.5"/>
            <div>
              <p className="font-black text-violet-800 text-sm">Saved to your learning journal!</p>
              <p className="text-xs font-semibold text-violet-500 mt-0.5">Your AI tutor can reference this next time.</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Reflection Screen ────────────────────────────────────────────────────────

function ReflectionScreen({setScreen}:{setScreen:(s:Screen)=>void}) {
  const [submitted,setSubmitted]=useState(false);
  return (
    <div className="flex items-center justify-center p-16" style={{backgroundColor:BG}}>
      <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-lg">
        {!submitted?(
          <>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-5">
              <Star className="w-8 h-8 text-white"/>
            </div>
            <Pill color="violet">Session Reflection</Pill>
            <h2 className="text-2xl font-black text-indigo-900 mt-3 mb-2">Before you go...</h2>
            <div className="flex gap-3 mb-6">
              <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2">
                <Clock className="w-3.5 h-3.5 text-indigo-400"/>
                <span className="text-xs font-bold text-indigo-600">18 min</span>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2">
                <Check className="w-3.5 h-3.5 text-emerald-500"/>
                <span className="text-xs font-bold text-emerald-600">1 quiz correct</span>
              </div>
            </div>
            <div className="space-y-4 mb-6">
              {["What genuinely surprised you about synaptic transmission?","What's still confusing? Be real — your AI tutor uses this!"].map((q,i)=>(
                <div key={i}>
                  <p className="text-sm font-black text-slate-700 mb-2">{q}</p>
                  <textarea rows={3} placeholder="Write freely..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-200 resize-none transition-all"/>
                </div>
              ))}
            </div>
            <IndigoBtn onClick={()=>setSubmitted(true)} className="w-full justify-center">Submit and continue!</IndigoBtn>
          </>
        ):(
          <div className="text-center py-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-5">
              <Trophy className="w-10 h-10 text-white"/>
            </div>
            <h2 className="text-2xl font-black text-indigo-900 mb-2">Reflection saved!</h2>
            <p className="text-slate-500 font-semibold mb-5 text-sm">Your AI tutor will use this in your next session on <strong className="text-indigo-700">Brain Regions</strong>.</p>
            <div className="bg-indigo-50 rounded-2xl p-4 mb-6 text-left">
              <p className="text-xs font-black text-indigo-500 mb-1 uppercase tracking-wider">Planner Agent</p>
              <p className="text-sm font-bold text-indigo-800">Next: <strong>Brain Regions</strong> in <strong>Textbook</strong> mode — building on today's signal-pathway understanding.</p>
            </div>
            <IndigoBtn onClick={()=>setScreen("student-courses")} className="mx-auto">Back to dashboard</IndigoBtn>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Student Mastery ──────────────────────────────────────────────────────────

function StudentMasteryScreen() {
  return (
    <div className="p-6 space-y-5" style={{backgroundColor:BG}}>
      <div className="grid grid-cols-4 gap-4">
        {[
          {label:"Mastered",  value:"7", color:"#10B981",bg:"#ECFDF5"},
          {label:"Understood",value:"2", color:"#F97316",bg:"#FFF7ED"},
          {label:"Exposed",   value:"4", color:"#3B82F6",bg:"#EFF6FF"},
          {label:"Not started",value:"5",color:"#94A3B8",bg:"#F1F5F9"},
        ].map(s=>(
          <Card key={s.label} className="p-4">
            <div className="text-3xl font-black mb-1" style={{color:s.color}}>{s.value}</div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{backgroundColor:s.color}}/>
              <span className="text-xs font-bold text-slate-500">{s.label}</span>
            </div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="px-5 py-4 bg-indigo-50 border-b border-indigo-100">
          <p className="text-sm font-black text-indigo-700">Brain Bee — Concept Mastery</p>
        </div>
        <div className="divide-y divide-slate-50">
          {CONCEPTS.map(c=>{
            const pct=c.mastery==="mastered"?100:c.mastery==="understood"?75:c.mastery==="practiced"?50:c.mastery==="exposed"?25:5;
            return (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4">
                <span className="text-sm font-bold text-slate-700 w-36 shrink-0">{c.name}</span>
                <div className="flex-1"><ProgressBar value={pct} color={MASTERY[c.mastery].color} height="h-2.5"/></div>
                <MasteryBadge level={c.mastery}/>
              </div>
            );
          })}
        </div>
      </Card>
      <Card className="p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-amber-500"/>
        </div>
        <div>
          <p className="font-black text-slate-800 mb-0.5">Next milestone</p>
          <p className="text-sm font-semibold text-slate-500">Practice Synapses 2 more times to reach <strong className="text-emerald-600">Mastered</strong>!</p>
        </div>
      </Card>
    </div>
  );
}

// ─── Instructor Create ────────────────────────────────────────────────────────

// ── Block popup configs ────────────────────────────────────────────────────────

interface BlockData {
  type: string;
  // Video
  videoUrl?:string; startTime?:string; endTime?:string; videoTitle?:string;
  // Text
  title?:string; body?:string;
  // MCQ
  question?:string; options?:string[]; correct?:number;
  // Flashcard
  deckName?:string; cards?:{term:string;def:string}[];
  // Reflection
  prompt?:string;
  // Audio
  audioUrl?:string; audioDesc?:string;
  // Code
  language?:string; code?:string; instructions?:string;
}

const VIDEO_RECS = [
  {title:"How Synapses Work — MIT OpenCourseWare",ch:"MIT OCW",dur:"8:34",thumb:"bg-blue-600"},
  {title:"Synaptic Transmission Explained — Crash Course",ch:"CrashCourse",dur:"12:47",thumb:"bg-red-500"},
  {title:"Neurotransmitters & Receptors — Khan Academy",ch:"Khan Academy",dur:"9:12",thumb:"bg-green-600"},
  {title:"Action Potential & Synapses — Ninja Nerd",ch:"Ninja Nerd",dur:"15:22",thumb:"bg-purple-600"},
];

function BlockModal({type,onSave,onClose}:{type:string;onSave:(d:BlockData)=>void;onClose:()=>void}) {
  const [data,setData]=useState<BlockData>({type,options:["","","",""],correct:0,cards:[{term:"",def:""}]});
  const upd=(k:keyof BlockData,v:unknown)=>setData(p=>({...p,[k]:v}));

  const save=()=>{onSave(data);onClose();};

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{backgroundColor:"rgba(15,15,40,0.6)",backdropFilter:"blur(4px)"}}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        style={{animation:"slideUpChat 0.22s cubic-bezier(0.34,1.56,0.64,1) both"}}>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${BLOCK_TYPES.find(b=>b.type===type)?.color||"bg-indigo-500"}`}>
            {(()=>{const bt=BLOCK_TYPES.find(b=>b.type===type); return bt?<bt.icon className="w-5 h-5 text-white"/>:null;})()}
          </div>
          <div>
            <h2 className="font-black text-slate-900">{type}</h2>
            <p className="text-xs font-semibold text-slate-400">Configure this block</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-300 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* ── VIDEO LESSON ─────────────────────────────────────── */}
          {type==="Video Lesson"&&(
            <>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Video URL</label>
                <div className="flex gap-2">
                  <input value={data.videoUrl||""} onChange={e=>upd("videoUrl",e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="flex-1 px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 transition-all"/>
                  <button className="px-4 py-2.5 bg-indigo-500 text-white text-sm font-black rounded-xl hover:bg-indigo-600 transition-colors shrink-0">
                    Load
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-black text-slate-700 mb-1.5">Start timestamp</label>
                  <input value={data.startTime||""} onChange={e=>upd("startTime",e.target.value)}
                    placeholder="0:00"
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 transition-all"/>
                </div>
                <div>
                  <label className="block text-sm font-black text-slate-700 mb-1.5">End timestamp</label>
                  <input value={data.endTime||""} onChange={e=>upd("endTime",e.target.value)}
                    placeholder="3:45"
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 transition-all"/>
                </div>
              </div>
              {/* Video preview stub */}
              {data.videoUrl&&(
                <div className="bg-slate-900 rounded-2xl aspect-video flex items-center justify-center relative overflow-hidden">
                  <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                    <Play className="w-7 h-7 text-white fill-white ml-1"/>
                  </div>
                  <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-lg">
                    {data.startTime||"0:00"} → {data.endTime||"end"}
                  </div>
                </div>
              )}
              {/* Related video recommendations */}
              <div>
                <p className="text-sm font-black text-slate-700 mb-2">Related videos to add</p>
                <p className="text-xs font-semibold text-slate-400 mb-3">Based on your course topic — click to use instead</p>
                <div className="space-y-2">
                  {VIDEO_RECS.map((v,i)=>(
                    <button key={i} onClick={()=>{upd("videoUrl",`https://youtube.com/watch?v=rec${i}`);upd("videoTitle",v.title);}}
                      className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-xl border-2 border-transparent hover:border-indigo-200 hover:bg-indigo-50 transition-all text-left group">
                      <div className={`w-14 h-10 rounded-lg ${v.thumb} flex items-center justify-center shrink-0`}>
                        <Play className="w-4 h-4 text-white fill-white"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{v.title}</p>
                        <p className="text-[10px] font-semibold text-slate-400">{v.ch} · {v.dur}</p>
                      </div>
                      <span className="text-[10px] font-black text-indigo-500 bg-indigo-100 px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Use this</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── TEXT BLOCK ───────────────────────────────────────── */}
          {type==="Text Block"&&(
            <>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Section title</label>
                <input value={data.title||""} onChange={e=>upd("title",e.target.value)}
                  placeholder="e.g. What is a Synapse?"
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 transition-all"/>
              </div>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Content</label>
                <textarea value={data.body||""} onChange={e=>upd("body",e.target.value)} rows={6}
                  placeholder="Write your explanation here. Use **bold** for key terms."
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 resize-none transition-all"/>
              </div>
              <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-4 py-3">
                <Sparkles className="w-4 h-4 text-indigo-500 shrink-0"/>
                <p className="text-xs font-bold text-indigo-700">AI can draft this from your uploaded sources — just click Save and it will auto-fill.</p>
              </div>
            </>
          )}

          {/* ── MCQ QUIZ ─────────────────────────────────────────── */}
          {type==="MCQ Quiz"&&(
            <>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Question</label>
                <textarea value={data.question||""} onChange={e=>upd("question",e.target.value)} rows={2}
                  placeholder="Which part of a neuron receives incoming signals?"
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 resize-none transition-all"/>
              </div>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">Answer choices</label>
                <div className="space-y-2">
                  {(data.options||["","","",""]).map((opt,i)=>(
                    <div key={i} className="flex items-center gap-2">
                      <button onClick={()=>upd("correct",i)}
                        className={`w-7 h-7 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${data.correct===i?"border-emerald-500 bg-emerald-500":"border-slate-200 hover:border-emerald-300"}`}>
                        {data.correct===i&&<Check className="w-3.5 h-3.5 text-white"/>}
                      </button>
                      <input value={opt} onChange={e=>{const opts=[...(data.options||["","","",""])];opts[i]=e.target.value;upd("options",opts);}}
                        placeholder={`Option ${String.fromCharCode(65+i)}`}
                        className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 transition-all"/>
                    </div>
                  ))}
                </div>
                <p className="text-xs font-semibold text-slate-400 mt-2">Click the circle to mark the correct answer</p>
              </div>
            </>
          )}

          {/* ── FLASHCARD SET ────────────────────────────────────── */}
          {type==="Reflection"&&(
            <>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Reflection prompt</label>
                <textarea value={data.prompt||""} onChange={e=>upd("prompt",e.target.value)} rows={4}
                  placeholder="What's the most surprising thing you learned about synapses? Explain it like you're teaching a friend."
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-violet-400 resize-none transition-all"/>
              </div>
              <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                <p className="text-xs font-black text-violet-700 mb-1">Reflection Agent</p>
                <p className="text-xs font-semibold text-violet-500">Students must complete this before advancing. Their responses are stored and referenced by the AI tutor in future sessions.</p>
              </div>
            </>
          )}

          {/* ── AUDIO INSIGHT ────────────────────────────────────── */}
          {type==="Audio Insight"&&(
            <>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Audio URL or upload</label>
                <input value={data.audioUrl||""} onChange={e=>upd("audioUrl",e.target.value)}
                  placeholder="https://... or drag a .mp3 file"
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 transition-all mb-2"/>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-indigo-300 cursor-pointer transition-colors">
                  <Music className="w-8 h-8 text-slate-300 mx-auto mb-2"/>
                  <p className="text-xs font-bold text-slate-400">Drop an audio file here</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Description for students</label>
                <input value={data.audioDesc||""} onChange={e=>upd("audioDesc",e.target.value)}
                  placeholder="Listen to this 3-minute explanation of synaptic transmission."
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 transition-all"/>
              </div>
            </>
          )}

          {/* ── CODE SANDBOX ─────────────────────────────────────── */}
          {type==="Code Sandbox"&&(
            <>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Language</label>
                <select value={data.language||"python"} onChange={e=>upd("language",e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-400 transition-all">
                  {["Python","JavaScript","HTML/CSS","R","MATLAB"].map(l=><option key={l} value={l.toLowerCase()}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Starter code</label>
                <textarea value={data.code||""} onChange={e=>upd("code",e.target.value)} rows={6}
                  placeholder="# Students will build on this code&#10;neurons = []&#10;"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-mono text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 resize-none transition-all bg-slate-900 text-emerald-400 placeholder:text-slate-600"/>
              </div>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">Instructions for students</label>
                <textarea value={data.instructions||""} onChange={e=>upd("instructions",e.target.value)} rows={3}
                  placeholder="Complete the function that simulates a synapse firing..."
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 resize-none transition-all"/>
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 border-2 border-slate-200 text-slate-600 text-sm font-black rounded-2xl hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <IndigoBtn onClick={save} className="flex-1 justify-center">
            Add to module
          </IndigoBtn>
        </div>
      </div>
    </div>
  );
}

// ── Source Upload Screen ────────────────────────────────────────────────────────

function SourceUploadScreen({onContinue}:{onContinue:()=>void}) {
  const [dragOver,setDragOver]=useState(false);
  const [uploads,setUploads]=useState<{name:string;type:string;status:"done"|"processing"}[]>([]);
  const [showMore,setShowMore]=useState(false);

  const SOURCE_BTNS=[
    {icon:FileText,label:"Powerpoints",   color:"text-orange-500 bg-orange-50 border-orange-200"},
    {icon:FileText,label:"PDF Documents", color:"text-red-500 bg-red-50 border-red-200"},
    {icon:Music,   label:"Audio Files",   color:"text-purple-500 bg-purple-50 border-purple-200"},
    {icon:Video,   label:"Video Files",   color:"text-blue-500 bg-blue-50 border-blue-200"},
    {icon:BookOpen,label:"Import Quizlet",color:"text-indigo-500 bg-indigo-50 border-indigo-200"},
    {icon:Youtube, label:"Youtube Video", color:"text-red-600 bg-red-50 border-red-200"},
  ];
  const MORE_BTNS=[
    {icon:Link2,label:"Website URL",color:"text-teal-500 bg-teal-50 border-teal-200"},
    {icon:Code2,label:"Google Docs",color:"text-green-500 bg-green-50 border-green-200"},
    {icon:Mic,  label:"Voice Note", color:"text-pink-500 bg-pink-50 border-pink-200"},
    {icon:SlidersHorizontal,label:"Notion Page",color:"text-slate-600 bg-slate-50 border-slate-200"},
  ];

  const addUpload=(type:string)=>{
    const names:Record<string,string>={
      "Powerpoints":"Neuroscience_Lecture5.pptx",
      "PDF Documents":"Synapses_Chapter2.pdf",
      "Audio Files":"podcast_episode3.mp3",
      "Video Files":"lecture_recording.mp4",
      "Import Quizlet":"Brain Bee Deck",
      "Youtube Video":"youtube.com/watch?v=...",
    };
    setUploads(p=>[...p,{name:names[type]||type,type,status:"processing"}]);
    setTimeout(()=>setUploads(p=>p.map((u,i)=>i===p.length-1?{...u,status:"done"}:u)),1800);
  };

  const totalDone=uploads.filter(u=>u.status==="done").length;
  const totalProcessing=uploads.filter(u=>u.status==="processing").length;

  return (
    <div className="min-h-screen" style={{backgroundColor:BG}}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-indigo-900 mb-1">Upload your class materials</h1>
          <p className="text-slate-500 font-semibold">LAIC AI will turn them into a full interactive course — modules, explanations, quizzes and all.</p>
        </div>

        <div className="grid grid-cols-[1fr_320px] gap-6">
          {/* Left — upload area */}
          <div className="space-y-4">
            {/* Drag-drop zone */}
            <div
              onDragOver={e=>{e.preventDefault();setDragOver(true);}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);addUpload("PDF Documents");}}
              className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer ${dragOver?"border-indigo-400 bg-indigo-50":"border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/50"}`}>
              {/* Icon cluster */}
              <div className="flex items-end justify-center gap-3 mb-5">
                <div className="w-12 h-14 bg-pink-100 rounded-xl flex items-center justify-center">
                  <Music className="w-6 h-6 text-pink-500"/>
                </div>
                <div className="w-14 h-16 bg-orange-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-7 h-7 text-orange-500"/>
                </div>
                <div className="w-12 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-500"/>
                </div>
              </div>
              <p className="text-lg font-black text-slate-800 mb-1">Upload any files from Class</p>
              <p className="text-sm font-semibold text-slate-400 mb-5">
                <span className="text-indigo-600 font-black cursor-pointer hover:underline">Click to upload</span>
                {" "}or drag and drop files
              </p>
              {/* Source type buttons */}
              <div className="grid grid-cols-2 gap-2 text-left">
                {SOURCE_BTNS.map(s=>(
                  <button key={s.label} onClick={()=>addUpload(s.label)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 border rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.97] ${s.color}`}>
                    <s.icon className="w-4 h-4 shrink-0"/>
                    {s.label}
                  </button>
                ))}
              </div>
              {showMore&&(
                <div className="grid grid-cols-2 gap-2 text-left mt-2">
                  {MORE_BTNS.map(s=>(
                    <button key={s.label} onClick={()=>addUpload(s.label)}
                      className={`flex items-center gap-2.5 px-4 py-2.5 border rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.97] ${s.color}`}>
                      <s.icon className="w-4 h-4 shrink-0"/>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={()=>setShowMore(v=>!v)}
                className="mt-3 text-sm font-bold text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-1 mx-auto">
                {showMore?"Show fewer types":"View more upload types"}
                <ChevronRight className={`w-4 h-4 transition-transform ${showMore?"rotate-90":""}`}/>
              </button>
            </div>

            {/* Share link */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-indigo-600"/>
              </div>
              <div className="flex-1">
                <p className="font-black text-slate-800 text-sm">Ask classmates to help upload materials</p>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">Share this link so collaborators can add study materials</p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-black rounded-xl hover:bg-indigo-100 transition-colors shrink-0">
                <Link2 className="w-3.5 h-3.5"/>
                Copy Link
              </button>
            </div>
          </div>

          {/* Right — info + recent uploads */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-black text-slate-900 text-base mb-4">We will turn it into Digestible Study Materials</h3>
              <div className="space-y-3">
                {[
                  {icon:BookOpen,color:"bg-indigo-100 text-indigo-600",title:"Study Materials",desc:"Flashcards, Quizzes, games and more."},
                  {icon:TrendingUp,color:"bg-emerald-100 text-emerald-600",title:"Plans & Progress Tracking",desc:"A Study Plan based off your exact class"},
                  {icon:Brain,color:"bg-violet-100 text-violet-600",title:"AI Tutor (Navi)",desc:"Answers questions from your material only"},
                ].map(item=>(
                  <div key={item.title} className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center shrink-0`}>
                      <item.icon className="w-4.5 h-4.5"/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{item.title}</p>
                      <p className="text-xs font-semibold text-slate-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent uploads */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-black text-slate-800 text-sm">Recent Uploads</p>
                <div className="flex gap-1">
                  {["All","Processing","Done","Failed"].map(s=>(
                    <span key={s} className={`text-[10px] font-black px-2 py-1 rounded-lg cursor-pointer transition-colors ${s==="All"?"bg-indigo-100 text-indigo-700":"text-slate-400 hover:bg-slate-100"}`}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              {uploads.length===0?(
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                      <FileText className="w-4.5 h-4.5 text-slate-400"/>
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-600">{totalProcessing} processing</p>
                      <p className="text-xs font-semibold text-slate-400">{totalDone} completed</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-slate-200">0</p>
                  </div>
                </div>
              ):(
                <div className="space-y-2">
                  {uploads.map((u,i)=>(
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${u.status==="done"?"bg-emerald-400":"bg-amber-400 animate-pulse"}`}/>
                      <p className="text-xs font-semibold text-slate-700 flex-1 truncate">{u.name}</p>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${u.status==="done"?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>
                        {u.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Continue button */}
            <IndigoBtn onClick={onContinue} className="w-full justify-center">
              Generate course structure <ArrowRight className="w-4 h-4"/>
            </IndigoBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Instructor Create Screen ───────────────────────────────────────────────

function InstructorCreateScreen() {
  const [editorStep,setEditorStep]=useState<"upload"|"build">("upload");
  const [currentModule,setCurrentModule]=useState(0);
  const [moduleBlocks,setModuleBlocks]=useState<Record<number,BlockData[]>>({});
  const [activeBlockModal,setActiveBlockModal]=useState<string|null>(null);

  const addBlock=(data:BlockData)=>setModuleBlocks(p=>({...p,[currentModule]:[...(p[currentModule]||[]),data]}));
  const removeBlock=(i:number)=>setModuleBlocks(p=>({...p,[currentModule]:(p[currentModule]||[]).filter((_,j)=>j!==i)}));
  const currentBlocks=moduleBlocks[currentModule]||[];
  const builtCount=GENERATED_MODULES.filter((_,i)=>(moduleBlocks[i]||[]).length>0).length;

  if(editorStep==="upload") return <SourceUploadScreen onContinue={()=>setEditorStep("build")}/>;

  return (
    <>
      {/* Block config modal */}
      {activeBlockModal&&(
        <BlockModal type={activeBlockModal} onSave={addBlock} onClose={()=>setActiveBlockModal(null)}/>
      )}

      <div className="flex" style={{backgroundColor:BG, minHeight:"calc(100vh - 57px)"}}>
        {/* Left: Structure */}
        <div className="w-[240px] shrink-0 bg-white border-r border-indigo-50 flex flex-col p-5 overflow-y-auto [scrollbar-width:none]"
          style={{position:"sticky",top:57,height:"calc(100vh - 57px)"}}>
          <h2 className="text-lg font-black text-indigo-900 mb-5">Structure</h2>
          <div className="space-y-1.5">
            {GENERATED_MODULES.map((mod,i)=>(
              <button key={mod.id} onClick={()=>setCurrentModule(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all ${currentModule===i?"bg-indigo-50 text-indigo-700":"hover:bg-slate-50 text-slate-600"}`}>
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${currentModule===i?"bg-indigo-500 text-white":"bg-slate-100 text-slate-400"}`}>
                  {String(i+1).padStart(2,"0")}
                </div>
                <span className={`text-xs font-bold truncate ${currentModule===i?"text-indigo-700":"text-slate-600"}`}>{mod.name}</span>
                {(moduleBlocks[i]||[]).length>0&&<div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 shrink-0"/>}
              </button>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5"><span>Built</span><span>{builtCount}/{GENERATED_MODULES.length}</span></div>
            <ProgressBar value={(builtCount/GENERATED_MODULES.length)*100}/>
          </div>
          <button onClick={()=>setEditorStep("upload")}
            className="mt-4 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1">
            <ArrowRight className="w-3 h-3 rotate-180"/> Add more sources
          </button>
        </div>

        {/* Center: Module canvas */}
        <div className="flex-1 flex flex-col items-center p-8">
          <div className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <div>
                <Pill color="indigo">Module {currentModule+1} of {GENERATED_MODULES.length}</Pill>
                <h2 className="text-2xl font-black text-indigo-900 mt-2">{GENERATED_MODULES[currentModule].name}</h2>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setCurrentModule(m=>Math.max(0,m-1))} disabled={currentModule===0}
                  className="w-9 h-9 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-400 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-30 transition-all">
                  <ArrowRight className="w-4 h-4 rotate-180"/>
                </button>
                <button onClick={()=>setCurrentModule(m=>Math.min(GENERATED_MODULES.length-1,m+1))} disabled={currentModule===GENERATED_MODULES.length-1}
                  className="w-9 h-9 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-400 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-30 transition-all">
                  <ArrowRight className="w-4 h-4"/>
                </button>
              </div>
            </div>

            {/* Blocks canvas */}
            {currentBlocks.length===0?(
              <div className="border-2 border-dashed border-slate-200 rounded-3xl py-16 text-center bg-white/50">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-7 h-7 text-slate-300"/>
                </div>
                <p className="font-black text-slate-400">No blocks yet</p>
                <p className="text-xs font-semibold text-slate-300 mt-1">Click a block type on the right to add content</p>
              </div>
            ):(
              <div className="space-y-3">
                {currentBlocks.map((block,i)=>{
                  const bt=BLOCK_TYPES.find(b=>b.type===block.type)!;
                  return (
                    <div key={i} className="flex items-start gap-3 bg-white rounded-2xl border border-slate-200 p-4 group hover:border-indigo-200 transition-all">
                      <div className={`w-9 h-9 rounded-xl ${bt?.color||"bg-indigo-500"} flex items-center justify-center shrink-0 mt-0.5`}>
                        {bt&&<bt.icon className="w-4.5 h-4.5 text-white"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800">{block.type}</p>
                        <p className="text-xs font-semibold text-slate-400 truncate">
                          {block.videoUrl||block.title||block.question||block.prompt||block.audioUrl||"Configured"}
                        </p>
                      </div>
                      <button onClick={()=>removeBlock(i)}
                        className="text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                        <X className="w-4 h-4"/>
                      </button>
                    </div>
                  );
                })}
                <button onClick={()=>setActiveBlockModal(null)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-sm font-black text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4"/> Add another block
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Block palette — click opens modal */}
        <div className="w-[200px] shrink-0 bg-white border-l border-indigo-50 flex flex-col p-5 overflow-y-auto [scrollbar-width:none]"
          style={{position:"sticky",top:57,height:"calc(100vh - 57px)"}}>
          <h2 className="text-lg font-black text-indigo-900 mb-1">Blocks</h2>
          <p className="text-xs font-semibold text-slate-400 mb-4">Click to configure & add</p>
          <div className="space-y-2.5">
            {BLOCK_TYPES.map(bt=>(
              <button key={bt.type} onClick={()=>setActiveBlockModal(bt.type)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 hover:border-indigo-200 hover:bg-indigo-50 transition-all active:scale-95 group text-left">
                <div className={`w-9 h-9 rounded-xl ${bt.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                  <bt.icon className="w-4.5 h-4.5 text-white"/>
                </div>
                <span className="text-xs font-black text-slate-600 group-hover:text-indigo-700 leading-tight">{bt.type}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-auto shrink-0 group-hover:text-indigo-400 transition-colors"/>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Teacher Dashboard ────────────────────────────────────────────────────────

function TeacherDashboardScreen({setScreen}:{setScreen:(s:Screen)=>void}) {
  const [sortBy, setSortBy] = useState<"name"|"concept"|"active">("concept");

  const gradebook = [
    {name:"Jordan M.", initials:"JM", weakest:"Action Potential", lastActive:"3 days ago", activeColor:"text-red-500",   status:"behind"},
    {name:"Sam P.",    initials:"SP", weakest:"Brain Regions",    lastActive:"2 days ago", activeColor:"text-red-500",   status:"behind"},
    {name:"Alex K.",   initials:"AK", weakest:"Synapses",         lastActive:"Yesterday",  activeColor:"text-amber-500", status:"behind"},
    {name:"Jamie L.",  initials:"JL", weakest:"Neurotransmitters",lastActive:"Today",      activeColor:"text-emerald-500",status:"ok"},
    {name:"Riley T.",  initials:"RT", weakest:"—",                lastActive:"Today",      activeColor:"text-emerald-500",status:"ok"},
    {name:"Morgan S.", initials:"MS", weakest:"—",                lastActive:"Today",      activeColor:"text-emerald-500",status:"ok"},
  ];

  const sorted = [...gradebook].sort((a,b)=>{
    if(sortBy==="name")    return a.name.localeCompare(b.name);
    if(sortBy==="concept") return a.weakest.localeCompare(b.weakest);
    if(sortBy==="active")  return a.lastActive.localeCompare(b.lastActive);
    return 0;
  });

  const SortBtn=({col,label}:{col:"name"|"concept"|"active";label:string})=>(
    <button onClick={()=>setSortBy(col)}
      className={`text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1 ${sortBy===col?"text-indigo-700":"text-slate-400 hover:text-slate-600"}`}>
      {label}
      {sortBy===col&&<span className="text-indigo-400">↓</span>}
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5" style={{backgroundColor:BG}}>

      {/* 1. Who's showing up */}
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
        <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse"/>
        <p className="text-sm font-bold text-amber-800 flex-1">
          2 students haven't logged in this week — Jordan M. and Sam P.
        </p>
        <button className="text-xs font-black text-amber-700 border border-amber-300 px-3 py-1.5 rounded-xl hover:bg-amber-100 transition-colors shrink-0">
          Send reminder
        </button>
      </div>

      {/* 2. Who's behind — the gradebook table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-black text-slate-900">Student gradebook</p>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">Brain Bee · 6 students · Click a column to sort</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-5 py-3"><SortBtn col="name" label="Student"/></th>
                <th className="text-left px-4 py-3"><SortBtn col="concept" label="Weakest concept"/></th>
                <th className="text-left px-4 py-3"><SortBtn col="active" label="Last active"/></th>
                <th className="px-4 py-3"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map((s,i)=>(
                <tr key={s.name} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-black text-indigo-700 shrink-0">
                        {s.initials}
                      </div>
                      <p className="text-sm font-black text-slate-800">{s.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {s.weakest!=="—" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400"/>
                        {s.weakest}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-300">On track</span>
                    )}
                  </td>
                  <td className={`px-4 py-3.5 text-sm font-bold ${s.activeColor}`}>
                    {s.lastActive}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {s.status==="behind"&&(
                      <button onClick={()=>setScreen("instructor-create")}
                        className="text-xs font-black text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors flex items-center gap-1 ml-auto">
                        <Edit2 className="w-3 h-3"/> Fix concept
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 3. What's confusing them — misconceptions, exactly as is */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-black text-slate-900">Misconceptions</p>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">Detected from wrong quiz answers and AI chat patterns</p>
          </div>
          <Pill color="pink">3 new</Pill>
        </div>
        <div className="divide-y divide-slate-50">
          {[
            {concept:"Synapses",       issue:"Confusing axon terminal with dendrite", students:4, high:true},
            {concept:"Action Potential",issue:"Thinking myelin generates the signal",  students:2, high:false},
            {concept:"Brain Regions",  issue:"Mixing up cerebellum and cortex roles",  students:6, high:true},
          ].map((m,i)=>(
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className={`w-2 h-2 rounded-full shrink-0 ${m.high?"bg-red-400":"bg-amber-400"}`}/>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-800">{m.issue}</p>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">{m.concept} · {m.students} students</p>
              </div>
              <button onClick={()=>setScreen("instructor-create")}
                className="text-xs font-black text-indigo-500 bg-indigo-50 rounded-xl px-3 py-1.5 hover:bg-indigo-100 transition-colors shrink-0 flex items-center gap-1">
                <Edit2 className="w-3 h-3"/> Fix
              </button>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}

// ─── Instructor Home ──────────────────────────────────────────────────────────

function InstructorHomeScreen({setScreen}:{setScreen:(s:Screen)=>void}) {
  // Students sorted by how far behind they are (lowest mastery score first)
  const studentList = [
    {name:"Jordan M.", stuck:"Action Potential", lastSeen:"3 days ago",  score:1, initials:"JM", color:"#EF4444"},
    {name:"Sam P.",    stuck:"Brain Regions",    lastSeen:"2 days ago",  score:2, initials:"SP", color:"#F97316"},
    {name:"Alex K.",   stuck:"Synapses",         lastSeen:"Yesterday",   score:3, initials:"AK", color:"#EAB308"},
    {name:"Jamie L.",  stuck:"Neurotransmitters",lastSeen:"Today",       score:4, initials:"JL", color:"#6366F1"},
    {name:"Riley T.",  stuck:"—",                lastSeen:"Today",       score:5, initials:"RT", color:"#10B981"},
    {name:"Morgan S.", stuck:"—",                lastSeen:"Today",       score:5, initials:"MS", color:"#10B981"},
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5" style={{backgroundColor:BG}}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 font-semibold text-sm">Good morning</p>
          <h1 className="text-2xl font-black text-indigo-900">Dr. Ashwini</h1>
        </div>
        <IndigoBtn onClick={()=>setScreen("instructor-create")}>
          <Plus className="w-4 h-4"/> Add module
        </IndigoBtn>
      </div>

      {/* Alert — the one thing a teacher will act on */}
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
        <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse"/>
        <p className="text-sm font-bold text-amber-800">
          2 students haven't logged in this week —{" "}
          <button className="underline underline-offset-2 hover:text-amber-900">Jordan M. and Sam P.</button>
        </p>
      </div>

      {/* Stat cards — keep, they're glanceable */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {label:"Students enrolled", value:"24", icon:Users,      color:"bg-indigo-500"},
          {label:"Concepts published",value:"12", icon:BookOpen,   color:"bg-violet-500"},
          {label:"Active this week",  value:"22", icon:TrendingUp, color:"bg-emerald-500"},
        ].map(s=>(
          <Card key={s.label} className="p-5 flex items-center gap-4">
            <div className={`w-10 h-10 ${s.color} rounded-xl flex items-center justify-center shrink-0`}>
              <s.icon className="w-5 h-5 text-white"/>
            </div>
            <div>
              <div className="text-2xl font-black text-indigo-900">{s.value}</div>
              <div className="text-xs font-bold text-slate-400">{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Students sorted by who's furthest behind */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-black text-slate-900">Who needs attention</p>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">Sorted by mastery — furthest behind first</p>
          </div>
          <button onClick={()=>setScreen("instructor-dashboard")}
            className="text-sm font-bold text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-1">
            Full analytics <ChevronRight className="w-4 h-4"/>
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          {studentList.map((s,i)=>(
            <div key={s.name} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              {/* Rank */}
              <span className="text-xs font-black text-slate-300 w-4 shrink-0">{i+1}</span>
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
                style={{backgroundColor:s.color}}>
                {s.initials}
              </div>
              {/* Name */}
              <p className="font-bold text-slate-800 text-sm w-28 shrink-0">{s.name}</p>
              {/* Stuck on */}
              <div className="flex-1">
                {s.stuck!=="—" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400"/>
                    Stuck on {s.stuck}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-300">On track</span>
                )}
              </div>
              {/* Last active */}
              <p className="text-xs font-semibold text-slate-400 shrink-0 w-24 text-right">{s.lastSeen}</p>
              {/* Quick action */}
              {s.stuck!=="—"&&(
                <button onClick={()=>setScreen("instructor-create")}
                  className="text-xs font-black text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors shrink-0 flex items-center gap-1">
                  <Edit2 className="w-3 h-3"/> Fix
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}


// ─── Cat Mascot (Navi) ────────────────────────────────────────────────────────

function CatMascot({size=120,className=""}:{size?:number;className?:string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" className={className} aria-label="Navi the LAIC mascot cat">
      <style>{`
        @keyframes catBob   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes earWigL  { 0%,90%,100%{transform:rotate(0deg)} 95%{transform:rotate(-8deg)} }
        @keyframes earWigR  { 0%,90%,100%{transform:rotate(0deg)} 95%{transform:rotate(8deg)} }
        @keyframes tailSwing{ 0%,100%{transform:rotate(-15deg)} 50%{transform:rotate(15deg)} }
        @keyframes glassSwing{ 0%,100%{transform:rotate(-3deg)} 50%{transform:rotate(3deg)} }
        .cat-body  { animation: catBob 2.8s ease-in-out infinite; transform-origin:100px 140px; }
        .ear-left  { animation: earWigL 4s ease-in-out infinite; transform-origin:55px 55px; }
        .ear-right { animation: earWigR 4.3s ease-in-out infinite; transform-origin:145px 55px; }
        .glass-grp { animation: glassSwing 3s ease-in-out infinite; transform-origin:118px 108px; }
      `}</style>

      {/* Dark circle background */}
      <circle cx="100" cy="100" r="97" fill="#111827"/>

      {/* Body group — bobs */}
      <g className="cat-body">
        {/* Left ear */}
        <g className="ear-left">
          <polygon points="42,82 52,38 80,68" fill="#9B72CF"/>
          <polygon points="50,76 57,46 74,67" fill="#C084FC"/>
        </g>
        {/* Right ear */}
        <g className="ear-right">
          <polygon points="158,82 148,38 120,68" fill="#9B72CF"/>
          <polygon points="150,76 143,46 126,67" fill="#C084FC"/>
        </g>

        {/* Head/body — large round */}
        <ellipse cx="100" cy="116" rx="68" ry="63" fill="#9B72CF"/>
        {/* Subtle lighter belly */}
        <ellipse cx="100" cy="132" rx="44" ry="36" fill="#B08FE0" opacity="0.4"/>

        {/* Left eye */}
        <circle cx="78" cy="106" r="19" fill="white"/>
        <circle cx="80" cy="107" r="10" fill="#1a1a1a"/>
        <circle cx="84" cy="102" r="4" fill="white"/>
        {/* Blink layer — covers left eye */}
        <ellipse cx="78" cy="106" rx="19" ry="2" fill="#9B72CF" opacity="0">
          <animate attributeName="ry" values="2;19;2" dur="0.25s" begin="3s;7.5s;13s;19s" fill="freeze"/>
          <animate attributeName="opacity" values="1;1;1" dur="0.25s" begin="3s;7.5s;13s;19s" fill="freeze"/>
        </ellipse>

        {/* Magnifying glass group */}
        <g className="glass-grp">
          {/* Glass rim */}
          <circle cx="118" cy="108" r="24" fill="white" stroke="#555" strokeWidth="5"/>
          {/* Glass interior */}
          <circle cx="118" cy="108" r="19" fill="#E8EAFF" opacity="0.6"/>
          {/* Right pupil (magnified) */}
          <circle cx="121" cy="109" r="11" fill="#1a1a1a"/>
          <circle cx="115" cy="103" r="5" fill="white" opacity="0.9"/>
          {/* Handle */}
          <rect x="133" y="124" width="9" height="26" rx="4.5" fill="#555" transform="rotate(35,133,124)"/>
          {/* Arm holding glass */}
          <path d="M108 128 Q126 132 137 126" stroke="#7C5CA8" strokeWidth="6" fill="none" strokeLinecap="round"/>
        </g>

        {/* Nose */}
        <path d="M96 128 Q100 133 104 128 Q100 135 96 128Z" fill="#6B3FA0"/>
        {/* Mouth */}
        <path d="M92 137 Q100 144 108 137" stroke="#6B3FA0" strokeWidth="2" fill="none" strokeLinecap="round"/>
        {/* Left cheek blush */}
        <ellipse cx="62" cy="128" rx="10" ry="7" fill="#EC4899" opacity="0.3"/>
        {/* Right cheek blush */}
        <ellipse cx="138" cy="128" rx="10" ry="7" fill="#EC4899" opacity="0.3"/>
      </g>
    </svg>
  );
}

// ─── Mini Cat (sidebar / corner) ─────────────────────────────────────────────

function CatMini({size=48}:{size?:number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-label="Navi">
      <circle cx="100" cy="100" r="97" fill="#111827"/>
      <g style={{animation:"catBob 2.8s ease-in-out infinite",transformOrigin:"100px 140px"}}>
        <polygon points="42,82 52,38 80,68" fill="#9B72CF"/>
        <polygon points="50,76 57,46 74,67" fill="#C084FC"/>
        <polygon points="158,82 148,38 120,68" fill="#9B72CF"/>
        <polygon points="150,76 143,46 126,67" fill="#C084FC"/>
        <ellipse cx="100" cy="116" rx="68" ry="63" fill="#9B72CF"/>
        <circle cx="78" cy="106" r="19" fill="white"/>
        <circle cx="80" cy="107" r="10" fill="#1a1a1a"/>
        <circle cx="84" cy="102" r="4" fill="white"/>
        <circle cx="118" cy="108" r="22" fill="white" stroke="#555" strokeWidth="5"/>
        <circle cx="121" cy="109" r="11" fill="#1a1a1a"/>
        <circle cx="115" cy="103" r="4" fill="white" opacity="0.9"/>
        <rect x="133" y="124" width="9" height="22" rx="4.5" fill="#555" transform="rotate(35,133,124)"/>
        <path d="M96 128 Q100 133 104 128 Q100 135 96 128Z" fill="#6B3FA0"/>
        <path d="M92 137 Q100 144 108 137" stroke="#6B3FA0" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <ellipse cx="62" cy="128" rx="9" ry="6" fill="#EC4899" opacity="0.3"/>
        <ellipse cx="138" cy="128" rx="9" ry="6" fill="#EC4899" opacity="0.3"/>
      </g>
    </svg>
  );
}

// ─── Isometric Education Illustration ────────────────────────────────────────

function IsometricIllustration() {
  return (
    <svg viewBox="0 0 460 400" className="w-full max-w-lg" aria-label="Isometric education illustration">
      <style>{`
        @keyframes bookFloat  { 0%,100%{transform:translateY(0)}   50%{transform:translateY(-10px)} }
        @keyframes capFloat   { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-14px) rotate(-3deg)} }
        @keyframes tasselSwg  { 0%,100%{transform:rotate(-15deg)} 50%{transform:rotate(15deg)} }
        @keyframes flaskFloat { 0%,100%{transform:translateY(0)}   50%{transform:translateY(-8px)} }
        @keyframes bubbleUp   { 0%{opacity:0;transform:translateY(0) scale(0.5)} 50%{opacity:1} 100%{opacity:0;transform:translateY(-30px) scale(1)} }
        @keyframes speechBob  { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-8px) scale(1.04)} }
        @keyframes docFloat   { 0%,100%{transform:translateY(0) rotate(-5deg)} 50%{transform:translateY(-6px) rotate(-3deg)} }
        @keyframes sparkle    { 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1)} }
        .books-g    { animation: bookFloat  3.2s ease-in-out infinite; transform-origin:230px 280px; }
        .cap-g      { animation: capFloat   3.6s ease-in-out infinite 0.4s; transform-origin:230px 200px; }
        .tassel     { animation: tasselSwg  2s   ease-in-out infinite; transform-origin:278px 198px; }
        .flask-g    { animation: flaskFloat 2.8s ease-in-out infinite 0.6s; transform-origin:330px 300px; }
        .speech-g   { animation: speechBob  2.2s ease-in-out infinite; transform-origin:340px 160px; }
        .doc-g      { animation: docFloat   3.8s ease-in-out infinite 0.2s; transform-origin:120px 310px; }
        .bub1 { animation: bubbleUp 2.4s ease-in-out infinite 0.3s; }
        .bub2 { animation: bubbleUp 2.4s ease-in-out infinite 0.9s; }
        .bub3 { animation: bubbleUp 2.4s ease-in-out infinite 1.5s; }
        .sp1  { animation: sparkle  1.8s ease-in-out infinite 0s; }
        .sp2  { animation: sparkle  1.8s ease-in-out infinite 0.6s; }
        .sp3  { animation: sparkle  1.8s ease-in-out infinite 1.2s; }
      `}</style>

      {/* Document / diploma */}
      <g className="doc-g">
        <rect x="72" y="278" width="108" height="82" rx="6" fill="#FEE2E2" transform="rotate(-8,72,278)"/>
        <rect x="84" y="268" width="108" height="82" rx="6" fill="#fff" stroke="#FCA5A5" strokeWidth="1.5" transform="rotate(-8,84,268)"/>
        {/* Lines on doc */}
        <line x1="96" y1="295" x2="170" y2="288" stroke="#C4B5FD" strokeWidth="2.5" strokeLinecap="round" transform="rotate(-8,96,295)"/>
        <line x1="96" y1="308" x2="165" y2="301" stroke="#C4B5FD" strokeWidth="2"   strokeLinecap="round" transform="rotate(-8,96,308)"/>
        <line x1="96" y1="321" x2="155" y2="315" stroke="#C4B5FD" strokeWidth="2"   strokeLinecap="round" transform="rotate(-8,96,321)"/>
        {/* Seal */}
        <circle cx="105" cy="338" r="10" fill="#F87171" transform="rotate(-8,105,338)"/>
        {/* Paperclip 1 */}
        <path d="M148 264 Q156 256 162 264 Q168 272 160 278 Q152 284 146 278" stroke="#FCD34D" strokeWidth="3" fill="none" strokeLinecap="round" transform="rotate(-8,148,264)"/>
        {/* Paperclip 2 */}
        <path d="M166 272 Q174 264 180 272 Q186 280 178 286 Q170 292 164 286" stroke="#FCD34D" strokeWidth="3" fill="none" strokeLinecap="round" transform="rotate(-8,166,272)"/>
      </g>

      {/* Books stack */}
      <g className="books-g">
        {/* Bottom book — blue */}
        <rect x="152" y="270" width="160" height="28" rx="4" fill="#818CF8"/>
        <rect x="152" y="270" width="160" height="6"  rx="2" fill="#6366F1"/>
        <rect x="292" y="270" width="20" height="28" rx="0 4 4 0" fill="#4F46E5"/>
        {/* Middle book — gold/yellow */}
        <rect x="158" y="246" width="150" height="28" rx="4" fill="#FCD34D"/>
        <rect x="158" y="246" width="150" height="6"  rx="2" fill="#F59E0B"/>
        <rect x="294" y="246" width="14" height="28" rx="0 4 4 0" fill="#D97706"/>
        {/* Top book — white */}
        <rect x="163" y="224" width="138" height="26" rx="4" fill="#F1F5F9"/>
        <rect x="163" y="224" width="138" height="6"  rx="2" fill="#E2E8F0"/>
        <rect x="287" y="224" width="14" height="26" rx="0 4 4 0" fill="#CBD5E1"/>
        {/* Bookmark ribbon */}
        <path d="M232 298 L232 318 L238 312 L244 318 L244 298Z" fill="#EF4444"/>
      </g>

      {/* Graduation cap */}
      <g className="cap-g">
        {/* Cap top/board */}
        <ellipse cx="232" cy="218" rx="76" ry="18" fill="#1E3A5F"/>
        {/* Cap crown */}
        <path d="M190 218 Q192 200 232 194 Q272 200 274 218Z" fill="#1E3A5F"/>
        {/* Cap top shine */}
        <ellipse cx="232" cy="218" rx="76" ry="18" fill="none" stroke="#2D5A8F" strokeWidth="2"/>
        {/* Gold button */}
        <circle cx="232" cy="194" r="6" fill="#FCD34D"/>
        {/* Tassel cord */}
        <g className="tassel">
          <line x1="280" y1="194" x2="296" y2="210" stroke="#FCD34D" strokeWidth="2.5"/>
          <path d="M292 208 Q302 220 296 238" stroke="#FCD34D" strokeWidth="2.5" fill="none"/>
          {/* Tassel end */}
          <rect x="290" y="238" width="12" height="20" rx="6" fill="#FCD34D"/>
        </g>
      </g>

      {/* Chemistry flask */}
      <g className="flask-g">
        {/* Flask body */}
        <path d="M300 248 L300 290 Q300 328 330 332 Q360 336 370 316 Q380 296 374 260 L340 260 L340 248Z" fill="url(#flaskGrad)"/>
        <defs>
          <linearGradient id="flaskGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FB923C"/>
            <stop offset="100%" stopColor="#FCD34D"/>
          </linearGradient>
        </defs>
        {/* Flask neck */}
        <rect x="308" y="228" width="32" height="22" rx="4" fill="#FB923C"/>
        {/* Flask neck top */}
        <ellipse cx="324" cy="228" rx="16" ry="5" fill="#FED7AA"/>
        {/* Flask bottom disc */}
        <ellipse cx="338" cy="332" rx="34" ry="10" fill="#1E3A5F"/>
        {/* Liquid highlight */}
        <path d="M310 295 Q320 285 345 295" stroke="rgba(255,255,255,0.4)" strokeWidth="3" fill="none" strokeLinecap="round"/>
        {/* Bubbles */}
        <circle cx="322" cy="280" r="5" fill="#FEF3C7" opacity="0" className="bub1"/>
        <circle cx="338" cy="300" r="4" fill="#FEF3C7" opacity="0" className="bub2"/>
        <circle cx="328" cy="265" r="3" fill="#FEF3C7" opacity="0" className="bub3"/>
      </g>

      {/* Speech bubble */}
      <g className="speech-g">
        <rect x="296" y="132" width="100" height="52" rx="14" fill="#EF4444"/>
        {/* Tail */}
        <path d="M318 184 L304 202 L332 186Z" fill="#EF4444"/>
        {/* Dots */}
        <circle cx="321" cy="158" r="5" fill="white"/>
        <circle cx="340" cy="158" r="5" fill="white"/>
        <circle cx="359" cy="158" r="5" fill="white"/>
      </g>

      {/* Sparkle dots near flask */}
      <circle cx="295" cy="238" r="5" fill="#FCD34D" className="sp1"/>
      <circle cx="308" cy="222" r="4" fill="#FCD34D" className="sp2"/>
      <circle cx="282" cy="252" r="3" fill="#FCD34D" className="sp3"/>
    </svg>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

function LandingPage({setScreen}:{setScreen:(s:Screen)=>void}) {
  const [featOpen, setFeatOpen] = useState(false);
  const [mounted, setMounted]   = useState(false);

  useEffect(()=>{
    const t = setTimeout(()=>setMounted(true), 60);
    return ()=>clearTimeout(t);
  },[]);

  const features = [
    {icon:"🧠", label:"AI Tutor",          desc:"Socratic guidance, never spoils answers"},
    {icon:"📊", label:"Mastery Tracking",   desc:"Bayesian Knowledge Tracing per concept"},
    {icon:"✏️",  label:"Course Editor",     desc:"Drag-and-drop blocks, AI-drafted content"},
    {icon:"📈", label:"Analytics",          desc:"Heatmaps, misconception logs, engagement"},
  ];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden" style={FONT}>
      <style>{`
        @keyframes catBob   { 0%,100%{transform:translateY(0)}   50%{transform:translateY(-6px)} }
        @keyframes heroBg   { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes popIn    { from{opacity:0;transform:scale(0.88)} to{opacity:1;transform:scale(1)} }
        @keyframes floatBall{ 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-18px) rotate(8deg)} }
        @keyframes orbit    { 0%{transform:rotate(0deg) translateX(110px) rotate(0deg)} 100%{transform:rotate(360deg) translateX(110px) rotate(-360deg)} }
        .lp-h1  { animation: fadeUp  0.7s ease both 0.1s; }
        .lp-p   { animation: fadeUp  0.7s ease both 0.25s; }
        .lp-btns{ animation: fadeUp  0.7s ease both 0.4s; }
        .lp-ill { animation: popIn   0.9s ease both 0.3s; }
        .lp-cat { animation: popIn   0.9s ease both 0.5s; }
        .feat-drop{ animation: fadeUp 0.22s ease both; }
        .orbit-dot{ animation: orbit 7s linear infinite; }
        .orbit-dot2{ animation: orbit 10s linear infinite reverse 1s; }
      `}</style>

      {/* ── Fixed header ───────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
              <Brain className="w-4 h-4 text-white"/>
            </div>
            <span className="text-lg font-black text-indigo-900">LAIC</span>
          </div>

          <nav className="flex items-center gap-1 flex-1">
            {/* Features dropdown */}
            <div className="relative">
              <button
                onMouseEnter={()=>setFeatOpen(true)}
                onMouseLeave={()=>setFeatOpen(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 hover:text-indigo-700 transition-all">
                Features
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="transition-transform" style={{transform:featOpen?"rotate(180deg)":"rotate(0)"}}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {featOpen && (
                <div
                  onMouseEnter={()=>setFeatOpen(true)}
                  onMouseLeave={()=>setFeatOpen(false)}
                  className="feat-drop absolute top-full left-0 mt-1 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden p-2">
                  {features.map(f=>(
                    <button key={f.label} className="w-full flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 text-left transition-colors">
                      <span className="text-xl mt-0.5">{f.icon}</span>
                      <div>
                        <p className="text-sm font-black text-indigo-900">{f.label}</p>
                        <p className="text-xs font-semibold text-gray-400 mt-0.5">{f.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 hover:text-indigo-700 transition-all">
              About Us
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button onClick={()=>setScreen("login")}
              className="px-5 py-2 text-sm font-black text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
              Login
            </button>
            <button onClick={()=>setScreen("login")}
              className="px-5 py-2.5 text-sm font-black text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.97]"
              style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
              Start for Free
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
        {/* Gradient background blob */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full opacity-10"
            style={{background:"radial-gradient(circle,#6366F1,transparent)",filter:"blur(80px)"}}/>
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-10"
            style={{background:"radial-gradient(circle,#EC4899,transparent)",filter:"blur(80px)"}}/>
          {/* Orbiting dots */}
          <div className="absolute top-1/2 right-1/3 w-4 h-4 rounded-full bg-indigo-400/30 orbit-dot"/>
          <div className="absolute top-1/2 right-1/3 w-3 h-3 rounded-full bg-pink-400/30 orbit-dot2"/>
        </div>

        <div className="max-w-6xl mx-auto px-6 w-full">
          <div className="flex items-center gap-12">
            {/* Left — copy */}
            <div className="flex-1 max-w-xl">
              <div className="lp-h1">
                <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 mb-6">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"/>
                  <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">AI-Powered Learning</span>
                </div>
                <h1 className="text-5xl font-black text-gray-900 leading-tight mb-4">
                  Study smarter.<br/>
                  <span style={{background:"linear-gradient(135deg,#6366F1,#EC4899)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>
                    Master everything.
                  </span>
                </h1>
              </div>
              <p className="lp-p text-lg font-semibold text-gray-500 mb-8 leading-relaxed">
                LAIC is your AI tutor that adapts to how you think — guiding you from first exposure to complete mastery, one concept at a time.
              </p>
              <div className="lp-btns flex items-center gap-4 flex-wrap">
                <button onClick={()=>setScreen("login")}
                  className="px-7 py-3.5 text-base font-black text-white rounded-2xl shadow-lg shadow-indigo-200 hover:opacity-90 active:scale-[0.97] transition-all"
                  style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
                  Start learning free
                </button>
                <button onClick={()=>setScreen("login")}
                  className="flex items-center gap-2 px-6 py-3.5 text-base font-black text-gray-700 border-2 border-gray-200 rounded-2xl hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                  <Play className="w-4 h-4 fill-current text-indigo-500"/> Watch demo
                </button>
              </div>
              {/* Social proof */}
              <div className="flex items-center gap-4 mt-8">
                <div className="flex -space-x-2">
                  {["#6366F1","#8B5CF6","#EC4899","#10B981","#F59E0B"].map((c,i)=>(
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white"
                      style={{backgroundColor:c}}>
                      {["A","J","S","R","M"][i]}
                    </div>
                  ))}
                </div>
                <p className="text-sm font-bold text-gray-500">
                  <strong className="text-gray-900">2,400+</strong> students already learning
                </p>
              </div>
            </div>

            {/* Right — illustration + cat */}
            <div className="hidden lg:flex flex-1 items-center justify-center relative">
              {/* Illustration */}
              <div className="lp-ill relative z-10">
                <IsometricIllustration/>
              </div>
              {/* Cat mascot — floats over illustration */}
              <div className="lp-cat absolute -bottom-4 -right-4 z-20">
                <CatMascot size={160}/>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ────────────────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-4 gap-8">
          {[
            {value:"3x",   label:"Faster concept mastery"},
            {value:"92%",  label:"Students improve grades"},
            {value:"50+",  label:"Courses available"},
            {value:"5min", label:"To create a full module"},
          ].map(s=>(
            <div key={s.label} className="text-center">
              <div className="text-3xl font-black mb-1"
                style={{background:"linear-gradient(135deg,#6366F1,#EC4899)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>
                {s.value}
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-black text-gray-900 mb-3">Everything you need to master anything</h2>
          <p className="text-gray-400 font-semibold max-w-xl mx-auto">Built for middle schoolers, high schoolers, and anyone who wants to learn — not just memorise.</p>
        </div>
        <div className="grid grid-cols-2 gap-5">
          {[
            {icon:Brain,    color:"bg-indigo-500", title:"AI Socratic Tutor",     body:"Never gives the answer first — guides you to it with smart questions and 4-level progressive hints."},
            {icon:Target,   color:"bg-emerald-500",title:"Mastery Tracking",      body:"Bayesian Knowledge Tracing maps exactly what you know vs. what you think you know."},
            {icon:Sparkles, color:"bg-pink-500",   title:"AI Course Builder",     body:"Upload your notes — LAIC drafts a full course structure with animations, MCQs, and flashcards."},
            {icon:BarChart2,color:"bg-violet-500", title:"Teacher Dashboard",     body:"Instructors see live misconception logs, engagement timelines, and AI-suggested course improvements."},
          ].map(f=>(
            <div key={f.title} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:border-indigo-100 transition-all group">
              <div className={`w-11 h-11 ${f.color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <f.icon className="w-5 h-5 text-white"/>
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm font-semibold text-gray-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA section with cat ────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto rounded-3xl overflow-hidden relative"
          style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6,#EC4899)"}}>
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white"/>
          </div>
          <div className="relative z-10 px-12 py-14 flex items-center gap-10">
            <div className="flex-1 text-white">
              <h2 className="text-4xl font-black mb-3 leading-tight">Ready to actually understand your subjects?</h2>
              <p className="text-white/70 font-semibold mb-7">Drop your notes. We&apos;ll build your course. Start free — no credit card.</p>
              <div className="flex gap-4">
                <button onClick={()=>setScreen("login")}
                  className="px-7 py-3.5 bg-white font-black rounded-2xl text-indigo-700 hover:bg-white/90 active:scale-[0.97] transition-all">
                  Get started free
                </button>
                <button onClick={()=>setScreen("login")}
                  className="px-7 py-3.5 bg-white/20 text-white font-black rounded-2xl hover:bg-white/30 border border-white/30 transition-all">
                  Log in
                </button>
              </div>
            </div>
            {/* Cat in CTA */}
            <div className="shrink-0 hidden md:block">
              <CatMascot size={160}/>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
              <Brain className="w-4 h-4 text-white"/>
            </div>
            <span className="font-black text-indigo-900">LAIC</span>
          </div>
          <p className="text-xs font-bold text-gray-400">Life in AI Center &copy; 2026. Made with love for learners.</p>
          <div className="flex gap-5 text-xs font-bold text-gray-400">
            <span className="hover:text-indigo-600 cursor-pointer transition-colors">Privacy</span>
            <span className="hover:text-indigo-600 cursor-pointer transition-colors">Terms</span>
            <span className="hover:text-indigo-600 cursor-pointer transition-colors">Contact</span>
          </div>
        </div>
      </footer>
    </div>
  );
}


// ─── Floating AI Chat Bubble ──────────────────────────────────────────────────

function FloatingAIChat() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([
    {role:"assistant" as const, content:"Hi! I'm Navi, your AI tutor. Ask me anything about your course — I won't spoil quiz answers, but I'll guide you there!"},
  ]);
  const [input, setInput]       = useState("");
  const [streaming, setStreaming]= useState(false);
  const [unread, setUnread]     = useState(0);
  const responseIdx              = useRef(0);
  const bottomRef                = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(open) { setUnread(0); }
  },[open]);

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({behavior:"smooth"});
  },[messages,streaming]);

  const send = () => {
    if(!input.trim()||streaming) return;
    const msg = input.trim(); setInput("");
    setMessages(p=>[...p,{role:"user" as const,content:msg}]);
    setStreaming(true);
    const reply = AI_RESPONSES[responseIdx.current % AI_RESPONSES.length];
    responseIdx.current++;
    setTimeout(()=>{
      setMessages(p=>[...p,{role:"assistant" as const,content:reply}]);
      setStreaming(false);
      if(!open) setUnread(u=>u+1);
    },1000);
  };

  const renderText=(text:string)=>text.split("**").map((p,i)=>i%2===1?<strong key={i}>{p}</strong>:<span key={i}>{p}</span>);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <style>{`
        @keyframes slideUpChat  { from{opacity:0;transform:translateY(16px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes bubblePulse  { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.06) translateY(-4px)} }
        @keyframes badgePop     { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }
        .chat-window { animation: slideUpChat 0.22s cubic-bezier(0.34,1.56,0.64,1) both; }
        .navi-bubble { animation: bubblePulse 2.4s ease-in-out infinite; }
        .badge-pop   { animation: badgePop 0.3s ease both; }
      `}</style>

      {/* ── Chat window ──────────────────────────────────────── */}
      {open && (
        <div className="chat-window w-[340px] bg-white rounded-3xl shadow-2xl border border-indigo-100 flex flex-col overflow-hidden"
          style={{height:440}}>

          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 flex items-center gap-2.5 shrink-0">
            <CatMini size={34}/>
            <div className="flex-1">
              <p className="text-sm font-black text-white">Navi — AI Tutor</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400"/>
                <p className="text-[10px] font-bold text-white/70">Online · Context-aware</p>
              </div>
            </div>
            <button onClick={()=>setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors">
              <X className="w-4 h-4"/>
            </button>
          </div>

          {/* Messages — scrolls upward as new ones arrive */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 [scrollbar-width:thin] [scrollbar-color:#e0e7ff_transparent]">
            {messages.map((msg,i)=>(
              <div key={i} className={`flex gap-2 ${msg.role==="user"?"justify-end":"justify-start"}`}>
                {msg.role==="assistant"&&<CatMini size={26}/>}
                <div className={`max-w-[220px] px-3 py-2.5 rounded-2xl text-xs font-semibold leading-relaxed ${
                  msg.role==="user"
                    ?"text-white rounded-br-sm"
                    :"bg-indigo-50 text-indigo-900 rounded-bl-sm"
                }`} style={msg.role==="user"?{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}:{}}>
                  {renderText(msg.content)}
                </div>
              </div>
            ))}
            {streaming&&(
              <div className="flex gap-2">
                <CatMini size={26}/>
                <div className="bg-indigo-50 px-3 py-2.5 rounded-2xl rounded-bl-sm flex gap-1 items-center">
                  {[0,1,2].map(j=><div key={j} className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce" style={{animationDelay:`${j*160}ms`}}/>)}
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Guardrail note */}
          <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-100 shrink-0">
            <p className="text-[10px] font-bold text-amber-600 text-center uppercase tracking-wider flex items-center justify-center gap-1">
              <Lock className="w-2.5 h-2.5"/> Quiz answers guardrailed · Mode switches logged
            </p>
          </div>

          {/* Input */}
          <div className="p-3 border-t border-indigo-50 shrink-0">
            <div className="flex gap-2 items-center bg-indigo-50 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-200 transition-all">
              <input value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
                placeholder="Ask Navi anything..."
                className="flex-1 bg-transparent text-xs font-semibold text-indigo-900 placeholder:text-indigo-300 focus:outline-none"/>
              <button onClick={send} disabled={!input.trim()||streaming}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-white shrink-0 disabled:opacity-40 transition-all"
                style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)"}}>
                <Send className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bubble trigger button ─────────────────────────────── */}
      <div className="relative">
        {/* Unread badge */}
        {unread>0&&!open&&(
          <div className="badge-pop absolute -top-1 -right-1 z-10 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
            <span className="text-[10px] font-black text-white">{unread}</span>
          </div>
        )}
        <button onClick={()=>setOpen(v=>!v)}
          className={`w-14 h-14 rounded-full shadow-xl hover:shadow-2xl transition-all overflow-hidden ${open?"scale-95":"navi-bubble"}`}
          title="Chat with Navi, your AI tutor"
          style={open?{outline:"3px solid #6366F1",outlineOffset:2}:{}}>
          <CatMini size={56}/>
        </button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const {
    screen, setScreen, role, loading, login, logout,
    learner, instructor, saveLearnerOnboarding, saveInstructorOnboarding,
    concepts, activeConceptId,
  } = useApp();

  const handleLogin = async (r: Role, email: string, password: string) => {
    await login(email, password, r);
  };

  const userName = role === "student" ? (learner.name || "Student") : (instructor.name || "Instructor");
  const userInitials = userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:BG,...FONT}}>
        <p className="text-sm font-semibold text-slate-500">Loading LAIC…</p>
      </div>
    );
  }

  if (screen === "landing") return <LandingPage setScreen={setScreen}/>;
  if (screen === "login") return <LoginScreen onLogin={handleLogin}/>;
  if (screen === "student-onboarding") {
    return (
      <StudentOnboarding onDone={async () => {
        await saveLearnerOnboarding().catch(console.error);
        setScreen("student-courses");
      }}/>
    );
  }
  if (screen === "instructor-onboarding") {
    return (
      <InstructorOnboarding onDone={async () => {
        await saveInstructorOnboarding().catch(console.error);
        setScreen("instructor-home");
      }}/>
    );
  }

  const conceptName = concepts.find(c => c.id === activeConceptId)?.name;
  const titles: Partial<Record<Screen, string>> = {
    "student-courses": "Dashboard",
    "student-concept": conceptName ?? "AI Tutor",
    "student-mastery": "My Mastery",
    "student-reflection": "Session Wrap-up",
    "instructor-home": "Overview",
    "instructor-create": "Course Editor",
    "instructor-dashboard": "Analytics",
  };

  return (
    <div style={{...FONT}}>
      <div style={{position:"fixed",left:0,top:0,bottom:0,width:220,zIndex:40,overflowY:"auto"}}
        className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Sidebar
          role={role}
          screen={screen}
          setScreen={setScreen}
          onLogout={() => logout().catch(console.error)}
          userName={userName}
          userInitials={userInitials}
        />
      </div>
      <div style={{marginLeft:220,minHeight:"100vh",backgroundColor:BG}}>
        <div style={{position:"sticky",top:0,zIndex:30}}>
          <TopBar title={titles[screen]||"LAIC"}/>
        </div>
        {screen==="student-courses"      &&<StudentDashboard setScreen={setScreen}/>}
        {screen==="student-concept"      &&<WiredStudentConcept/>}
        {screen==="student-mastery"      &&<StudentMasteryScreen/>}
        {screen==="student-reflection"   &&<ReflectionScreen setScreen={setScreen}/>}
        {screen==="instructor-home"      &&<InstructorHomeScreen setScreen={setScreen}/>}
        {screen==="instructor-create"    &&<WiredInstructorCreate/>}
        {screen==="instructor-dashboard" &&<TeacherDashboardScreen setScreen={setScreen}/>}
      </div>
      <FloatingAIChat/>
    </div>
  );
}
