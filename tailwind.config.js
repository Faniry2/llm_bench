/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        deepseek: '#4f8cff',
        qwen: '#7c5cff',
        kimi: '#ff8a4f',
        glm: '#2fd18f',
        chatgpt: '#10a37f'
      }
    }
  },
  plugins: []
};
