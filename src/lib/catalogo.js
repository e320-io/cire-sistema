import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { CATALOGO_SEED } from "./catalogoSeed.js";

const parseSesiones=(nombre)=>{
  const m=nombre.match(/(\d+)[ªa°]?\s*ses/i)||nombre.match(/\((\d+)s\)/i);
  return m?parseInt(m[1]):null;
};

const aplanarSeed=(seed)=>{
  let orden=0;
  return seed.flatMap(cat=>cat.items.map(it=>{
    orden+=1;
    return{
      id:null,
      nombre:it.nombre,
      categoria:cat.categoria,
      tipo:cat.categoria==="Productos"?"producto":"servicio",
      precio:it.precio,
      precioPromo:it.precioPromo??null,
      promoHasta:null,
      preciosOpciones:null,
      sesiones:parseSesiones(it.nombre),
      duracion:it.duracion??null,
      msi:it.msi||[],
      sucursales:it.sucursales||null,
      activo:true,
      orden,
    };
  }));
};

const desdeFila=(r)=>({
  id:r.id,
  nombre:r.nombre,
  categoria:r.categoria,
  tipo:r.tipo,
  precio:r.precio,
  precioPromo:r.precio_promo??null,
  promoHasta:r.promo_hasta??null,
  preciosOpciones:r.precios_opciones??null,
  sesiones:r.sesiones??null,
  duracion:r.duracion_min??null,
  msi:r.msi||[],
  sucursales:r.sucursales??null,
  activo:r.activo,
  orden:r.orden??1000,
});

let CACHE=aplanarSeed(CATALOGO_SEED);
let cargado=false;
let promesaCarga=null;
const listeners=new Set();
const notificar=()=>listeners.forEach(fn=>fn());

export const getCatalogo=()=>CACHE.filter(i=>i.activo);

export const getCatalogoPorCategoria=()=>{
  const activos=getCatalogo().slice().sort((a,b)=>a.orden-b.orden);
  const porCat=new Map();
  for(const item of activos){
    if(!porCat.has(item.categoria))porCat.set(item.categoria,[]);
    porCat.get(item.categoria).push(item);
  }
  return Array.from(porCat.entries()).map(([categoria,items])=>({categoria,items}));
};

export const cargarCatalogo=async()=>{
  if(promesaCarga)return promesaCarga;
  promesaCarga=(async()=>{
    try{
      const{data,error}=await supabase.from("catalogo").select("*").eq("activo",true).order("orden");
      if(!error&&data&&data.length>0){
        CACHE=data.map(desdeFila);
        notificar();
      }
    }catch(_){}
    cargado=true;promesaCarga=null;
  })();
  return promesaCarga;
};

export const asegurarCatalogo=async()=>{if(!cargado)await cargarCatalogo();};

export const recargarCatalogo=async()=>{cargado=false;await cargarCatalogo();};

export function useCatalogo(){
  const[,setTick]=useState(0);
  useEffect(()=>{
    const fn=()=>setTick(t=>t+1);
    listeners.add(fn);
    if(!cargado)cargarCatalogo();
    return()=>listeners.delete(fn);
  },[]);
  return{items:getCatalogo(),porCategoria:getCatalogoPorCategoria(),recargar:recargarCatalogo};
}
