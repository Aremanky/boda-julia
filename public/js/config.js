/*
 * Ajustes de la web de la boda. Cambia solo lo que va entre comillas.
 */
window.BODA_CONFIG = {
  // Fecha y hora de la ceremonia (hora de España; en abril es +02:00). Mueve la cuenta atrás.
  fechaBoda: "2027-04-10T13:00:00+02:00",

  // Número de cuenta para el detalle. Mientras esté vacío se muestra «Muy pronto…».
  // Ejemplo: iban: "ES12 3456 7890 1234 5678 9012",
  iban: "",
  // Opcional: nombre de los titulares que aparece bajo el número.
  titular: "",

  // Canción: pon el archivo en la carpeta musica/ con este nombre.
  musica: "musica/cancion.mp3",

  // Fotos de «La precuela»: carpeta fotos/, nombres 01.jpg … 10.jpg (cuadradas quedan mejor).
  usarFotos: true,

  // No tocar si usas el servidor incluido (server.js).
  rsvpEndpoint: "api/rsvp",
  modoVistaPrevia: false
};
