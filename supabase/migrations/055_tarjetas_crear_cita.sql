alter table tarj_calendario_log drop constraint if exists tarj_calendario_log_accion_check;
alter table tarj_calendario_log add constraint tarj_calendario_log_accion_check check (accion in ('escribir', 'revertir', 'cierre', 'crear'));
