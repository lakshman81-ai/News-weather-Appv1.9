import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import Header from '../components/Header';
import NewsSection from '../components/NewsSection';
import SectionNavigator from '../components/SectionNavigator';
import BreakingNews from '../components/BreakingNews';
import TimelineHeader from '../components/TimelineHeader';
import QuickWeather from '../components/QuickWeather';
import { NewspaperLayout } from '../components/NewspaperLayout';
import { getTopline } from '../utils/timeSegment';
import { generateTopline } from '../utils/toplineGenerator';
import { getTimeSinceRefresh } from '../utils/storage';
import { useWeather } from '../context/WeatherContext';
import { useNews } from '../context/NewsContext';
import { useSettings } from '../context/SettingsContext';
import { useSegment } from '../context/SegmentContext';
import { requestNotificationPermission } from '../utils/notifications';
import { useMediaQuery } from '../hooks/useMediaQuery';
import LazySection from '../components/LazySection';
import SidebarNews from '../components/SidebarNews';

// DEBUG LOGGING SYSTEM
const logs = [];
const logSubscribers = new Set();
const addLog = (msg) => {
    logs.push(msg);
    if (logs.length > 200) logs.shift();
    logSubscribers.forEach(sub => sub([...logs]));
};

if (typeof window !== 'undefined') {
    const patch = (type) => {
        const original = console[type];
        console[type] = (...args) => {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : 'ℹ️';
            addLog(`${prefix} ${new Date().toLocaleTimeString()} - ${msg}`);
            original(...args);
        };
    };
    patch('log');
    patch('error');
    patch('warn');
}

