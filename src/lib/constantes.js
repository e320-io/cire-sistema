export const USUARIOS=[
  {id:1,nombre:"Coapa",usuario:"coapa",password:"cire2026",rol:"sucursal",color:"#2721E8",accesibilidad:true},
  {id:2,nombre:"Valle",usuario:"valle",password:"cire2026",rol:"sucursal",color:"#49B8D3",sucursalesBot:["Coapa","Valle","Oriente","Polanco","Metepec","__sin_sucursal__"],sucursalesRecepcion:["Coapa","Valle","Oriente","Polanco","Metepec"]},
  {id:3,nombre:"Oriente",usuario:"oriente",password:"cire2026",rol:"sucursal",color:"#2721E8",noBot:true},
  {id:4,nombre:"Polanco",usuario:"polanco",password:"cire2026",rol:"sucursal",color:"#49B8D3"},
  {id:5,nombre:"Metepec",usuario:"metepec",password:"cire2026",rol:"sucursal",color:"#2721E8",noBot:true},
  {id:0,nombre:"Admin",usuario:"cire.admin",password:"cire.admin2026",rol:"admin",color:"#a855f7"},
  {id:10,nombre:"Jaz Vázquez",usuario:"jaz_vazquez",password:"jaz.cire2026",rol:"duena_general",color:"#f0c040",sucursalesPropias:["Polanco","Valle"],catalogo:true},
  {id:11,nombre:"Fabiola Tinoco",usuario:"fabiola_tinoco",password:"fabiola2026",rol:"socia",color:"#2721E8",sucursales:["Coapa"],accesibilidad:true,tabsExtra:["pos","zettle","reparar"]},
  {id:12,nombre:"Gerencia Metepec",usuario:"gerencia_metepec",password:"metepec2026",rol:"socia",color:"#10b981",sucursales:["Metepec"],noBot:true},
  {id:13,nombre:"Marce Gallardo",usuario:"marce_gallardo",password:"cire2026",rol:"socia",color:"#a855f7",sucursales:["Oriente"],noBot:true,passwordFinal:true},
  {id:14,nombre:"Fer Ayala",usuario:"fer_ayala",password:"fer.cire2026",rol:"duena_general",color:"#a855f7"},
];
export const SUCURSALES_NAMES=["Coapa","Valle","Oriente","Polanco","Metepec"];
export const COLORES={Coapa:"#2721E8",Valle:"#49B8D3",Oriente:"#a855f7",Polanco:"#f97316",Metepec:"#10b981"};
export const TERMINALES_DEFAULT=[
  {nombre:"Zettle",comision:2.29,activa:true},
  {nombre:"BBVA",comision:2.75,activa:true},
  {nombre:"Banorte",comision:2.50,activa:true},
  {nombre:"Mercado Pago",comision:2.99,activa:true},
];
export const puedeEditarCatalogo=(s)=>s?.rol==="admin"||s?.catalogo===true;
export const netoTarjeta=(monto,comision)=>Math.round(monto*(1-(comision*1.16/100)));
export const fmt=(n)=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:0}).format(n||0);
export const fmtN=(n)=>new Intl.NumberFormat("es-MX").format(n||0);
export const cdmx=(d=new Date())=>d.toLocaleDateString("en-CA",{timeZone:"America/Mexico_City"});
export const hoy=()=>cdmx();
export const ayer=()=>{const h=cdmx();const d=new Date(h+"T12:00:00");d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);};
export const normName=n=>(n||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9\s]/g,"").replace(/\s+/g," ").trim();
export const mesLabel=()=>new Date().toLocaleDateString("es-MX",{month:"long",year:"numeric"});
export const defaultMes=()=>{const d=new Date();if(d.getDate()<=5){const p=new Date(d.getFullYear(),d.getMonth()-1,1);return`${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,"0")}`;}return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;};
export const MESES_ES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
