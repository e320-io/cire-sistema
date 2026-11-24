-- Paleta de colores de la página /agendar por sucursal (inspirada en las piezas de campaña de CIRE).
-- Valores: turquesa (Combo Sexy) | cielo (Combo Piernas) | fucsia (Combo Playa) | lila (Combo Bikini) | rosa (Combo Axilas)
alter table agenda_sucursales add column if not exists tema text not null default 'turquesa';
update agenda_sucursales set tema = case slug
  when 'coapa' then 'turquesa' when 'valle' then 'cielo' when 'oriente' then 'fucsia' when 'polanco' then 'lila' when 'metepec' then 'rosa'
  else 'turquesa' end;