const MainPage = () => {
    const { settings } = useSettings();
    const { currentSegment } = useSegment();
    const [activePill, setActivePill] = useState('Morning');
    const [vLog, setVLog] = useState([...logs]);
    const [notifPermission, setNotifPermission] = useState(Notification.permission);
    const [toplineContent, setToplineContent] = useState(null);

    // Responsive Detection
    const { isWebView, isDesktop } = useMediaQuery();

    // Use Contexts
    const { weatherData, loading: weatherLoading, refreshWeather } = useWeather();
    const { newsData, loading, errors, breakingNews, refreshNews, loadSection, loadedSections } = useNews();

    const { sections, uiMode = 'timeline' } = settings;

    // --- LOGIC: Sync Segment with Data Refresh & UI ---
    useEffect(() => {
        console.log(`[MainPage] Segment Changed: ${currentSegment.label}`);

        // 1. Trigger Data Refresh
        refreshWeather();
        refreshNews();

        // 2. Map Segment to Weather Pill
        const pillMap = {
            'morning_weather': 'Morning',
            'morning_news': 'Morning',
            'market_brief': 'Morning',
            'midday_brief': 'Midday',
            'market_movers': 'Midday',
            'evening_news': 'Evening',
            'local_events': 'Evening',
            'night_wrap': 'Evening',
            'urgent_only': 'Evening'
        };
        if (pillMap[currentSegment.id]) {
            setActivePill(pillMap[currentSegment.id]);
        }

    }, [currentSegment.id, refreshNews, refreshWeather]);

    // Generate Topline when data is ready
    useEffect(() => {
        if (!loading && !weatherLoading) {
            setToplineContent(generateTopline(newsData, weatherData));
        }
    }, [loading, weatherLoading, newsData, weatherData]);

    // Request Notification Permission on Mount (interaction usually required)
    const handleRequestPermission = async () => {
        const granted = await requestNotificationPermission();
        setNotifPermission(granted ? 'granted' : 'denied');
    };

    // Dynamic Timeline Logic
    const getTimelinePills = () => {
        const hour = new Date().getHours();
        if (hour < 12) return ['Morning', 'Midday', 'Evening'];
        if (hour < 17) return ['Midday', 'Evening', 'Tomorrow Morning'];
        return ['Evening', 'Tomorrow Morning', 'Tomorrow Midday'];
    };

    const [timelinePills, setTimelinePills] = useState(() => getTimelinePills());

    // Update active pill to match first available slot on mount/change
    useEffect(() => {
        const currentPills = getTimelinePills();
        setTimelinePills(currentPills);
        if (!currentPills.includes(activePill)) {
            setActivePill(currentPills[0]);
        }
    }, []);

    // Update logs Reactively
    useEffect(() => {
        const sub = (newLogs) => setVLog(newLogs);
        logSubscribers.add(sub);
        return () => logSubscribers.delete(sub);
    }, []);

    // Back to Top Logic
    const [showBackToTop, setShowBackToTop] = useState(false);
    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 400) {
                setShowBackToTop(true);
            } else {
                setShowBackToTop(false);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Detect uiMode changes
    useEffect(() => {
        console.log('[MainPage] UI mode changed:', uiMode);
    }, [uiMode]);

    // Reset timeline state when switching to classic mode
    useEffect(() => {
        if (uiMode === 'classic') {
            setActivePill('Morning');
        }
    }, [uiMode]);

    // Pull-to-Refresh Logic
    useEffect(() => {
        let startY = 0;
        let isPulling = false;

        const handleTouchStart = (e) => {
            if (window.scrollY === 0) {
                startY = e.touches[0].clientY;
                isPulling = true;
            }
        };

        const handleTouchMove = (e) => {
            if (!isPulling) return;
            const currentY = e.touches[0].clientY;
            if (currentY - startY > 150) {
                // Visual cue could go here
            }
        };

        const handleTouchEnd = (e) => {
            if (!isPulling) return;
            const endY = e.changedTouches[0].clientY;
            if (endY - startY > 150 && window.scrollY === 0) {
                refreshNews();
                refreshWeather();
            }
            isPulling = false;
        };

        if (!isDesktop) {
            document.addEventListener('touchstart', handleTouchStart);
            document.addEventListener('touchmove', handleTouchMove);
            document.addEventListener('touchend', handleTouchEnd);
        }

        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [refreshNews, refreshWeather, isDesktop]);

    // Determine loading state
    const isLoading = (weatherLoading && !weatherData) || (loading && Object.keys(newsData).length === 0);

    const isTimelineMode = uiMode === 'timeline';
    const isNewspaperMode = uiMode === 'newspaper';
    const isUrgentMode = currentSegment.id === 'urgent_only';

    // Navigation Sections
    const navSections = [
        { id: 'world-news', icon: '🌍', label: 'World' },
        sections.india?.enabled && { id: 'india-news', icon: '🇮🇳', label: 'India' },
        sections.local?.enabled && { id: 'local-news', icon: '📍', label: 'Muscat' }
    ].filter(Boolean);

    const headerActions = (
        <div className="header__actions">
            {/* Consolidated segment info into Title, removed redundant text here */}
            <Link to="/refresh" className="header__action-btn">🔄</Link>
            <Link to="/settings" className="header__action-btn">⚙️</Link>
        </div>
    );

    return (
        <div className={`page-container mode-${uiMode} ${isWebView ? 'page-container--desktop' : ''}`}>

            {/* Header: Displays Current Segment Label */}
            {isTimelineMode ? (
                <TimelineHeader
                    title={currentSegment.id === 'market_brief' ? '' : currentSegment.label}
                    icon={currentSegment.icon}
                    actions={headerActions}
                />
            ) : (
                <Header
                    title={currentSegment.label}
                    icon={currentSegment.icon}
                    actions={headerActions}
                />
            )}

            <main className={`main-content ${isWebView ? 'main-content--desktop' : ''}`}>

                {/* Desktop Sidebar */}
                {isWebView && (
                    <div className="desktop-sidebar">
                        <QuickWeather
                            activePill={activePill}
                            onPillChange={setActivePill}
                            pills={timelinePills}
                        />
                        <SidebarNews
                            news={newsData.world && newsData.world.length > 0 ? newsData.world : (newsData.india && newsData.india.length > 0 ? newsData.india : newsData.frontPage)}
                            title={newsData.world && newsData.world.length > 0 ? "Global Headlines" : "Top Stories"}
                        />
                    </div>
                )}

                <div className="content-wrapper">

                    {isLoading && (
                        <div className="loading" style={{padding: '40px'}}>
                            <div className="loading__spinner"></div>
                            <span>Loading Updates...</span>
                        </div>
                    )}

                    {/* Classic Mode Features */}
                    {!isTimelineMode && (
                        <>
                            <div className="topline">
                                <div className="topline__label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>{toplineContent?.icon || '📰'}</span>
                                    <span>{toplineContent?.type || 'TOPLINE'}</span>
                                </div>
                                <div className="topline__text">
                                    {toplineContent?.text || getTopline(currentSegment)}
                                </div>
                                <div style={{ marginTop: 'var(--spacing-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                                    {toplineContent?.type === 'FLASHBACK' ? 'ON THIS DAY' : `SEGMENT: ${currentSegment?.label}`}
                                </div>
                            </div>
                            <BreakingNews items={breakingNews} />
                        </>
                    )}

                    {/* Mobile Weather */}
                    {!isWebView && (
                        <QuickWeather
                            activePill={activePill}
                            onPillChange={setActivePill}
                            pills={timelinePills}
                        />
                    )}

                    {/* Newspaper Mode */}
                    {isNewspaperMode ? (
                        <NewspaperLayout
                            newsData={newsData}
                            breakingNews={breakingNews}
                            settings={settings.newspaper}
                        />
                    ) : (
                        /* Standard Timeline/Grid Layout */
                        <div className="news-sections news-sections--grid">

                            {/* Urgent Mode: Only show Breaking/World/India */}
                            {(!isUrgentMode || breakingNews.length === 0) && (
                                <>
                                    {newsData.frontPage && newsData.frontPage.length > 0 && (
                                        <NewsSection
                                            id="top-stories"
                                            title="Top Stories"
                                            icon="⭐"
                                            colorClass="news-section__title--world"
                                            news={newsData.frontPage}
                                            maxDisplay={10}
                                        />
                                    )}

                                    <NewsSection
                                        id="world-news"
                                        title="Global Updates"
                                        icon="🌍"
                                        colorClass="news-section__title--world"
                                        news={newsData.world}
                                        maxDisplay={sections.world?.count || 5}
                                    />

                                    {sections.india?.enabled && (
                                        <NewsSection
                                            id="india-news"
                                            title={isTimelineMode ? "India" : "India News"}
                                            icon="🇮🇳"
                                            colorClass="news-section__title--india"
                                            news={newsData.india}
                                            maxDisplay={sections.india.count || 5}
                                            error={errors.india}
                                        />
                                    )}

                                    {sections.chennai?.enabled && (
                                        <NewsSection
                                            id="chennai-news"
                                            title="Tamil Nadu"
                                            icon="🏛️"
                                            colorClass="news-section__title--chennai"
                                            news={newsData.chennai}
                                            maxDisplay={sections.chennai.count || 5}
                                            error={errors.chennai}
                                        />
                                    )}

                                    {sections.trichy?.enabled && (
                                        <NewsSection
                                            id="trichy-news"
                                            title="Trichy"
                                            icon="🏛️"
                                            colorClass="news-section__title--trichy"
                                            news={newsData.trichy}
                                            maxDisplay={sections.trichy.count || 5}
                                            error={errors.trichy}
                                        />
                                    )}

                                    {sections.local?.enabled && (
                                        <LazySection
                                            id="local-news"
                                            onVisible={() => loadSection('local')}
                                            isLoaded={loadedSections.includes('local')}
                                        >
                                            <NewsSection
                                                id="local-news"
                                                title="Local — Muscat"
                                                icon="📍"
                                                colorClass="news-section__title--local"
                                                news={newsData.local}
                                                maxDisplay={sections.local.count || 5}
                                                error={errors.local}
                                            />
                                        </LazySection>
                                    )}

                                </>
                            )}

                            {/* In Urgent Mode, if we hid everything, ensure we show SOMETHING */}
                            {isUrgentMode && breakingNews.length === 0 && (
                                <div style={{padding: '20px', textAlign: 'center', color: 'var(--text-muted)'}}>
                                    <h3>Urgent Alerts Mode</h3>
                                    <p>Monitoring for critical updates...</p>
                                    <p>Switching to standard feed tomorrow morning.</p>
                                    <button onClick={() => refreshNews()} style={{marginTop: '10px', padding: '5px 10px'}}>Check Now</button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* System Status / Debug */}
                    <div className="card" style={{ marginTop: 'var(--spacing-lg)', fontSize: 'var(--font-size-xs)' }}>
                        <div style={{ fontWeight: 600, marginBottom: 'var(--spacing-sm)', color: 'var(--accent-primary)' }}>
                            SYSTEM STATUS
                        </div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                            Segment: {currentSegment.label}<br />
                            Notifications: {notifPermission}<br />
                            UI Mode: {uiMode}<br />
                            Strict Mode: {settings.strictFreshness ? 'Active' : 'Off'}<br />
                        </div>
                    </div>

                    {/* DEBUG CONSOLE */}
                    <div style={{
                        marginTop: '20px',
                        padding: '15px',
                        background: '#0a0a0a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#00ff41',
                        height: '200px',
                        overflowY: 'auto',
                        boxShadow: '0 0 20px rgba(0,255,65,0.1)'
                    }}>
                        <div style={{ borderBottom: '1px solid #333', paddingBottom: '5px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>SYSTEM DEBUG LOGS (REAL-TIME)</span>
                            <div>
                                <button onClick={() => refreshNews()} style={{ background: '#00ff41', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', fontSize: '10px', marginRight: '5px' }}>RE-FETCH</button>
                                <button onClick={() => window.location.reload()} style={{ background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', fontSize: '10px' }}>RELOAD</button>
                            </div>
                        </div>
                        {vLog?.map((msg, i) => (
                            <div key={i} style={{ marginBottom: '4px', borderLeft: msg.includes('❌') ? '2px solid red' : 'none', paddingLeft: '5px' }}>
                                <span style={{ color: '#888' }}>[{i}]</span> {msg}
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            <SectionNavigator sections={navSections} />

            {/* Back to Top Button */}
            <button
                onClick={scrollToTop}
                style={{
                    position: 'fixed',
                    bottom: '90px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(var(--bg-card), 0.6)',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    opacity: showBackToTop ? 1 : 0,
                    pointerEvents: showBackToTop ? 'auto' : 'none',
                    transition: 'all 0.3s ease',
                    zIndex: 900,
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}
                className="back-to-top"
            >
                ↑
            </button>
        </div>
    );
}

export default MainPage;
