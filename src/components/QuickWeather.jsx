import React, { useState, useEffect } from 'react';
import { useWeather } from '../context/WeatherContext';
import { getRainStatus, getRainStyle } from '../utils/weatherUtils';

/**
 * Quick Weather Widget (Redesigned)
 * Apple/Google-style card with dynamic gradients and rich data visualization.
 */
const QuickWeather = ({ activePill = 'Morning', onPillChange, pills = ['Morning', 'Midday', 'Evening'] }) => {
    const { weatherData, loading, error } = useWeather();
    const [activeCity, setActiveCity] = useState(() => {
        try {
            return localStorage.getItem('weather_active_city') || 'chennai';
        } catch (e) {
            return 'chennai';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('weather_active_city', activeCity);
        } catch (e) {
            // Ignore storage errors
        }
    }, [activeCity]);

    // Icon Mapping helper
    const getPillIcon = (pillName) => {
        if (pillName.includes('Morning')) return '🌅';
        if (pillName.includes('Midday')) return '☀️';
        if (pillName.includes('Evening')) return '🌙';
        return pillName;
    };

    const getCityIcon = (cityName) => {
        if (cityName === 'chennai') return '🏛️';
        if (cityName === 'trichy') return '🏯';
        if (cityName === 'muscat') return '📍';
        return cityName;
    };

    if (loading) return <div className="quick-weather-card qw-bg-day"><div style={{textAlign:'center'}}>Loading weather...</div></div>;
    if (error || !weatherData) return <div className="quick-weather-card qw-bg-night"><div style={{textAlign:'center'}}>Weather unavailable</div></div>;

    const data = weatherData[activeCity];
    if (!data) return null;

    // Map Time Pill to Data Key
    let timeKey = 'morning';
    let summaryPrefix = "Start your day with";

    const pill = activePill;
    if (pill === 'Morning') {
        timeKey = 'morning';
        summaryPrefix = "Start your day with";
    } else if (pill === 'Midday') {
        timeKey = 'noon';
        summaryPrefix = "As the day progresses, expect";
    } else if (pill === 'Evening') {
        timeKey = 'evening';
        summaryPrefix = "Your evening outlook is";
    } else if (pill === 'Tomorrow Morning') {
        timeKey = 'tomorrow.morning';
        summaryPrefix = "Tomorrow starts with";
    } else if (pill === 'Tomorrow Midday') {
        timeKey = 'tomorrow.noon';
        summaryPrefix = "Tomorrow midday will be";
    }

    // Handle nested keys like 'tomorrow.morning'
    let displayData;
    if (timeKey.includes('.')) {
        const [root, sub] = timeKey.split('.');
        displayData = data[root]?.[sub];
    } else {
        displayData = data[timeKey];
    }
    displayData = displayData || data.current;

    // Safety check for displayData
    if (!displayData) return null;

    // --- LOGIC: Rain Display ---
    const rainStatus = getRainStatus(displayData.rainProb?.value, displayData.rainMm);
    const isRaining = rainStatus && (rainStatus.intensity === 'moderate' || rainStatus.intensity === 'heavy');

    // --- LOGIC: Background Gradient ---
    const getBgClass = (pill, raining) => {
        // If actively raining (significantly), use rain bg
        if (raining) return 'qw-bg-rain';

        if (pill.includes('Morning')) return 'qw-bg-morning';
        if (pill.includes('Midday')) return 'qw-bg-day';
        if (pill.includes('Evening')) return 'qw-bg-evening';
        if (pill.includes('Tomorrow')) return 'qw-bg-morning';
        return 'qw-bg-night';
    };

    const bgClass = getBgClass(activePill, isRaining);

    return (
        <section className={`quick-weather-card ${bgClass}`}>

            {/* Header: Pills + City */}
            <div className="qw-header-row">
                <div className="qw-pills-row">
                    {pills.map((p) => (
                        <button
                            key={p}
                            className={`qw-pill-btn ${activePill === p ? 'active' : ''}`}
                            onClick={() => onPillChange && onPillChange(p)}
                            title={p}
                        >
                            {getPillIcon(p)}
                        </button>
                    ))}
                </div>

                <div className="qw-pills-row">
                    {['chennai', 'trichy', 'muscat'].map(city => (
                        <button
                            key={city}
                            className={`qw-pill-btn ${activeCity === city ? 'active' : ''}`}
                            onClick={() => setActiveCity(city)}
                            title={city.charAt(0).toUpperCase() + city.slice(1)}
                        >
                            {getCityIcon(city)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Location Label - Dynamic */}
            <div style={{ textAlign: 'right', marginTop: '-12px', marginBottom: '12px', paddingRight: '12px', fontSize: '0.9rem', fontWeight: 600, opacity: 0.8, color: 'var(--weather-sun)' }}>
                {activeCity.charAt(0).toUpperCase() + activeCity.slice(1)}
            </div>

            {/* Main Display: Temp + Icon */}
            <div className="qw-main-display">
                <div className="qw-temp-container">
                    <div className="qw-temp-large">{displayData.temp}°</div>
                    <div className="qw-condition-text">
                        {displayData.condition} • Feels {displayData.feelsLike}°
                    </div>
                </div>
                <div className="qw-main-icon">
                    {displayData.icon}
                </div>
            </div>

            {/* Details Grid */}
            <div className="qw-details-grid">

                {/* Wind */}
                <div className="qw-detail-item">
                    <div className="qw-detail-label">Wind</div>
                    <div className="qw-detail-value">
                        <span style={{fontSize:'1.2em'}}>💨</span>
                        {displayData.windSpeed ? `${displayData.windSpeed} km/h` : 'N/A'}
                    </div>
                </div>

                {/* Humidity */}
                <div className="qw-detail-item">
                    <div className="qw-detail-label">Humidity</div>
                    <div className="qw-detail-value">
                        <span style={{fontSize:'1.2em'}}>💧</span>
                        {displayData.humidity ? `${displayData.humidity}%` : 'N/A'}
                    </div>
                </div>

                {/* UV Index */}
                {displayData.uvIndex != null && (
                    <div className="qw-detail-item">
                        <div className="qw-detail-label">UV Index</div>
                        <div className="qw-detail-value">
                            <span style={{fontSize:'1.2em'}}>☀️</span>
                            {displayData.uvIndex}
                        </div>
                    </div>
                )}

                {/* Rain - Conditional Display */}
                {rainStatus && (
                    <div className="qw-detail-item">
                        <div className="qw-detail-label">Rainfall</div>
                        <div className="qw-detail-value" style={getRainStyle(rainStatus.intensity)}>
                            <span style={{fontSize:'1.2em'}}>{rainStatus.icon}</span>
                            {rainStatus.label}
                        </div>
                    </div>
                )}

            </div>

            {/* Summary Text */}
            <div className="qw-summary-text">
                {summaryPrefix} {displayData.temp}°C. {data.summary}
            </div>
        </section>
    );
};

export default QuickWeather;
