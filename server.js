import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import path from "path";

const app = express();
const PORT = process.env.PORT || 5000;

// Set dynamic application name from environment variables
app.locals.appName = process.env.APP_NAME || "Aethera";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static assets if any
app.use(express.static(path.join(__dirname, "public")));

app.get("/", async (req, res) => {
  const apiKey = process.env.WEATHER_API_KEY;
  const q = req.query.q || "Indore";

  if (!apiKey || apiKey.trim() === "") {
    return res.render("weather", {
      error: "API Key Missing: Please add WEATHER_API_KEY to your .env file.",
      location: q,
      theme: "night"
    });
  }

  try {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(q)}&days=3&aqi=no&alerts=no`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      const apiErrorMsg = data.error?.message || "Failed to fetch weather data.";
      return res.render("weather", {
        error: `WeatherAPI Error: ${apiErrorMsg}`,
        location: q,
        theme: "night"
      });
    }

    const { location, current, forecast } = data;
    
    // Dynamic theme transition based on location local hour
    const localTimeStr = location.localtime; // e.g. "2026-05-22 17:15"
    const hourMatch = localTimeStr.match(/\s(\d{2}):/);
    const localHour = hourMatch ? parseInt(hourMatch[1], 10) : new Date().getHours();

    let theme = "night";
    if (localHour >= 6 && localHour < 12) {
      theme = "morning";
    } else if (localHour >= 12 && localHour < 17) {
      theme = "afternoon";
    } else if (localHour >= 17 && localHour < 19.5) {
      theme = "evening";
    } else {
      theme = "night";
    }

    // Process forecast days to include standard weekday names
    const processedForecast = forecast.forecastday.map((fd, index) => {
      let dayName = new Date(fd.date).toLocaleDateString("en-US", { weekday: "long" });
      if (index === 0) dayName = "Today";
      else if (index === 1) dayName = "Tomorrow";
      
      return {
        date: fd.date,
        dayName,
        tempMax: Math.round(fd.day.maxtemp_c),
        tempMin: Math.round(fd.day.mintemp_c),
        avgTemp: Math.round(fd.day.avgtemp_c),
        conditionText: fd.day.condition.text,
        conditionIcon: fd.day.condition.icon,
        chanceOfRain: fd.day.daily_chance_of_rain
      };
    });

    res.render("weather", {
      error: null,
      theme,
      location: {
        name: location.name,
        region: location.region,
        country: location.country,
        localTime: location.localtime,
        isDay: current.is_day
      },
      current: {
        temp: Math.round(current.temp_c),
        feelsLike: Math.round(current.feelslike_c),
        conditionText: current.condition.text,
        conditionIcon: current.condition.icon,
        humidity: current.humidity,
        windKph: current.wind_kph,
        windDir: current.wind_dir,
        uv: current.uv,
        pressure: current.pressure_mb,
        visibility: current.vis_km
      },
      forecast: processedForecast,
      astro: forecast.forecastday[0].astro
    });

  } catch (err) {
    res.render("weather", {
      error: `Network Error: ${err.message}`,
      location: q,
      theme: "night"
    });
  }
});

// Proxy route for autocomplete suggestions
app.get("/api/search", async (req, res) => {
  const apiKey = process.env.WEATHER_API_KEY;
  const q = req.query.q;

  if (!apiKey || !q || q.trim().length < 2) {
    return res.json([]);
  }

  try {
    const url = `https://api.weatherapi.com/v1/search.json?key=${apiKey}&q=${encodeURIComponent(q)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch search locations" });
    }
    
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy route for last 3 days of historical weather data
app.get("/api/history", async (req, res) => {
  const apiKey = process.env.WEATHER_API_KEY;
  const q = req.query.q;

  if (!apiKey) {
    return res.status(400).json({ error: "API Key missing" });
  }
  if (!q) {
    return res.status(400).json({ error: "Location query (q) is required" });
  }

  try {
    // Compile dates for the last 3 days relative to today
    const dates = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }

    // Fetch data in parallel for efficiency
    const historyPromises = dates.map(async (date) => {
      const url = `https://api.weatherapi.com/v1/history.json?key=${apiKey}&q=${encodeURIComponent(q)}&dt=${date}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch history for ${date}`);
      }
      return res.json();
    });

    const results = await Promise.all(historyPromises);

    const formattedHistory = results.map((result) => {
      const fd = result.forecast.forecastday[0];
      
      // Formatting Date into readable weekday and Date string
      const dateObj = new Date(fd.date);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      });
      const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });

      return {
        date: fd.date,
        formattedDate,
        dayName,
        tempMax: Math.round(fd.day.maxtemp_c),
        tempMin: Math.round(fd.day.mintemp_c),
        avgTemp: Math.round(fd.day.avgtemp_c),
        conditionText: fd.day.condition.text,
        conditionIcon: fd.day.condition.icon,
        humidity: fd.day.avghumidity,
        windKph: fd.day.maxwind_kph
      };
    });

    res.json(formattedHistory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
