import svgPaths from "./svg-87xel05r10";
import imgImage3 from "./97b20c55a0746afbe29344ee6e519a924f9a40c8.png";

function Time() {
  return (
    <div className="flex-[1_0_0] min-w-px relative" data-name="Time">
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center pl-[15.998px] pr-[5.999px] relative size-full">
          <p className="[word-break:break-word] font-['SF_Pro:Semibold',sans-serif] font-[590] leading-[21.998px] relative shrink-0 text-[17px] text-black text-center whitespace-nowrap" style={{ fontVariationSettings: '"wdth" 100' }}>
            9:41
          </p>
        </div>
      </div>
    </div>
  );
}

function DynamicIslandSpacer() {
  return <div className="h-[9.999px] relative shrink-0 w-[123.987px]" data-name="Dynamic Island spacer" />;
}

function Battery() {
  return (
    <div className="h-[12.999px] relative shrink-0 w-[27.325px]" data-name="Battery">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 27.3252 12.9987">
        <g id="Battery">
          <rect height="11.9988" id="Border" opacity="0.35" rx="3.79961" stroke="var(--stroke-0, black)" strokeWidth="0.999897" width="23.9975" x="0.499948" y="0.499948" />
          <path d={svgPaths.p2939b240} fill="var(--fill-0, black)" id="Cap" opacity="0.4" />
          <rect fill="var(--fill-0, black)" height="8.99907" id="Capacity" rx="2.49974" width="20.9978" x="1.99979" y="1.99979" />
        </g>
      </svg>
    </div>
  );
}

function Levels() {
  return (
    <div className="flex-[1_0_0] min-w-px relative" data-name="Levels">
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex gap-[6.999px] items-center justify-center pl-[5.999px] pr-[15.998px] relative size-full">
          <div className="h-[12.225px] relative shrink-0 w-[19.198px]" data-name="Cellular Connection">
            <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.198 12.2252">
              <path clipRule="evenodd" d={svgPaths.p35d2000} fill="var(--fill-0, black)" fillRule="evenodd" id="Cellular Connection" />
            </svg>
          </div>
          <div className="h-[12.327px] relative shrink-0 w-[17.14px]" data-name="Wifi">
            <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.1399 12.327">
              <path clipRule="evenodd" d={svgPaths.p333fd100} fill="var(--fill-0, black)" fillRule="evenodd" id="Wifi" />
            </svg>
          </div>
          <Battery />
        </div>
      </div>
    </div>
  );
}

function Frame() {
  return (
    <div className="content-stretch flex items-center justify-between relative shrink-0 w-full" data-name="Frame">
      <Time />
      <DynamicIslandSpacer />
      <Levels />
    </div>
  );
}

function Group() {
  return (
    <a className="absolute block cursor-pointer inset-[8.09%_30.32%_89.96%_66.29%]" data-name="Group">
      <div className="absolute inset-[-5%_-6.25%]">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15.3561 18.7679">
          <g id="Group">
            <path d={svgPaths.pf75b700} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.70624" />
            <path d={svgPaths.p1009ae80} id="Vector_2" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.70624" />
            <path d={svgPaths.p2970e6a0} id="Vector_3" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.70624" />
          </g>
        </svg>
      </div>
    </a>
  );
}

function Group1() {
  return (
    <a className="absolute block cursor-pointer inset-[7.93%_19.47%_90.03%_76.98%]">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 14.2611 17.8261">
        <g id="Group 3">
          <path clipRule="evenodd" d={svgPaths.pe3cb680} fill="var(--fill-0, white)" fillRule="evenodd" id="Vector" />
          <path d={svgPaths.p246c1e00} fill="var(--fill-0, white)" id="Vector_2" />
        </g>
      </svg>
    </a>
  );
}

