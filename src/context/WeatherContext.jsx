import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchWeather } from '../services/weatherService';
import { getSettings } from '../utils/storage';


const WeatherContext = createContext();

export function WeatherProvider({ children }) {
    const [weatherData, setWeatherData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastFetch, setLastFetch] = useState(0);

    const loadWeather = useCallback(async (force = false) => {
        const settings = getSettings();
        const freshnessLimitMs = (settings?.weatherFreshnessLimit || 4) * 60 * 60 * 1000;

        // Check freshness of existing data
        if (!force && weatherData) {
            const age = Date.now() - lastFetch;
            if (age < 15 * 60 * 1000) {
                return; // Cache valid (short term)
            }
            if (settings?.strictFreshness && age > freshnessLimitMs) {
                // Fail-Closed: Data is too old (e.g. > 4 hours)
                setWeatherData(null);
                // Continue to fetch...
            }
        }

        setLoading(true);

        if (settings?.sections?.weather === false) {
            setLoading(false);
            return;
        }

        try {
            const cities = ['chennai', 'trichy', 'muscat'];
            const results = await Promise.allSettled(
                cities.map(city => fetchWeather(city))
            );

            // If a fetch fails, data is null. 
            const data = {
                chennai: results[0].status === 'fulfilled' ? results[0].value : null,
                trichy: results[1].status === 'fulfilled' ? results[1].value : null,
                muscat: results[2].status === 'fulfilled' ? results[2].value : null,
            };

            setWeatherData(data);
            setLastFetch(Date.now());
            setError(null);
        } catch (err) {
            console.error("Weather Context Error:", err);
            setError(err);
            setWeatherData(null); // Fail-Closed on error too
        } finally {
            setLoading(false);
        }
    }, [weatherData, lastFetch]);

    useEffect(() => {
        loadWeather();
    }, [loadWeather]);

    return (
        <WeatherContext.Provider value={{ weatherData, loading, error, refreshWeather: loadWeather }}>
            {children}
        </WeatherContext.Provider>
    );
}

export function useWeather() {
    return useContext(WeatherContext);
}
