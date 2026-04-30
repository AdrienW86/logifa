/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {}, // <-- On utilise le nouveau paquet ici
  },
};

export default config;