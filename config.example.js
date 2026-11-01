// Plantilla de configuración local (fase 8: Supabase).
// Cópiala como src/config.local.js —ese archivo está en .gitignore y nunca se sube— y pon tus valores.
//
// SOLO la clave pública "anon". NUNCA la "service_role": esa clave se salta las políticas RLS y da
// acceso total a la base de datos. Todo lo que está en esta app lo puede leer quien abra el enlace.
export const SUPABASE = {
  url: 'https://TU-PROYECTO.supabase.co',
  anonKey: 'TU-CLAVE-ANON-PUBLICA',
  bucketFotos: 'fotos', // bucket PRIVADO; las fotos se leen con URLs firmadas
};
