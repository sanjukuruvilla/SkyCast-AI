import { GoogleGenAI, Type } from "@google/genai";
import { CurrentWeather, Unit } from "../types";

// Initialize Gemini with a fallback to prevent constructor crash if key is undefined
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

// 1. Intelligent Search Parsing
export const parseSearchQuery = async (query: string): Promise<{ city: string; intent?: string }> => {
  if (!process.env.API_KEY) return { city: query };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze this weather search query: "${query}". 
      Extract the target city name and any specific user intent (like checking for rain, cold, clothing advice, etc).
      If the query is just a city name, return it.
      If the city is a nickname (e.g. "Big Apple"), resolve it to the real city name.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            city: { type: Type.STRING, description: "The resolved city name" },
            intent: { type: Type.STRING, nullable: true, description: "The specific question or context from the user" }
          },
          required: ["city"]
        }
      }
    });

    const text = response.text;
    if (text) return JSON.parse(text);
    return { city: query };
  } catch (error) {
    console.warn("Intent parsing failed/skipped:", error);
    return { city: query };
  }
};

// 2. Generative Background Image
export const generateWeatherScene = async (weather: CurrentWeather): Promise<{ imageData: string | null; isQuotaError: boolean }> => {
  if (!process.env.API_KEY) return { imageData: null, isQuotaError: false };

  try {
    const timeOfDay = weather.weather[0].icon.includes('n') ? 'night' : 'day';
    const description = weather.weather[0].description;
    
    // Enhanced prompt with location context
    const prompt = `
      A breathtaking, photorealistic, cinematic wide-angle photograph of ${weather.name} at ${timeOfDay}.
      Weather conditions: ${description}.
      Atmosphere: ${timeOfDay === 'night' ? 'city lights glowing, moody' : 'natural lighting, vibrant'}.
      Style: High resolution, 8k, National Geographic style, wallpaper quality.
      Important: No text, no overlays, no UI elements. Just the pure scene.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
         // Nano banana / flash image models
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return { imageData: `data:image/png;base64,${part.inlineData.data}`, isQuotaError: false };
      }
    }
    return { imageData: null, isQuotaError: false };
  } catch (error: any) {
    // Gracefully handle quota exhaustion
    if (error.status === 'RESOURCE_EXHAUSTED' || error.code === 429 || error.message?.includes('429')) {
      console.warn("Gemini Image Quota Exceeded.");
      return { imageData: null, isQuotaError: true };
    }
    console.error("Image generation failed:", error);
    return { imageData: null, isQuotaError: false };
  }
};

// 3. Smart Insights with Streaming
export const streamWeatherInsight = async (
  weather: CurrentWeather,
  unit: Unit,
  userIntent: string | undefined,
  onChunk: (text: string) => void
): Promise<void> => {
  if (!process.env.API_KEY) {
    onChunk("Gemini API Key is missing. Please add it to your environment variables.");
    return;
  }

  try {
    const unitLabel = unit === Unit.CELSIUS ? "Celsius" : "Fahrenheit";
    const aqi = weather.aqi;
    
    // Chain of thought prompting with Deep Data
    const prompt = `
      Act as a witty and highly intelligent weather assistant.
      
      Context:
      - City: ${weather.name}
      - Weather: ${weather.weather[0].description}
      - Temp: ${weather.main.temp}°${unitLabel} (Feels like ${weather.main.feels_like}°)
      - Wind: ${weather.wind.speed} m/s
      - Humidity: ${weather.main.humidity}%
      - UV Index: ${weather.uv_index || 'N/A'}
      - Air Quality (US AQI): ${aqi ? aqi.us_aqi : 'N/A'} (PM2.5: ${aqi ? aqi.pm2_5 : 'N/A'})
      - User Intent: "${userIntent || 'General update'}"

      Task:
      1. Analyze the "feels like" temperature, wind chill, and especially the Air Quality (AQI) and UV.
      2. If AQI is poor (>100), warn the user. If UV is high, suggest protection.
      3. Formulate practical advice for clothing and activities.
      4. Be concise (max 3-4 sentences) but conversational.

      Output:
      Just the final friendly response. No "Thinking..." prefixes.
    `;

    const streamResult = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    for await (const chunk of streamResult) {
      const text = chunk.text;
      if (text) {
        onChunk(text);
      }
    }

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    if (error.status === 'RESOURCE_EXHAUSTED' || error.code === 429) {
       onChunk("I'm currently receiving too many requests. Please check back in a moment for your smart insights!");
    } else {
       onChunk("Gemini is currently offline due to atmospheric interference (API Error).");
    }
  }
};