import {useEffect,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {ChevronLeft,ChevronRight,Pause,Play} from 'lucide-react';

const riders=[
  {slug:'pedro-acosta',name:'Pedro Acosta',series:'MotoGP',position:'54% 50%'},
  {slug:'fermin-aldeguer',name:'Fermín Aldeguer',series:'MotoGP',position:'54% 50%'},
  {slug:'ai-ogura',name:'Ai Ogura',series:'MotoGP',position:'55% 50%'},
  {slug:'nicolo-bulega',name:'Nicolò Bulega',series:'WorldSBK',position:'55% 50%'},
  {slug:'iker-lecuona',name:'Iker Lecuona',series:'WorldSBK',position:'54% 48%'}
];
const interval=6000;
export default function HeroCarousel(){
  const reduce=useReducedMotion();
  const [index,setIndex]=useState(0);
  const [direction,setDirection]=useState(1);
  const [paused,setPaused]=useState(false);
  const [hovered,setHovered]=useState(false);
  const [hidden,setHidden]=useState(document.hidden);
  const rider=riders[index];
  const stopped=paused||hovered||hidden||reduce;
  const select=(next:number,dir:number)=>{setDirection(dir);setIndex((next+riders.length)%riders.length)};
  useEffect(()=>{const visibility=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility)},[]);
  useEffect(()=>{if(stopped)return;const timer=window.setTimeout(()=>{setDirection(1);setIndex(i=>(i+1)%riders.length)},interval);return()=>window.clearTimeout(timer)},[index,stopped]);
  useEffect(()=>{riders.forEach(r=>{const image=new Image();image.src=`/images/riders/${r.slug}.jpg`;image.decode().catch(()=>{})})},[]);
  return <>
    <div className="hero-gallery" aria-label="Young MotoGP and WorldSBK riders" aria-roledescription="carousel">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div key={rider.slug} custom={direction} className="hero-gallery-slide"
          variants={{enter:(dir:number)=>({x:reduce?0:`${dir*100}%`,opacity:reduce?0:1}),center:{x:0,opacity:1},exit:(dir:number)=>({x:reduce?0:`${dir*-100}%`,opacity:reduce?0:1})}}
          initial="enter" animate="center" exit="exit" transition={{duration:reduce?0:.9,ease:[.65,0,.2,1]}}>
          <motion.img src={`/images/riders/${rider.slug}.jpg`} alt={`${rider.name} in the motorcycle racing paddock or on track`} style={{objectPosition:rider.position}} initial={{scale:reduce?1:1.055}} animate={{scale:1}} transition={{duration:6.9,ease:'linear'}} fetchPriority={index===0?'high':'auto'} draggable={false}/>
        </motion.div>
      </AnimatePresence>
    </div>
    <div className="hero-rider-label"><span>NEXT GENERATION / {rider.series.toUpperCase()}</span><strong>{rider.name}</strong><a href="/credits.html">VIEW PHOTO CREDITS ↗</a></div>
    <div className="hero-gallery-controls" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setHovered(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setHovered(false)}} aria-label="Hero slideshow controls">
      <span className="slide-count">0{index+1}<span> / 05</span></span>
      <button type="button" aria-label="Previous rider" onClick={()=>select(index-1,-1)}><ChevronLeft size={15}/></button>
      <div className="slide-dots">{riders.map((r,i)=><button key={r.slug} type="button" aria-label={`Show ${r.name}`} aria-pressed={index===i} onClick={()=>select(i,i>=index?1:-1)}><span className={index===i?'active':''}/></button>)}</div>
      <button type="button" aria-label="Next rider" onClick={()=>select(index+1,1)}><ChevronRight size={15}/></button>
      <button type="button" aria-label={paused?'Play slideshow':'Pause slideshow'} aria-pressed={paused} onClick={()=>setPaused(!paused)} disabled={!!reduce}>{paused||reduce?<Play size={13}/>:<Pause size={13}/>}</button>
    </div>
  </>
}
