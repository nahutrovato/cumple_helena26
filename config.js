// Configuración de la web del cumple.
// Mientras "cloudName" esté vacío, la web funciona en MODO DEMO:
// acepta cualquier clave y las fotos no se guardan en ningún lado.
window.CONFIG = {
  // Nombre de la cuenta de Cloudinary ("Cloud name" en el panel).
  cloudName: "ykarw9xv",

  // Huella (SHA-256) de la clave de los invitados. La clave en sí no se guarda acá.
  keyHash: "4eb2270be8e4d5a77aeefbeb9b59a06b60c96e4eea5f4fecef35f4ba6a8137ed",

  // Textos de la portada.
  nombre: "Helena",
  subtitulo: "¡Gracias por venir a festejar! Compartí acá tus fotos del cumple.",

  // Mensajes que dejan los invitados al confirmar en la invitación (planilla de Google).
  // Vacío = no se muestra la sección.
  mensajesUrl: "https://script.google.com/macros/s/AKfycbwgob7vGHIbVXceWJiHWmHMxCrzzXJOznq4VId3tJgszSpFs3R-UXra-tvZlpfY5NM2uw/exec?accion=mensajes",
};
