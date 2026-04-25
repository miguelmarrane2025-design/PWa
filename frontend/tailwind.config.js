/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fff1f2",
          400: "#ff4d4f",
          500: "#e50914",
          600: "#f40612",
          700: "#b20710",
          900: "#450407",
        },
      },
      height: {
        screen: ["100dvh", "100vh"],
      },
    },
  },
  plugins: [],
};
