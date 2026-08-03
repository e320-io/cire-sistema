export function renderMarkdown(text,T,light){
  if(!text)return null;
  const lines=text.split("\n");
  const elements=[];
  let key=0;
  const colorText=light?"rgba(26,31,60,0.92)":"rgba(255,255,255,0.90)";
  const colorSub=light?"rgba(26,31,60,0.68)":"rgba(255,255,255,0.62)";
  const inlineBold=(str)=>{
    const parts=str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p,i)=>p.startsWith("**")&&p.endsWith("**")
      ?<strong key={i} style={{fontWeight:700,color:colorText}}>{p.slice(2,-2)}</strong>
      :<span key={i}>{p}</span>);
  };
  lines.forEach((line,i)=>{
    const trimmed=line.trim();
    if(!trimmed){elements.push(<div key={key++} style={{height:"10px"}}/>);return;}
    if(trimmed.startsWith("### ")){
      elements.push(<div key={key++} style={{fontSize:"14px",fontWeight:700,color:colorSub,letterSpacing:"0.4px",marginTop:"18px",marginBottom:"6px",textTransform:"uppercase"}}>{trimmed.slice(4)}</div>);
    } else if(trimmed.startsWith("## ")){
      elements.push(<div key={key++} style={{fontSize:"18px",fontWeight:700,color:colorText,marginTop:"24px",marginBottom:"8px",borderBottom:`1px solid ${light?"rgba(0,0,0,0.10)":"rgba(255,255,255,0.10)"}`,paddingBottom:"6px"}}>{trimmed.slice(3)}</div>);
    } else if(trimmed.startsWith("# ")){
      elements.push(<div key={key++} style={{fontSize:"22px",fontWeight:800,color:colorText,marginBottom:"12px",letterSpacing:"-0.3px"}}>{trimmed.slice(2)}</div>);
    } else if(trimmed.startsWith("- ")||trimmed.startsWith("• ")){
      const content=trimmed.startsWith("- ")?trimmed.slice(2):trimmed.slice(2);
      elements.push(<div key={key++} style={{display:"flex",gap:"10px",fontSize:"15px",lineHeight:"1.7",color:colorSub,marginBottom:"6px"}}>
        <span style={{color:light?"rgba(39,33,232,0.7)":"rgba(100,130,255,0.9)",marginTop:"2px",flexShrink:0}}>▸</span>
        <span>{inlineBold(content)}</span>
      </div>);
    } else {
      elements.push(<p key={key++} style={{fontSize:"15px",lineHeight:"1.8",color:colorSub,margin:"0 0 8px 0"}}>{inlineBold(trimmed)}</p>);
    }
  });
  return elements;
}
