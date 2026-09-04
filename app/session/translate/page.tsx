import SessionRunner from "../SessionRunner";

// Modo traducción: misma mecánica y mismo Leitner que la sesión normal, pero
// sirviendo solo ejercicios de castellano → inglés.
export default function TranslateSessionPage() {
  return <SessionRunner mode="translate" />;
}
