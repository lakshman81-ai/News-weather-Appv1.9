import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import Toggle from '../components/Toggle';
import { DEFAULT_SETTINGS } from '../utils/storage';
import { useSettings } from '../context/SettingsContext';
import { discoverFeeds } from '../utils/feedDiscovery';

/**
 * Settings Page Component - Vertical Tabs Layout
 */
function SettingsPage() {
    const { settings, updateSettings, reloadSettings } = useSettings();
    const [activeTab, setActiveTab] = useState('general');
    const [saved, setSaved] = useState(false);

    // Feed Discovery State
    const [newFeedUrl, setNewFeedUrl] = useState('');
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [discoveryError, setDiscoveryError] = useState(null);

    // Keyword Input State
    const [keywordInputs, setKeywordInputs] = useState({
        movies: '',
        events: '',
        negative: ''
    });

    if (!settings) return <div className="loading">Loading...</div>;

    const updateNested = (path, value) => {
        const keys = path.split('.');
        const newSettings = { ...settings };
        let obj = newSettings;
        for (let i = 0; i < keys.length - 1; i++) {
            obj[keys[i]] = { ...obj[keys[i]] };
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        updateSettings(newSettings);
    };

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        reloadSettings();
    };

    const handleReset = () => {
        if (window.confirm('Reset all settings to defaults?')) {
            updateSettings({ ...DEFAULT_SETTINGS });
            reloadSettings();
        }
    };

    const handleAddFeed = async () => {
        if (!newFeedUrl) return;
        setIsDiscovering(true);
        setDiscoveryError(null);

        try {
            const feeds = await discoverFeeds(newFeedUrl);
            if (feeds.length > 0) {
                const bestFeed = feeds[0];
                updateSettings({
                    ...settings,
                    customFeeds: [...(settings.customFeeds || []), { title: bestFeed.title, url: bestFeed.url }]
                });
                setNewFeedUrl('');
            } else {
                setDiscoveryError('No feeds found. Check the URL or try a direct RSS link.');
            }
        } catch (error) {
            void error;
            setDiscoveryError('Error discovering feeds.');
        } finally {
            setIsDiscovering(false);
        }
    };

    const removeCustomFeed = (index) => {
        const newFeeds = [...(settings.customFeeds || [])];
        newFeeds.splice(index, 1);
        updateSettings({ ...settings, customFeeds: newFeeds });
    };

    // --- KEYWORD MANAGEMENT ---
    const addKeyword = (category, word) => {
        if (!word || !word.trim()) return;
        const currentList = settings.upAhead?.keywords?.[category] || [];
        if (!currentList.includes(word.trim())) {
            updateNested(`upAhead.keywords.${category}`, [...currentList, word.trim()]);
        }
        setKeywordInputs({ ...keywordInputs, [category]: '' });
    };

    const removeKeyword = (category, word) => {
        const currentList = settings.upAhead?.keywords?.[category] || [];
        updateNested(`upAhead.keywords.${category}`, currentList.filter(w => w !== word));
    };

    // --- TABS CONFIGURATION ---
    const tabs = [
        { id: 'general', label: 'General', icon: '⚙️' },
        { id: 'logic', label: 'Logic & Ranking', icon: '🧠' },
        { id: 'weather', label: 'Weather', icon: '🌤️' },
        { id: 'sources', label: 'Sources', icon: '📡' },
        { id: 'upahead', label: 'Up Ahead', icon: '🗓️' },
        { id: 'market', label: 'Market', icon: '📈' },
        { id: 'advanced', label: 'Advanced', icon: '🔧' },
    ];

    // --- RENDER CONTENT ---
    const renderContent = () => {
        switch (activeTab) {
            case 'general':
                return (
                    <div className="settings-tab-content">
                        <SectionTitle icon="📱" title="Interface" />
                        <SettingCard>
                            <SettingItem label="Home Layout" subLabel="Timeline / Classic / Newspaper">
                                <select
                                    value={settings.uiMode || 'timeline'}
                                    onChange={(e) => updateSettings({ ...settings, uiMode: e.target.value })}
                                    className="settings-select"
                                >
                                    <option value="timeline">📱 Timeline</option>
                                    <option value="classic">📊 Classic</option>
                                    <option value="newspaper">📰 Newspaper</option>
                                </select>
                            </SettingItem>
                            <SettingItem label="Font Size" subLabel={`${settings.fontSize || 26}px`}>
                                <input
                                    type="range"
                                    min="14"
                                    max="34"
                                    step="1"
                                    value={settings.fontSize || 26}
                                    onChange={(e) => updateSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                                    style={{ width: '100%' }}
                                />
                            </SettingItem>
                        </SettingCard>

                        <SectionTitle icon="🤖" title="AI Configuration" />
                        <SettingCard>
                            <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                <div className="settings-item__label">
                                    <span>Gemini API Key</span>
                                    <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                                        Required for client-side fallback.
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', marginLeft: '4px' }}>Get Key</a>
                                    </small>
                                </div>
                                <input
                                    type="password"
                                    value={settings.geminiKey || ''}
                                    onChange={(e) => updateSettings({ ...settings, geminiKey: e.target.value })}
                                    className="settings-input"
                                    placeholder="Enter API Key"
                                />
                            </div>
                        </SettingCard>
                    </div>
                );

            case 'logic':
                return (
                    <div className="settings-tab-content">
                        <SectionTitle icon="🛡️" title="Freshness & Logic" />
                        <SettingCard>
                            <SettingItem label="Filtering Mode">
                                <select
                                    value={settings.filteringMode || 'source'}
                                    onChange={(e) => updateSettings({ ...settings, filteringMode: e.target.value })}
                                    className="settings-select"
                                >
                                    <option value="source">Source Based</option>
                                    <option value="keyword">Keyword Based</option>
                                </select>
                            </SettingItem>
                            <SettingItem label="Ranking Method">
                                <select
                                    value={settings.rankingMode || 'smart'}
                                    onChange={(e) => updateSettings({ ...settings, rankingMode: e.target.value })}
                                    className="settings-select"
                                >
                                    <option value="smart">Smart Mix (Impact)</option>
                                    <option value="context-aware">Location/Time Aware (Beta) ✨</option>
                                    <option value="legacy">Legacy (Freshness)</option>
                                </select>
                            </SettingItem>
                            <SettingItem label="Hide Older Than (Hours)">
                                <input
                                    type="number"
                                    min={1}
                                    max={168}
                                    value={settings.hideOlderThanHours || 60}
                                    onChange={(e) => updateSettings({ ...settings, hideOlderThanHours: parseInt(e.target.value) || 60 })}
                                    className="settings-input-number"
                                />
                            </SettingItem>
                            <SettingItem label="Strict Freshness Mode" subLabel="Hide stale stories completely">
                                <Toggle checked={settings.strictFreshness} onChange={(val) => updateSettings({ ...settings, strictFreshness: val })} />
                            </SettingItem>

                            <div style={{ padding: '10px 0', borderTop: '1px solid var(--border-default)' }}>
                                <SettingItem label={`Diversity: Max Topic ${settings.maxTopicPercent || 40}%`}>
                                    <input type="range" min="10" max="100" step="5" value={settings.maxTopicPercent || 40} onChange={(e) => updateSettings({ ...settings, maxTopicPercent: parseInt(e.target.value) })} style={{ width: '100%' }} />
                                </SettingItem>
                                <SettingItem label={`Diversity: Max Geo ${settings.maxGeoPercent || 30}%`}>
                                    <input type="range" min="10" max="100" step="5" value={settings.maxGeoPercent || 30} onChange={(e) => updateSettings({ ...settings, maxGeoPercent: parseInt(e.target.value) })} style={{ width: '100%' }} />
                                </SettingItem>
                            </div>
                        </SettingCard>

                        <SectionTitle icon="⚡" title="Ranking Weights" />
                        <SettingCard>
                            <div style={{fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'10px'}}>
                                Adjust how much boost specific factors give to news items.
                            </div>

                            {/* Temporal */}
                            <div style={{marginBottom:'15px'}}>
                                <div className="settings-item__label" style={{color:'var(--accent-primary)', marginBottom:'5px'}}>Temporal Boosts</div>
                                <SettingItem label={`Weekend Boost: ${(settings.rankingWeights?.temporal?.weekendBoost || 2.0).toFixed(1)}x`}>
                                    <input
                                        type="range" min="1.0" max="5.0" step="0.1"
                                        value={settings.rankingWeights?.temporal?.weekendBoost || 2.0}
                                        onChange={(e) => updateNested('rankingWeights.temporal.weekendBoost', parseFloat(e.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                </SettingItem>
                                <SettingItem label={`Entertainment Boost: ${(settings.rankingWeights?.temporal?.entertainmentBoost || 2.5).toFixed(1)}x`}>
                                    <input
                                        type="range" min="1.0" max="5.0" step="0.1"
                                        value={settings.rankingWeights?.temporal?.entertainmentBoost || 2.5}
                                        onChange={(e) => updateNested('rankingWeights.temporal.entertainmentBoost', parseFloat(e.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                </SettingItem>
                            </div>

                            {/* Geo */}
                            <div>
                                <div className="settings-item__label" style={{color:'var(--accent-primary)', marginBottom:'5px'}}>Geo Boosts</div>
                                <SettingItem label={`City Match: ${(settings.rankingWeights?.geo?.cityMatch || 1.5).toFixed(1)}x`}>
                                    <input
                                        type="range" min="1.0" max="5.0" step="0.1"
                                        value={settings.rankingWeights?.geo?.cityMatch || 1.5}
                                        onChange={(e) => updateNested('rankingWeights.geo.cityMatch', parseFloat(e.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                </SettingItem>
                                <SettingItem label={`Max Geo Score: ${(settings.rankingWeights?.geo?.maxScore || 5.0).toFixed(1)}x`}>
                                    <input
                                        type="range" min="1.0" max="10.0" step="0.5"
                                        value={settings.rankingWeights?.geo?.maxScore || 5.0}
                                        onChange={(e) => updateNested('rankingWeights.geo.maxScore', parseFloat(e.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                </SettingItem>
                            </div>
                        </SettingCard>
                    </div>
                );

            case 'weather':
                return (
                    <div className="settings-tab-content">
                        <SectionTitle icon="🌤️" title="Weather Models" />
                        <SettingCard>
                            <SettingItem label="ECMWF (European)" subLabel="Most Accurate">
                                <Toggle checked={settings.weather?.models?.ecmwf !== false} onChange={(val) => updateNested('weather.models.ecmwf', val)} />
                            </SettingItem>
                            <SettingItem label="GFS (NOAA)" subLabel="Good Precipitation">
                                <Toggle checked={settings.weather?.models?.gfs !== false} onChange={(val) => updateNested('weather.models.gfs', val)} />
                            </SettingItem>
                            <SettingItem label="ICON (DWD)" subLabel="Excellent Coverage">
                                <Toggle checked={settings.weather?.models?.icon !== false} onChange={(val) => updateNested('weather.models.icon', val)} />
                            </SettingItem>
                        </SettingCard>
                    </div>
                );

            case 'sources':
                return (
                    <div className="settings-tab-content">
                        <SectionTitle icon="📡" title="News Sources" />
                        <SettingCard>
                            <div className="settings-item" style={{
                                borderBottom: '1px solid var(--accent-danger)',
                                background: 'rgba(220, 38, 38, 0.15)',
                                padding: '10px'
                            }}>
                                <div className="settings-item__label" style={{ color: 'var(--accent-danger)' }}>
                                    <span>🏆 Top Websites Only</span>
                                    <small style={{ display: 'block', color: 'var(--text-muted)' }}>BBC, Reuters, NDTV, Hindu, TOI...</small>
                                </div>
                                <Toggle checked={settings.topWebsitesOnly === true} onChange={(val) => updateSettings({ ...settings, topWebsitesOnly: val })} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px' }}>
                                {Object.keys(settings.newsSources || {}).map(key => (
                                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={settings.newsSources?.[key] !== false}
                                            onChange={(e) => updateNested(`newsSources.${key}`, e.target.checked)}
                                            disabled={settings.topWebsitesOnly}
                                        />
                                        {key}
                                    </label>
                                ))}
                            </div>
                        </SettingCard>

                        <SectionTitle icon="🔗" title="Custom Feeds" />
                        <SettingCard>
                             <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                <input
                                    type="text"
                                    value={newFeedUrl}
                                    onChange={(e) => setNewFeedUrl(e.target.value)}
                                    placeholder="RSS URL..."
                                    className="settings-input"
                                />
                                <button className="btn btn--primary" onClick={handleAddFeed} disabled={isDiscovering}>
                                    {isDiscovering ? '...' : 'Add'}
                                </button>
                            </div>
                            {discoveryError && <div style={{color:'red', fontSize:'0.75rem'}}>{discoveryError}</div>}
                            {settings.customFeeds?.map((feed, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '5px 0' }}>
                                    <span>{feed.title || feed.url}</span>
                                    <button onClick={() => removeCustomFeed(i)} style={{color:'red'}}>✕</button>
                                </div>
                            ))}
                        </SettingCard>
                    </div>
                );

            case 'upahead':
                return (
                    <div className="settings-tab-content">
                        <SectionTitle icon="🗓️" title="Up Ahead Configuration" />
                        <SettingCard>
                            <div className="settings-item__label" style={{marginBottom:'10px'}}>Active Categories</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom:'15px' }}>
                                {['movies', 'events', 'festivals', 'alerts', 'sports'].map(cat => (
                                    <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                                        <input
                                            type="checkbox"
                                            checked={settings.upAhead?.categories?.[cat] !== false}
                                            onChange={(e) => updateNested(`upAhead.categories.${cat}`, e.target.checked)}
                                        />
                                        {cat}
                                    </label>
                                ))}
                            </div>

                            <div className="settings-item__label" style={{marginBottom:'5px'}}>Locations</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom:'15px' }}>
                                {['Chennai', 'Muscat', 'Trichy'].map(loc => (
                                    <label key={loc} className={`chip-checkbox ${settings.upAhead?.locations?.includes(loc) ? 'active' : ''}`}>
                                        <input
                                            type="checkbox" style={{ display: 'none' }}
                                            checked={settings.upAhead?.locations?.includes(loc) || false}
                                            onChange={(e) => {
                                                const current = settings.upAhead?.locations || [];
                                                const next = e.target.checked ? [...current, loc] : current.filter(l => l !== loc);
                                                updateNested('upAhead.locations', next);
                                            }}
                                        />
                                        {loc}
                                    </label>
                                ))}
                            </div>
                        </SettingCard>

                        <SectionTitle icon="🏷️" title="Keywords Filtering" />
                        <SettingCard>
                            <KeywordInput
                                label="🎬 Movie Keywords (Positive)"
                                placeholder="e.g. ticket, release"
                                value={keywordInputs.movies}
                                onChange={(val) => setKeywordInputs({...keywordInputs, movies: val})}
                                onAdd={() => addKeyword('movies', keywordInputs.movies)}
                                items={settings.upAhead?.keywords?.movies || []}
                                onRemove={(w) => removeKeyword('movies', w)}
                            />
                            <KeywordInput
                                label="🎤 Event Keywords (Positive)"
                                placeholder="e.g. concert, standup"
                                value={keywordInputs.events}
                                onChange={(val) => setKeywordInputs({...keywordInputs, events: val})}
                                onAdd={() => addKeyword('events', keywordInputs.events)}
                                items={settings.upAhead?.keywords?.events || []}
                                onRemove={(w) => removeKeyword('events', w)}
                            />
                            <KeywordInput
                                label="🚫 Negative Keywords (Filter Out)"
                                placeholder="e.g. review, gossip"
                                value={keywordInputs.negative}
                                onChange={(val) => setKeywordInputs({...keywordInputs, negative: val})}
                                onAdd={() => addKeyword('negative', keywordInputs.negative)}
                                items={settings.upAhead?.keywords?.negative || []}
                                onRemove={(w) => removeKeyword('negative', w)}
                            />
                        </SettingCard>
                    </div>
                );

            case 'market':
                return (
                    <div className="settings-tab-content">
                        <SectionTitle icon="📈" title="Market Display" />
                        <SettingCard>
                            {Object.keys(settings.market || {}).filter(k => k.startsWith('show')).map(key => (
                                <SettingItem key={key} label={key.replace('show', '')}>
                                    <Toggle checked={settings.market?.[key] !== false} onChange={(val) => updateNested(`market.${key}`, val)} />
                                </SettingItem>
                            ))}
                        </SettingCard>
                    </div>
                );

            case 'advanced':
                return (
                    <div className="settings-tab-content">
                        <SectionTitle icon="🔧" title="Advanced" />
                        <SettingCard>
                            <SettingItem label="Enable News Cache" subLabel="Faster loads, 5min TTL">
                                <Toggle checked={settings.enableCache !== false} onChange={(val) => updateSettings({ ...settings, enableCache: val })} />
                            </SettingItem>
                            <SettingItem label="Crawler Mode">
                                <select value={settings.crawlerMode || 'auto'} onChange={(e) => updateSettings({ ...settings, crawlerMode: e.target.value })} className="settings-select">
                                    <option value="auto">Auto</option>
                                    <option value="manual">Manual</option>
                                </select>
                            </SettingItem>
                            <SettingItem label="Debug Logs">
                                <Toggle checked={settings.debugLogs === true} onChange={(val) => updateSettings({ ...settings, debugLogs: val })} />
                            </SettingItem>
                        </SettingCard>
                    </div>
                );

            default: return null;
        }
    };

    return (
        <>
            <Header title="Settings" showBack backTo="/" />
            <div className="settings-layout">
                {/* SIDEBAR TABS */}
                <div className="settings-sidebar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`settings-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className="tab-icon">{tab.icon}</span>
                            <span className="tab-label">{tab.label}</span>
                        </button>
                    ))}

                    <div style={{marginTop:'auto', paddingTop:'20px'}}>
                        <button className="btn btn--primary btn--full" onClick={handleSave} style={{marginBottom:'10px', fontSize:'0.85rem'}}>
                            {saved ? '✓ Saved' : 'Save'}
                        </button>
                        <button className="btn btn--danger btn--full" onClick={handleReset} style={{fontSize:'0.85rem'}}>
                            Reset
                        </button>
                    </div>
                </div>

                {/* CONTENT AREA */}
                <div className="settings-content">
                    {renderContent()}
                </div>
            </div>

            <style>{`
                .settings-layout {
                    display: flex;
                    height: calc(100vh - 60px); /* Adjust for header */
                    background: var(--bg-primary);
                }
                .settings-sidebar {
                    width: 80px; /* Mobile width (icons) */
                    background: var(--bg-secondary);
                    border-right: 1px solid var(--border-default);
                    display: flex;
                    flex-direction: column;
                    padding: 10px 5px;
                    overflow-y: auto;
                    flex-shrink: 0;
                }
                @media (min-width: 600px) {
                    .settings-sidebar {
                        width: 200px;
                        padding: 20px 10px;
                    }
                }
                .settings-tab-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 12px 5px;
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                    border-radius: 8px;
                    margin-bottom: 5px;
                    transition: all 0.2s;
                }
                @media (min-width: 600px) {
                    .settings-tab-btn {
                        flex-direction: row;
                        justify-content: flex-start;
                        padding: 10px 15px;
                        gap: 12px;
                    }
                }
                .settings-tab-btn.active {
                    background: var(--accent-primary);
                    color: #fff;
                }
                .tab-icon { font-size: 1.5rem; }
                .tab-label {
                    font-size: 0.7rem;
                    margin-top: 4px;
                    text-align: center;
                    display: block;
                }
                @media (min-width: 600px) {
                    .tab-label { font-size: 0.9rem; margin-top: 0; text-align: left; }
                }

                .settings-content {
                    flex: 1;
                    padding: 15px;
                    overflow-y: auto;
                }
                @media (min-width: 600px) {
                    .settings-content { padding: 30px; }
                }

                .settings-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-md);
                    padding: 15px;
                    margin-bottom: 20px;
                    border: 1px solid var(--border-default);
                }
                .section-title {
                    font-size: 1.1rem;
                    font-weight: 600;
                    margin-bottom: 12px;
                    color: var(--text-primary);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .settings-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .settings-item:last-child { border-bottom: none; }
                .settings-item__label span { display: block; font-weight: 500; font-size: 0.9rem; }
                .settings-item__label small { color: var(--text-muted); font-size: 0.75rem; }

                .settings-select, .settings-input, .settings-input-number {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-default);
                    color: var(--text-primary);
                    padding: 8px;
                    border-radius: 4px;
                    font-size: 0.85rem;
                }
                .settings-input { width: 100%; }

                .chip-checkbox {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    border-radius: 16px;
                    border: 1px solid var(--border-default);
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    font-size: 0.8rem;
                    cursor: pointer;
                }
                .chip-checkbox.active {
                    background: var(--accent-primary);
                    color: #fff;
                    border-color: var(--accent-primary);
                }

                .keyword-chip {
                    display: inline-flex;
                    align-items: center;
                    padding: 4px 8px;
                    background: var(--bg-tertiary);
                    border-radius: 4px;
                    margin: 2px;
                    font-size: 0.75rem;
                }
                .keyword-chip button {
                    background: none;
                    border: none;
                    color: var(--accent-danger);
                    margin-left: 6px;
                    cursor: pointer;
                    padding: 0;
                }
            `}</style>
        </>
    );
}

// Sub-components for cleaner render code
const SectionTitle = ({ icon, title }) => (
    <div className="section-title">
        <span>{icon}</span> {title}
    </div>
);

const SettingCard = ({ children }) => (
    <div className="settings-card">{children}</div>
);

const SettingItem = ({ label, subLabel, children }) => (
    <div className="settings-item">
        <div className="settings-item__label">
            <span>{label}</span>
            {subLabel && <small>{subLabel}</small>}
        </div>
        <div style={{ flex: '0 0 auto', marginLeft: '10px' }}>
            {children}
        </div>
    </div>
);

const KeywordInput = ({ label, placeholder, value, onChange, onAdd, items, onRemove }) => (
    <div style={{ marginBottom: '15px' }}>
        <div className="settings-item__label" style={{ marginBottom: '6px' }}>{label}</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="settings-input"
                onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            />
            <button className="btn btn--secondary" onClick={onAdd} style={{padding:'0 15px'}}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {items.map((item, i) => (
                <span key={i} className="keyword-chip">
                    {item}
                    <button onClick={() => onRemove(item)}>×</button>
                </span>
            ))}
            {items.length === 0 && <span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>No keywords set</span>}
        </div>
    </div>
);

export default SettingsPage;