export default function NarrativeMode() {
  return (
    <div className="bg-[#fcf5e3] relative size-full" data-name="narrative mode">
      <p className="[word-break:break-word] absolute font-['Space_Grotesk:Bold',sans-serif] font-bold leading-[normal] left-[25px] text-[34.004px] text-black top-[110px] whitespace-nowrap">Module 1</p>
      <p className="[word-break:break-word] absolute font-['Space_Grotesk:Bold',sans-serif] font-bold leading-[normal] left-[25px] text-[23.29px] text-black top-[174px] whitespace-nowrap">Perception</p>
      <div className="[word-break:break-word] absolute font-['Helvetica_Neue:Regular',sans-serif] leading-[0] left-[23px] not-italic text-[0px] text-black top-[224px] w-[358px] whitespace-pre-wrap">
        <p className="font-['IBM_Plex_Mono:Bold',sans-serif] leading-[normal] mb-0 text-[15.98px]">Imagine walking into a kitchen...</p>
        <p className="leading-[normal] mb-0 text-[12.884px]">​</p>
        <p className="font-['IBM_Plex_Mono:Regular',sans-serif] leading-[normal] mb-0 text-[12.884px]">And instantly smelling something amazing. Before you even think about it, your brain already knows: cookies. It catches the smell, hears the clink of a baking sheet, feels the warmth in the air, and pieces it all together in an instant.</p>
        <p className="leading-[normal] mb-0 text-[12.884px]">​</p>
        <p className="mb-0 text-[12.884px]">
          <span className="font-['IBM_Plex_Mono:Regular',sans-serif] leading-[normal] not-italic">{`That’s `}</span>
          <span className="font-['IBM_Plex_Mono:Bold',sans-serif] leading-[normal] not-italic">perception</span>
          <span className="font-['IBM_Plex_Mono:Regular',sans-serif] leading-[normal] not-italic">{`. It comes from the Latin word `}</span>
          <span className="font-['IBM_Plex_Mono:Italic',sans-serif] italic leading-[normal]">perceptio</span>
          <span className="font-['IBM_Plex_Mono:Regular',sans-serif] leading-[normal] not-italic">{`, meaning "gathering" or "receiving." `}</span>
        </p>
        <p className="leading-[normal] mb-0 text-[12.884px]">​</p>
        <p className="font-['IBM_Plex_Mono:Regular',sans-serif] leading-[normal] mb-0 text-[12.884px]">Your brain is taking the world as raw inputs, and turning into something real, like recognizing a friend’s face.</p>
        <p className="leading-[normal] mb-0 text-[12.884px]">​</p>
        <p className="leading-[normal] text-[12.884px]">​</p>
      </div>
      <div className="absolute bg-[#fcf5e3] content-stretch flex flex-col h-[49.995px] items-start left-0 pt-[20.998px] top-0 w-[401.958px]" data-name="Status Bar - iPhone">
        <Frame />
      </div>
      <div className="absolute bg-[#535353] h-[21.829px] left-[201px] rounded-[20.79px] shadow-[0px_0.832px_0.832px_0px_rgba(0,0,0,0.25)] top-[121px] w-[186.275px]" />
      <div className="absolute bg-black h-[21.829px] left-[201px] rounded-[20.79px] shadow-[0px_0.832px_0.832px_0px_rgba(0,0,0,0.25)] top-[121px] w-[71.308px]" />
      <div className="absolute bg-black h-[43px] left-[265px] rounded-[20.79px] shadow-[0px_0.832px_0.832px_0px_rgba(0,0,0,0.25)] top-[739px] w-[117px]" />
      <div className="absolute bg-[#535353] h-[45.228px] left-[25px] rounded-[40.746px] top-[806px] w-[326.782px]" />
      <div className="absolute bg-[#535353] h-[30.559px] left-[252.83px] rounded-[27.495px] top-[63.36px] w-[127.738px]" />
      <div className="absolute bg-black h-[30.559px] left-[336px] rounded-[27.495px] top-[63px] w-[45.432px]" />
      <Group />
      <p className="[word-break:break-word] absolute font-['IBM_Plex_Mono:Regular',sans-serif] leading-[normal] left-[49.35px] not-italic text-[#9a9a9a] text-[17.317px] top-[817.25px] whitespace-nowrap">Ask a question...</p>
      <Group1 />
      <div className="absolute inset-[7.9%_8.88%_90.05%_86.66%]" data-name="Vector">
        <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.9282 17.9282">
          <path d={svgPaths.p2f07f000} fill="var(--fill-0, white)" id="Vector" />
        </svg>
      </div>
      <p className="[word-break:break-word] absolute font-['IBM_Plex_Mono:Regular',sans-serif] leading-[normal] left-[278px] not-italic text-[18.91px] text-white top-[748px] whitespace-nowrap">Continue</p>
      <div className="absolute h-[141px] left-[23px] top-[544px] w-[188px]" data-name="image 3">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgImage3} />
      </div>
      <p className="[word-break:break-word] absolute font-['IBM_Plex_Mono:Regular',sans-serif] leading-[normal] left-[225px] not-italic text-[13.024px] text-black top-[553px] w-[163.19px]">Here’s an optical illusion that shows how perception can differ between individuals: Do you see two faces or a vase?</p>
    </div>
  );
}