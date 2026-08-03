import { createContext, useContext } from "react";

export const ThemeCtx = createContext({ light: false, acc: false });

export const mkT = (light, acc = false) => ({
  sub:    light?(acc?"rgba(26,31,60,0.95)":"rgba(26,31,60,0.68)"):(acc?"rgba(255,255,255,0.92)":"rgba(255,255,255,0.55)"),
  faint:  light?(acc?"rgba(26,31,60,0.85)":"rgba(26,31,60,0.52)"):(acc?"rgba(255,255,255,0.80)":"rgba(255,255,255,0.35)"),
  muted:  light?(acc?"rgba(26,31,60,0.95)":"rgba(26,31,60,0.78)"):(acc?"rgba(255,255,255,0.92)":"rgba(255,255,255,0.35)"),
  dim:    light?(acc?"rgba(26,31,60,0.80)":"rgba(26,31,60,0.42)"):(acc?"rgba(255,255,255,0.75)":"rgba(255,255,255,0.25)"),
  div:    light?"rgba(0,0,0,0.08)"   :"rgba(255,255,255,0.06)",
  cardBg: light?"rgba(0,0,0,0.03)"   :"rgba(255,255,255,0.03)",
  cardBdr:light?"rgba(0,0,0,0.09)"   :"rgba(255,255,255,0.08)",
  hoverBg:light?"rgba(0,0,0,0.05)"   :"rgba(255,255,255,0.06)",
  sideBg: light?"rgba(0,0,0,0.04)"   :"rgba(0,0,0,0.2)",
  chipBdr:light?"rgba(0,0,0,0.14)"   :"rgba(255,255,255,0.12)",
  dotBg:  light?"rgba(0,0,0,0.08)"   :"rgba(255,255,255,0.06)",
  dropBg: light?"#eeebe3"            :"#22264A",
  dropBdr:light?"rgba(0,0,0,0.1)"    :"rgba(255,255,255,0.1)",
  cardWh: light?"rgba(0,0,0,0.025)"  :"rgba(255,255,255,0.04)",
  navBg:  light?"rgba(242,239,232,0.97)":"rgba(0,0,0,0.4)",
  pageBg: light?"#eeebe3"            :"#22264A",
});

export function useT(){const{light,acc}=useContext(ThemeCtx);return{light,acc,T:mkT(light,acc)};}
