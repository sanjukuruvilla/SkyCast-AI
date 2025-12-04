# SkyCast AI 🌤️

A next-generation weather dashboard powered by **React**, **Open-Meteo**, and **Google Gemini AI**.

## Features

- **Real-time Weather**: Current temperature, humidity, wind, and detailed atmospheric data.
- **Deep Metrics**: Air Quality (AQI), UV Index, Visibility, Pressure, Dew Point.
- **AI Powered**:
  - **Smart Insights**: Generative text analysis of weather conditions using Gemini 2.5 Flash.
  - **Dynamic Backgrounds**: Photorealistic background generation based on current weather using Gemini 2.5 Flash Image.
  - **Natural Language Search**: "Is it raining in Paris?" is parsed to extract intent and location.
- **Voice Integration**: Voice search and Text-to-Speech (TTS) for accessibility.
- **Responsive UI**: "Bento Grid" layout compatible with all devices.
- **Local Clock**: Displays the precise local time for the searched city.

## Technologies

- **Frontend**: React 19, Tailwind CSS, Lucide Icons.
- **Data**: Open-Meteo API (Forecast & Air Quality).
- **AI**: Google GenAI SDK (`@google/genai`).
- **Build**: Docker, Nginx.

## Setup & Run

### Prerequisites
- Node.js (if running locally without Docker)
- A Google Gemini API Key (Set as `API_KEY` env var)

### Docker Deployment

1. **Build the image**:
   ```bash
   docker build -t skycast-ai .
   ```

2. **Run the container**:
   ```bash
   docker run -p 8080:80 -e API_KEY=your_gemini_api_key skycast-ai
   ```

3. Open `http://localhost:8080`.

### Local Development

1. Open `index.html` in a modern browser (uses ES Modules via CDN).
2. Or serve using a simple HTTP server:
   ```bash
   npx serve .
   ```

## Dependencies

The application uses ES Modules over CDN (defined in `index.html` importmap):
- `react` ^19.2.1
- `react-dom` ^19.2.1
- `@google/genai` ^1.31.0
- `lucide-react` ^0.555.0
- `axios` ^1.13.2
- `tailwindcss` (CDN)

## License
MIT
